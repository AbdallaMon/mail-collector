const accountRepo = require("../../repositories/account.repo");
const messageLogRepo = require("../../repositories/messageLog.repo");
const graphService = require("../../services/graph.service");
const forwarderService = require("../../services/forwarder.service");
const webhookService = require("../../services/webhook.service");
const upstreamErrorPolicy = require("../../utils/upstreamErrorPolicy");
const {
  STEAM_ONLY,
  FORWARD_DELAY_MS,
  sleep,
  isAuthOrSuspendError,
  isSteamMessage,
  isImportantSender,
  buildErrorDetails,
} = require("./webhooks.policy");

class WebhooksUsecase {
  async processMessage(job) {
    const { accountId, accountEmail, messageId } = job.data;

    try {
      const account = await accountRepo.findUnique({
        where: { id: accountId },
        select: { status: true, isEnabled: true },
      });

      if (!account || account.status !== "CONNECTED" || !account.isEnabled) {
        console.log(
          `[Queue] Account ${accountEmail} not active (status: ${account?.status}), skipping job`,
        );
        return { status: "ACCOUNT_INACTIVE" };
      }

      const previous = await messageLogRepo.findUnique({
        where: {
          accountId_graphMessageId: { accountId, graphMessageId: messageId },
        },
        select: { forwardStatus: true },
      });
      if (previous?.forwardStatus === "FORWARDED") {
        return { status: "ALREADY_FORWARDED" };
      }

      // ✅ Single API call — reads body (no attachments) for both filtering & forwarding
      const message = await graphService.getMessageForWebhook(
        accountId,
        messageId,
      );
      if (!message) {
        console.log(`[Queue] Message ${messageId} not found or deleted`);
        return { status: "NOT_FOUND" };
      }
      // Keep the receiver's date-based deduplication input stable across retries.
      if (!message.receivedDateTime) {
        message.receivedDateTime = new Date(
          job.timestamp || Date.now(),
        ).toISOString();
      }

      // Steam-only filter
      if (STEAM_ONLY && !isSteamMessage(message)) {
        // SMTP for important security emails only
        if (isImportantSender(message)) {
          try {
            console.log(
              `[Queue] Important security email, sending via SMTP: ${messageId}`,
            );
            await forwarderService.sendImportantEmailViaSMTP(
              message,
              accountEmail,
            );
          } catch (smtpError) {
            console.error(
              `[Queue] Failed to send important email via SMTP: ${smtpError.message}`,
            );
          }
        }

        return { status: "SKIPPED" };
      }

      const subject = message.subject || "(No Subject)";
      const from = message.from?.emailAddress?.address || "unknown";

      const startTime = new Date();
      console.log(
        `[Queue] [${startTime.toLocaleTimeString()}.${startTime
          .getMilliseconds()
          .toString()
          .padStart(3, "0")}] 📤 Starting forward: "${subject}" from ${from}`,
      );

      // Forward to API (message already has body for parsing)
      const delivery = await forwarderService.forwardGraphMessage(
        message,
        [],
        accountEmail,
        accountId,
      );
      if (!delivery.delivered) {
        return { status: "SKIPPED", reason: delivery.reason || delivery.mode };
      }

      const endTime = new Date();
      const forwardDuration = endTime - startTime;
      console.log(
        `[Queue] [${endTime.toLocaleTimeString()}.${endTime
          .getMilliseconds()
          .toString()
          .padStart(3, "0")}] ✓ Forwarded in ${forwardDuration}ms`,
      );

      await messageLogRepo.completeForward({
        accountId,
        message,
        attempts: (job.attemptsMade || 0) + 1,
      });

      const delayStart = new Date();
      console.log(
        `[Queue] [${delayStart.toLocaleTimeString()}.${delayStart
          .getMilliseconds()
          .toString()
          .padStart(3, "0")}] ⏳ Waiting ${FORWARD_DELAY_MS}ms...`,
      );
      await sleep(FORWARD_DELAY_MS);

      const delayEnd = new Date();
      console.log(
        `[Queue] [${delayEnd.toLocaleTimeString()}.${delayEnd
          .getMilliseconds()
          .toString()
          .padStart(3, "0")}] ✓ Ready for next`,
      );

      return { status: "FORWARDED" };
    } catch (error) {
      const attempt = (job.attemptsMade || 0) + 1;
      const willRetry =
        upstreamErrorPolicy.isRetryable(error) &&
        attempt < (Number(job.opts?.attempts) || 1);
      if (!willRetry) job.discard?.();
      const errorDetails = buildErrorDetails(error, {
        api: "Microsoft Graph API",
        endpoint: "Steam->API or SMTP",
        accountId,
        accountEmail,
        messageId,
      });
      errorDetails.attempt = attempt;
      errorDetails.willRetry = willRetry;

      console.error("[Queue] ========== ERROR DETAILS ==========");
      console.error(JSON.stringify(errorDetails, null, 2));
      console.error("[Queue] ====================================");

      try {
        const failure = await messageLogRepo.recordFailure({
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
            attempts: attempt,
            lastAttemptAt: new Date(),
          },
        });

        if (!willRetry && failure.count > 0) {
          await accountRepo.update({
            where: { id: accountId },
            data: { failedForwardCount: { increment: 1 } },
          });
        }
      } catch (storageError) {
        console.error("[Queue] Failed to persist error:", storageError.message);
      }

      if (isAuthOrSuspendError(error)) {
        console.log(
          `[Queue] Account ${accountEmail} requires re-authentication`,
        );
        try {
          await accountRepo.update({
            where: { id: accountId },
            data: { status: "NEEDS_REAUTH", lastError: error.message },
          });
        } catch (storageError) {
          console.error(
            "[Queue] Failed to persist account status:",
            storageError.message,
          );
        }

        // Preserve the existing notification routes, including developer alerts
        // on retryable errors. A logging failure must not suppress an email.
        await forwarderService.sendReauthNotification(
          accountEmail,
          accountId,
          JSON.stringify(errorDetails, null, 2),
        );
      } else {
        await forwarderService.sendErrorNotificationToDev(
          accountEmail,
          accountId,
          errorDetails,
        );
      }

      throw error;
    }
  }

  async enqueueNotification(notification, forwardQueue) {
    const { subscriptionId, clientState, resource, resourceData } =
      notification;

    // Validate notification (clientState + subscriptionId)
    // log notifcaiton all
    console.log(`notifction `);

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
    const account = await accountRepo.findUnique({
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
}
module.exports = new WebhooksUsecase();
