const express = require("express");
const router = express.Router();
const Bull = require("bull");
const prisma = require("../config/database");
const config = require("../config");
const graphService = require("../services/graph.service");
const forwarderService = require("../services/forwarder.service");
const webhookService = require("../services/webhook.service");

// ---------------- Helpers / Config ----------------
function parseCsvEnv(v) {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const STEAM_ONLY = (process.env.STEAM_ONLY || "true").toLowerCase() === "true";
const STEAM_ALLOWED_DOMAINS = parseCsvEnv(
  process.env.STEAM_ALLOWED_DOMAINS,
).map((d) => d.toLowerCase());
const STEAM_ALLOWED_SENDERS = parseCsvEnv(
  process.env.STEAM_ALLOWED_SENDERS,
).map((s) => s.toLowerCase());
const STEAM_SUBJECT_KEYWORDS = parseCsvEnv(
  process.env.STEAM_SUBJECT_KEYWORDS,
).map((s) => s.toLowerCase());

// Auth error codes that mean the account needs re-auth or is suspended
const AUTH_ERROR_CODES = [
  "ErrorAccountSuspend",
  "ErrorExceededMessageLimit",
  "InvalidAuthenticationToken",
  "CompactToken.Validation",
  "InvalidSubscription",
];

// Delay between queue jobs (ms) to avoid rate limits
const FORWARD_DELAY_MS = parseInt(process.env.FORWARD_DELAY_MS, 10) || 500;

// Sleep helper for delay between forwards
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthOrSuspendError(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.error?.code || "";
  return (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    AUTH_ERROR_CODES.some((c) => code.includes(c))
  );
}

function isSteamMessage(msgPreview) {
  const fromAddress = (
    msgPreview?.from?.emailAddress?.address || ""
  ).toLowerCase();
  const subject = (msgPreview?.subject || "").toLowerCase();

  if (STEAM_ALLOWED_SENDERS.includes(fromAddress)) return true;

  const domain = fromAddress.split("@")[1] || "";
  if (domain && STEAM_ALLOWED_DOMAINS.includes(domain)) return true;

  if (STEAM_SUBJECT_KEYWORDS.length) {
    return STEAM_SUBJECT_KEYWORDS.some((k) => subject.includes(k));
  }

  return false;
}

/**
 * Build full error details for logging
 */
function buildErrorDetails(error, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    api: context.api || "unknown",
    endpoint: context.endpoint || "unknown",
    accountId: context.accountId || "unknown",
    accountEmail: context.accountEmail || "unknown",
    messageId: context.messageId || "unknown",
    status: error?.response?.status || null,
    statusText: error?.response?.statusText || null,
    errorCode: error?.response?.data?.error?.code || null,
    errorMessage: error?.response?.data?.error?.message || error.message,
    requestId: error?.response?.headers?.["request-id"] || null,
    clientRequestId: error?.response?.headers?.["client-request-id"] || null,
    stack: error.stack,
  };
}

// ---------------- Forward Queue (sequential processing) ----------------
const forwardQueue = new Bull("webhook-forward", {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  },
  defaultJobOptions: {
    attempts: 1, // No retry
    removeOnComplete: true, // Remove immediately after success
    removeOnFail: 100, // Keep some failed jobs for debugging
  },
});

