const prisma = require("../config/database");
const graphService = require("./graph.service");
const forwarderService = require("./forwarder.service");
const config = require("../config");

/**
 * Mail Sync Service
 * Orchestrates the syncing and forwarding of emails
 */
class SyncService {
  /**
   * Small delay helper to avoid hitting rate limits
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Process a single message
   */
  async processMessage(message, accountId, accountEmail, forwardedIds) {
    // Skip if already forwarded (check from pre-loaded set)
    if (forwardedIds.has(message.id)) {
      return { status: "skipped" };
    }

    const subject = message.subject || "(No Subject)";
    const from = message.from?.emailAddress?.address || "unknown";
    console.log(`      → Processing: "${subject}" from ${from}`);

    // Small delay before fetching message details (rate limit protection)
    await this.sleep(300);

    // Get full message (attachments handled by Graph forward)
    let fullMessage;
    try {
      fullMessage = await graphService.getMessage(accountId, message.id);
    } catch (error) {
      // Message was deleted before we could process it
      if (error.response?.status === 404) {
        console.log(`      ⊘ Message deleted, skipping`);
        return { status: "skipped" };
      }
      throw error;
    }

    // Forward the message via Graph API directly
    console.log(`      → Forwarding via Graph API...`);
    await forwarderService.forwardGraphMessage(
      fullMessage,
      [],
      accountEmail,
      accountId,
    );

    // Small delay after forwarding (rate limit protection)
    await this.sleep(forwarderService.forwardDelayMs);

    console.log(`      ✓ Message forwarded successfully`);

    // Increment forwarded counter on the account
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: { forwardedCount: { increment: 1 } },
    });

    // Log successful forward to DB (for dedup tracking)
    await forwarderService.logForward(accountId, fullMessage, "FORWARDED");

    return { status: "forwarded", subject };
  }

  /**
   * Sync a single mailbox
   * @param {string} accountId
   * @returns {object} - Sync result
   */
  async syncMailbox(accountId) {
    const account = await prisma.mailAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    // Allow CONNECTED and ERROR status (ERROR accounts can try again)
    if (account.status !== "CONNECTED" && account.status !== "ERROR") {
      return { skipped: true, reason: account.status };
    }

    const result = {
      accountId,
      email: account.email,
      messagesFound: 0,
      messagesForwarded: 0,
      messagesFailed: 0,
      messagesSkipped: 0,
      errors: [],
    };

    try {
      // Get new messages via delta
      const req = await graphService.getDeltaMessages(accountId);
      const messages = req.messages;
      result.messagesFound = messages.length;

      if (messages.length === 0) {
        // No messages, just update sync time
        await prisma.mailAccount.update({
          where: { id: accountId },
          data: {
            lastSyncAt: new Date(),
            lastError: null,
            errorCount: 0,
            status: "CONNECTED", // Reset to CONNECTED after successful sync
          },
        });
        return result;
      }

      // Bulk load already forwarded message IDs for this account
      const forwardedLogs = await prisma.mailMessageLog.findMany({
        where: {
          accountId,
          graphMessageId: { in: messages.map((m) => m.id) },
          forwardStatus: "FORWARDED",
        },
        select: { graphMessageId: true },
      });
      const forwardedIds = new Set(forwardedLogs.map((l) => l.graphMessageId));

      // Process messages sequentially to respect rate limits
      // Each message has built-in delays for API calls and forwarding
      const BATCH_SIZE = 2;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((msg) =>
            this.processMessage(msg, accountId, account.email, forwardedIds),
          ),
        );

        // Small delay between batches
        if (i + BATCH_SIZE < messages.length) {
          await this.sleep(500);
        }

        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (r.status === "fulfilled") {
            if (r.value.status === "forwarded") result.messagesForwarded++;
            else if (r.value.status === "skipped") result.messagesSkipped++;
          } else {
            result.messagesFailed++;
            result.errors.push({
              messageId: batch[j].id,
              error: r.reason?.message,
            });
            // Log failure to DB (errors only)
            await forwarderService.logForward(
              accountId,
              batch[j],
              "FAILED",
              r.reason?.message,
            );
            // Increment failed counter on account
            await prisma.mailAccount.update({
              where: { id: accountId },
              data: { failedForwardCount: { increment: 1 } },
            });
          }
        }
      }

      // Update account sync time
      // Calculate lastMessageAt safely (avoid invalid dates)
      let lastMessageAt = undefined;
      if (messages.length > 0) {
        const validDates = messages
          .map((m) => new Date(m.receivedDateTime))
          .filter((d) => !isNaN(d.getTime()));
        if (validDates.length > 0) {
          lastMessageAt = new Date(
            Math.max(...validDates.map((d) => d.getTime())),
          );
        }
      }

      await prisma.mailAccount.update({
        where: { id: accountId },
        data: {
          lastSyncAt: new Date(),
          ...(lastMessageAt && { lastMessageAt }),
          lastError: null,
          errorCount: 0,
          status: "CONNECTED", // Reset to CONNECTED after successful sync
        },
      });

      return result;
    } catch (error) {
      console.error(`[${account.email}] Sync error:`, error.message);

      // Check if this is an auth error
      const needsReauth =
        error.message.includes("Token refresh failed") ||
        error.message.includes("InvalidAuthenticationToken") ||
        error.message.includes("token") ||
        error.response?.status === 401;

      const newErrorCount = account.errorCount + 1;

      // Update account status
      await prisma.mailAccount.update({
        where: { id: accountId },
        data: {
          lastError: error.message,
          errorCount: newErrorCount,
          status: needsReauth ? "NEEDS_REAUTH" : account.status,
        },
      });

      // Send appropriate notification
      if (needsReauth) {
        // For auth errors: send reauth notification
        await forwarderService.sendReauthNotification(
          account.email,
          accountId,
          error.message,
        );
      } else {
        // For other errors: send error notification (only once per 5 errors to avoid spam)
        if (newErrorCount === 1 || newErrorCount % 5 === 0) {
          await forwarderService.sendErrorNotification(
            account.email,
            accountId,
            error.message,
          );
        }
      }

      // Return error result instead of throwing (don't stop other accounts)
      result.errors.push({ error: error.message });
      return result;
    }
  }

  /**
   * Sync all active mailboxes (parallel)
   */
  async syncAllMailboxes() {
    const accounts = await prisma.mailAccount.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        isEnabled: true,
      },
      select: { id: true, email: true },
    });

    // Process accounts in parallel (batch of 2)
    const results = [];
    const BATCH_SIZE = 2;

    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((account) => this.syncMailbox(account.id)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const r = batchResults[j];
        if (r.status === "fulfilled") {
          results.push(r.value);
        } else {
          results.push({
            accountId: batch[j].id,
            email: batch[j].email,
            error: r.reason?.message,
          });
        }
      }
    }

    return results;
  }

  /**
   * Retry failed messages
   */
  async retryFailedMessages() {
    const failedMessages = await forwarderService.getFailedMessages();

    if (failedMessages.length === 0) {
      return { total: 0, succeeded: 0, failed: 0 };
    }

    const results = { total: failedMessages.length, succeeded: 0, failed: 0 };

    // Process retries sequentially to respect rate limits
    for (const log of failedMessages) {
      try {
        const success = await this.retryMessage(log);
        if (success) results.succeeded++;
        else results.failed++;
      } catch {
        results.failed++;
      }
      // Delay between retries
      await this.sleep(800);
    }

    return results;
  }

  /**
   * Retry a single failed message
   */
  async retryMessage(log) {
    try {
      // Small delay before retry (rate limit protection)
      await this.sleep(500);

      const fullMessage = await graphService.getMessage(
        log.accountId,
        log.graphMessageId,
      );

      await forwarderService.forwardGraphMessage(
        fullMessage,
        [],
        log.account.email,
        log.accountId,
      );

      // Small delay after forwarding
      await this.sleep(forwarderService.forwardDelayMs);

      await prisma.mailMessageLog.update({
        where: { id: log.id },
        data: {
          forwardStatus: "FORWARDED",
          lastAttemptAt: new Date(),
          error: null,
        },
      });

      // Increment forwarded counter, decrement failed counter
      await prisma.mailAccount.update({
        where: { id: log.accountId },
        data: {
          forwardedCount: { increment: 1 },
          failedForwardCount: { decrement: 1 },
        },
      });

      return true;
    } catch (error) {
      await prisma.mailMessageLog.update({
        where: { id: log.id },
        data: {
          attempts: log.attempts + 1,
          lastAttemptAt: new Date(),
          error: error.message,
          forwardStatus:
            log.attempts + 1 >= config.worker.maxRetries ? "FAILED" : "PENDING",
        },
      });
      return false;
    }
  }

  /**
   * Get sync statistics
   */
  async getStatistics() {
    const [accounts, accountAggregates] = await Promise.all([
      prisma.mailAccount.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.mailAccount.aggregate({
        _sum: {
          forwardedCount: true,
          failedForwardCount: true,
        },
      }),
    ]);

    const accountStats = { total: 0, connected: 0, needsReauth: 0, error: 0 };
    accounts.forEach((a) => {
      accountStats.total += a._count;
      if (a.status === "CONNECTED") accountStats.connected = a._count;
      if (a.status === "NEEDS_REAUTH") accountStats.needsReauth = a._count;
      if (a.status === "ERROR") accountStats.error = a._count;
    });

    const messageStats = {
      total:
        (accountAggregates._sum.forwardedCount || 0) +
        (accountAggregates._sum.failedForwardCount || 0),
      forwarded: accountAggregates._sum.forwardedCount || 0,
      failed: accountAggregates._sum.failedForwardCount || 0,
    };

    return { accounts: accountStats, messages: messageStats };
  }
}

module.exports = new SyncService();
