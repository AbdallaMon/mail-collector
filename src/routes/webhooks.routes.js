const express = require("express");
const router = express.Router();
const prisma = require("../config/database");
const graphService = require("../services/graph.service");
const forwarderService = require("../services/forwarder.service");
const webhookService = require("../services/webhook.service");

// ---------------- Helpers / Config ----------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

const FORWARD_DELAY_MS = parseInt(process.env.FORWARD_DELAY_MS || "5000", 10);

function isSteamMessage(fullMessage) {
  const fromAddress = (
    fullMessage?.from?.emailAddress?.address || ""
  ).toLowerCase();
  const subject = (fullMessage?.subject || "").toLowerCase();

  // 1) Exact allowed sender
  if (STEAM_ALLOWED_SENDERS.includes(fromAddress)) return true;

  // 2) Domain allowed
  const domain = fromAddress.split("@")[1] || "";
  if (domain && STEAM_ALLOWED_DOMAINS.includes(domain)) return true;

  // 3) Keywords fallback
  if (STEAM_SUBJECT_KEYWORDS.length) {
    return STEAM_SUBJECT_KEYWORDS.some((k) => subject.includes(k));
  }

  return false;
}

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
 * - Then we process async
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

    // Respond immediately (required)
    res.status(202).send();

    // Process notifications async
    for (const notification of notifications) {
      try {
        await processNotification(notification);
      } catch (error) {
        console.error(
          "[Webhook] Error processing notification:",
          error.message,
        );
      }
    }
  } catch (error) {
    console.error("[Webhook] Error handling notifications:", error.message);
    if (!res.headersSent) res.status(202).send();
  }
});

/**
 * Process a single notification
 */
async function processNotification(notification) {
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

  // Extract message ID from resource
  // Resource format: /me/mailFolders('Inbox')/messages/{messageId}
  const messageId = resourceData?.id || resource?.split("/messages/")[1];

  if (!messageId) {
    console.warn("[Webhook] No message ID in notification");
    return;
  }

  console.log(`[Webhook] New message for ${account.email}: ${messageId}`);

  try {
    // Get full message
    const fullMessage = await graphService.getMessage(accountId, messageId);

    if (!fullMessage) {
      console.log(`[Webhook] Message ${messageId} not found or deleted`);
      return;
    }

    // ✅ Dedup: لو الرسالة اتفورت قبل كده خلاص
    const existingLog = await prisma.mailMessageLog.findUnique({
      where: {
        accountId_graphMessageId: {
          accountId,
          graphMessageId: messageId,
        },
      },
      select: { forwardStatus: true },
    });

    if (existingLog?.forwardStatus === "FORWARDED") {
      console.log(
        `[Webhook] Duplicate notification, already forwarded: ${messageId}`,
      );
      return;
    }

    // ✅ Steam-only filter
    if (STEAM_ONLY && !isSteamMessage(fullMessage)) {
      console.log(`[Webhook] Not Steam email, skipping: ${messageId}`);

      // Optional: log as SKIPPED for visibility
      await prisma.mailMessageLog.upsert({
        where: {
          accountId_graphMessageId: { accountId, graphMessageId: messageId },
        },
        create: {
          accountId,
          graphMessageId: messageId,
          internetMessageId: fullMessage.internetMessageId,
          forwardStatus: "SKIPPED",
          error: "Skipped: not a Steam email",
          attempts: 1,
          lastAttemptAt: new Date(),
        },
        update: {
          forwardStatus: "SKIPPED",
          error: "Skipped: not a Steam email",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      return;
    }

    const subject = fullMessage.subject || "(No Subject)";
    const from = fullMessage.from?.emailAddress?.address || "unknown";
    console.log(`[Webhook] Processing: "${subject}" from ${from}`);

    // ✅ Delay 5 seconds قبل الفورورد (Rate limit + avoid burst)
    await sleep(FORWARD_DELAY_MS);

    // Forward the message
    await forwarderService.forwardGraphMessage(
      fullMessage,
      [],
      account.email,
      accountId,
    );

    console.log("[Webhook] ✓ Message forwarded successfully");

    // ✅ Log success FORWARDED (so Dedup works)
    await prisma.mailMessageLog.upsert({
      where: {
        accountId_graphMessageId: { accountId, graphMessageId: messageId },
      },
      create: {
        accountId,
        graphMessageId: messageId,
        internetMessageId: fullMessage.internetMessageId,
        forwardStatus: "FORWARDED",
        attempts: 1,
        lastAttemptAt: new Date(),
      },
      update: {
        forwardStatus: "FORWARDED",
        lastAttemptAt: new Date(),
      },
    });

    // Update counters/timestamps
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: {
        forwardedCount: { increment: 1 },
        lastSyncAt: new Date(),
        lastMessageAt: fullMessage.receivedDateTime
          ? new Date(fullMessage.receivedDateTime)
          : new Date(),
      },
    });
  } catch (error) {
    console.error(
      `[Webhook] Failed to process message ${messageId}:`,
      error.message,
    );

    // Log failure
    await prisma.mailMessageLog.upsert({
      where: {
        accountId_graphMessageId: {
          accountId,
          graphMessageId: messageId,
        },
      },
      create: {
        accountId,
        graphMessageId: messageId,
        forwardStatus: "FAILED",
        error: error.message,
        attempts: 1,
        lastAttemptAt: new Date(),
      },
      update: {
        forwardStatus: "FAILED",
        error: error.message,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    // Notify once per message failure (this webhook flow = single attempt)
    await forwarderService.sendErrorNotification(
      account.email,
      accountId,
      error.message,
    );

    // Increment failed counter
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: { failedForwardCount: { increment: 1 } },
    });
  }
}

module.exports = router;