// Process ONE job at a time (concurrency = 1) => sequential forwarding
forwardQueue.process(1, async (job) => {
  const { accountId, accountEmail, messageId } = job.data;

  try {
    // 1. Read message preview (lightweight)
    const msgPreview = await graphService.getMessagePreview(
      accountId,
      messageId,
    );

    if (!msgPreview) {
      console.log(`[Queue] Message ${messageId} not found or deleted`);
      return { status: "NOT_FOUND" };
    }

    // 2. Steam-only filter
    if (STEAM_ONLY && !isSteamMessage(msgPreview)) {
      console.log(`[Queue] Not Steam email, skipping: ${messageId}`);
      // Don't log SKIPPED to database - just skip silently
      return { status: "SKIPPED" };
    }

    const subject = msgPreview.subject || "(No Subject)";
    const from = msgPreview.from?.emailAddress?.address || "unknown";
    console.log(`[Queue] Processing: "${subject}" from ${from}`);

    // 3. Forward using Graph API
    await forwarderService.forwardGraphMessage(
      msgPreview,
      [],
      accountEmail,
      accountId,
    );

    console.log(`[Queue] ✓ Message forwarded successfully`);

    // 4. Update counters only (no database record for success)
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: {
        forwardedCount: { increment: 1 },
        lastSyncAt: new Date(),
        lastMessageAt: msgPreview.receivedDateTime
          ? new Date(msgPreview.receivedDateTime)
          : new Date(),
      },
    });

    // 5. DELAY before next job to avoid rate limits
    console.log(`[Queue] Waiting ${FORWARD_DELAY_MS}ms before next forward...`);
    await sleep(FORWARD_DELAY_MS);

    return { status: "FORWARDED" };
  } catch (error) {
    // Build full error details
    const errorDetails = buildErrorDetails(error, {
      api: "Microsoft Graph API",
      endpoint: "POST /messages/{id}/forward",
      accountId,
      accountEmail,
      messageId,
    });

    // Full console log
    console.error("[Queue] ========== ERROR DETAILS ==========");
    console.error(JSON.stringify(errorDetails, null, 2));
    console.error("[Queue] ====================================");

    // Log failure to database
    await prisma.mailMessageLog.upsert({
      where: {
        accountId_graphMessageId: { accountId, graphMessageId: messageId },
      },
      create: {
        accountId,
        graphMessageId: messageId,
        forwardStatus: "FAILED",
        error: JSON.stringify(errorDetails),
        attempts: 1,
        lastAttemptAt: new Date(),
      },
      update: {
        forwardStatus: "FAILED",
        error: JSON.stringify(errorDetails),
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    // Increment failed counter
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: { failedForwardCount: { increment: 1 } },
    });

    // If auth/suspend/quota error => mark account as ERROR + send reauth to BOTH dev and forward email
    if (isAuthOrSuspendError(error)) {
      console.log(
        `[Queue] Account ${accountEmail} needs re-auth, marking as ERROR`,
      );
      await prisma.mailAccount.update({
        where: { id: accountId },
        data: { status: "ERROR" },
      });

      // Send reauth notification to BOTH dev and forward email (with reconnect button)
      await forwarderService.sendReauthNotification(
        accountEmail,
        accountId,
        JSON.stringify(errorDetails, null, 2),
      );
    } else {
      // General error => send error to developer ONLY
      await forwarderService.sendErrorNotificationToDev(
        accountEmail,
        accountId,
        errorDetails,
      );
    }

    throw error; // Mark job as failed
  }
});

forwardQueue.on("failed", (job, err) => {
  console.error(`[Queue] Job ${job.id} failed: ${err.message}`);
});

/**
 * Webhook endpoint for Microsoft Graph notifications
 * POST /api/webhooks/mail
 *
 * Handles:
 * 1) Validation requests from Microsoft (when creating subscription)
 * 2) Change notifications when new emails arrive
 *
 * Important:
 * - Must reply within ~3 seconds => we return 202 immediately
 * - Notifications are added to a Queue for sequential processing
 */
router.post("/mail", async (req, res) => {
  // Validation
  if (req.query.validationToken) {
    console.log("[Webhook] Validation request received");
    res.set("Content-Type", "text/plain");
    return res.status(200).send(req.query.validationToken);
  }

  try {
    const notifications = req.body?.value || [];
    if (notifications.length === 0) {
      return res.status(202).send();
    }

    // Respond immediately (required within 3 seconds)
    res.status(202).send();

    // Add each notification to the queue (processed sequentially)
    for (const notification of notifications) {
      try {
        await enqueueNotification(notification);
      } catch (error) {
        console.error("[Webhook] Error enqueuing notification:", error.message);
      }
    }
  } catch (error) {
    console.error("[Webhook] Error handling notifications:", error.message);
    if (!res.headersSent) res.status(202).send();
  }
});

/**
 * Validate notification and add to forward queue
 */
async function enqueueNotification(notification) {
  const { subscriptionId, clientState, resource, resourceData } = notification;

  // Validate notification (clientState + subscriptionId)
  const subscription = await webhookService.validateNotification(
    clientState,
    subscriptionId,
  );

  if (!subscription) {
    console.warn("[Webhook] Invalid notification, skipping");
    return;
  }

  const accountId = subscription.accountId;

  // Get account info
  const account = await prisma.mailAccount.findUnique({
    where: { id: accountId },
    select: { id: true, email: true, status: true, isEnabled: true },
  });

  if (!account || account.status !== "CONNECTED" || !account.isEnabled) {
    console.log(`[Webhook] Account ${accountId} not active, skipping`);
    return;
  }

  // Extract message ID
  const messageId = resourceData?.id || resource?.split("/messages/")[1];

  if (!messageId) {
    console.warn("[Webhook] No message ID in notification");
    return;
  }

  console.log(`[Webhook] New message for ${account.email}: ${messageId}`);

  // Add to forward queue (will be processed sequentially)
  await forwardQueue.add(
    {
      accountId,
      accountEmail: account.email,
      messageId,
    },
    { jobId: `${accountId}:${messageId}` }, // Prevent duplicate jobs
  );
}

module.exports = router;
