const express = require("express");
const router = express.Router();
const prisma = require("../config/database");
const graphService = require("../services/graph.service");
const forwarderService = require("../services/forwarder.service");
const webhookService = require("../services/webhook.service");

/**
 * Webhook endpoint for Microsoft Graph notifications
 * POST /api/webhooks/mail
 *
 * This endpoint handles:
 * 1. Validation requests from Microsoft (when creating subscription)
 * 2. Change notifications when new emails arrive
 *
 * Note: No message logging for success - only increment counter
 * Error logging is kept for debugging and notifications
 */
router.post("/mail", async (req, res) => {
  // Handle validation request from Microsoft
  if (req.query.validationToken) {
    console.log("[Webhook] Validation request received");
    res.set("Content-Type", "text/plain");
    return res.status(200).send(req.query.validationToken);
  }

  // Handle change notifications
  try {
    const notifications = req.body?.value || [];

    if (notifications.length === 0) {
      return res.status(202).send();
    }

    // Respond immediately to Microsoft (required within 3 seconds)
    res.status(202).send();

    // Process notifications asynchronously
    for (const notification of notifications) {
      try {
        await processNotification(notification);
      } catch (error) {
        console.error(
          `[Webhook] Error processing notification:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error("[Webhook] Error handling notifications:", error.message);
    // Still return 202 to prevent Microsoft from retrying
    if (!res.headersSent) {
      res.status(202).send();
    }
  }
});

/**
 * Process a single notification
 * @param {object} notification - Microsoft Graph change notification
 */
async function processNotification(notification) {
  const { subscriptionId, clientState, resource, resourceData } = notification;

  // Validate the notification
  const subscription = await webhookService.validateNotification(
    clientState,
    subscriptionId,
  );

  if (!subscription) {
    console.warn(`[Webhook] Invalid notification, skipping`);
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
    console.warn(`[Webhook] No message ID in notification`);
    return;
  }

  console.log(`[Webhook] New message for ${account.email}: ${messageId}`);

  // NOTE: Dedup check removed - Microsoft usually sends one notification per message
  // If duplicates occur, the message will be forwarded twice (acceptable trade-off)

  try {
    // Get full message
    const fullMessage = await graphService.getMessage(accountId, messageId);

    if (!fullMessage) {
      console.log(`[Webhook] Message ${messageId} not found or deleted`);
      return;
    }

    const subject = fullMessage.subject || "(No Subject)";
    const from = fullMessage.from?.emailAddress?.address || "unknown";
    console.log(`[Webhook] Processing: "${subject}" from ${from}`);

    // Forward the message
    await forwarderService.forwardGraphMessage(
      fullMessage,
      [],
      account.email,
      accountId,
    );

    console.log(`[Webhook] ✓ Message forwarded successfully`);

    // Increment forwarded counter and update timestamps (no message logging)
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: {
        forwardedCount: { increment: 1 },
        lastSyncAt: new Date(),
        lastMessageAt: new Date(fullMessage.receivedDateTime),
      },
    });

    // NOTE: Success message logging removed - only counting forwarded messages
  } catch (error) {
    console.error(
      `[Webhook] Failed to process message ${messageId}:`,
      error.message,
    );

    // Log error to database (keep for debugging)
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

    // Send error notification to forward email + dev email
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
