require("dotenv").config();

const Bull = require("bull");
const config = require("./config");
const prisma = require("./config/database");
// const syncService = require("./services/sync.service"); // DISABLED: Using webhooks instead
const webhookService = require("./services/webhook.service");

/**
 * Mail Collector Worker - Webhooks Only Mode
 *
 * PRIMARY: Webhooks for real-time notifications (instant)
 * FALLBACK: DISABLED (commented out to avoid conflicts)
 *
 * - Automatic webhook subscription renewal (every hour)
 */

const timestamp = () => new Date().toLocaleTimeString();
const log = (msg) => console.log(`[${timestamp()}] ${msg}`);
const logError = (msg) => console.error(`[${timestamp()}] ✗ ${msg}`);

// DISABLED: Fallback polling (using webhooks only)
// const FALLBACK_POLL_INTERVAL_MS = 60000; // 60 seconds

// Webhook renewal interval (every hour)
const WEBHOOK_RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Create Bull queue (still needed for potential future use)
const syncQueue = new Bull("mail-sync", {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

/*
// ============================================================
// DISABLED: Old polling-based sync (using webhooks instead)
// ============================================================

syncQueue.process("sync-mailbox", config.worker.concurrency, async (job) => {
  const { accountId, email } = job.data;

  log(`📧 Processing: ${email}`);

  try {
    const res = await syncService.syncMailbox(accountId);

    if (res.messagesFound > 0) {
      log(`   Found ${res.messagesFound} message(s)`);
      log(`   ✓ Forwarded: ${res.messagesForwarded}`);
      if (res.messagesFailed > 0) {
        log(`   ✗ Failed: ${res.messagesFailed}`);
      }
      if (res.messagesSkipped > 0) {
        log(`   ⊘ Skipped: ${res.messagesSkipped}`);
      }
      if (res.errors.length > 0) {
        res.errors.forEach((e) => logError(`   ${e.error}`));
      }
    } else {
      log(`   ✓ No new messages`);
    }

    return res;
  } catch (error) {
    logError(`${email}: ${error.message}`);
    throw error;
  }
});

syncQueue.process("retry-failed", 1, async (job) => {
  const result = await syncService.retryFailedMessages();

  if (result.total > 0) {
    log(`Retrying ${result.total} failed message(s)...`);
    log(`   ✓ Succeeded: ${result.succeeded}`);
    if (result.failed > 0) {
      log(`   ✗ Failed: ${result.failed}`);
    }
  }

  return result;
});

const scheduleAllSyncs = async () => {
  try {
    const accounts = await prisma.mailAccount.findMany({
      where: { status: { in: ["CONNECTED", "ERROR"] }, isEnabled: true },
      select: { id: true, email: true },
    });

    if (accounts.length === 0) {
      log("No accounts to sync");
      return;
    }

    log(`\n=== Sync cycle (${accounts.length} account(s)) ===\n`);

    const existingJobs = await syncQueue.getJobs([
      "waiting",
      "active",
      "delayed",
    ]);
    const pendingAccountIds = new Set(
      existingJobs
        .filter((job) => job.name === "sync-mailbox")
        .map((job) => job.data.accountId),
    );

    let added = 0;
    let skipped = 0;

    for (const account of accounts) {
      if (pendingAccountIds.has(account.id)) {
        skipped++;
        continue;
      }

      await syncQueue.add(
        "sync-mailbox",
        { accountId: account.id, email: account.email },
        { jobId: `sync-${account.id}-${Date.now()}` },
      );
      added++;
    }

    if (added > 0) {
      log(`Queued ${added} account(s)`);
    }
    if (skipped > 0) {
      log(`Skipped ${skipped} (already queued)`);
    }

    const hasRetryJob = existingJobs.some((job) => job.name === "retry-failed");
    if (!hasRetryJob) {
      await syncQueue.add("retry-failed", {}, { jobId: `retry-${Date.now()}` });
    }
  } catch (error) {
    logError(`Failed to schedule syncs: ${error.message}`);
  }
};

// END DISABLED SECTION
*/

/**
 * Renew expiring webhook subscriptions
 */
const renewWebhookSubscriptions = async () => {
  try {
    log("\n=== Webhook subscription maintenance ===\n");

    // First, create subscriptions for accounts that don't have one
    const createResult = await webhookService.createMissingSubscriptions();
    if (createResult.created > 0 || createResult.failed > 0) {
      log(`Created: ${createResult.created}, Failed: ${createResult.failed}`);
    }

    // Then, renew expiring subscriptions
    const renewResult = await webhookService.renewExpiringSubscriptions();
    if (renewResult.renewed > 0 || renewResult.failed > 0) {
      log(`Renewed: ${renewResult.renewed}, Failed: ${renewResult.failed}`);
    }

    if (createResult.created === 0 && renewResult.renewed === 0) {
      log("All subscriptions are up to date");
    }
  } catch (error) {
    logError(`Webhook maintenance failed: ${error.message}`);
  }
};

/**
 * Start the worker (Webhooks only mode)
 */
const startWorker = async () => {
  try {
    await prisma.$connect();
    log("Database connected");

    // Test Redis connection
    await syncQueue.isReady();
    log("Redis connected");

    console.log(`\n🚀 Worker started (Webhooks Only Mode)`);
    console.log(`   Mode: Real-time webhooks`);
    console.log(
      `   Webhook renewal: every ${WEBHOOK_RENEWAL_INTERVAL_MS / 1000 / 60} minutes`,
    );
    console.log(`   Fallback polling: DISABLED\n`);

    // Initial webhook subscription setup
    await renewWebhookSubscriptions();

    // DISABLED: Initial fallback sync
    // await scheduleAllSyncs();

    // DISABLED: Schedule recurring fallback syncs
    // setInterval(scheduleAllSyncs, FALLBACK_POLL_INTERVAL_MS);

    // Schedule webhook subscription renewal (every hour)
    setInterval(renewWebhookSubscriptions, WEBHOOK_RENEWAL_INTERVAL_MS);
  } catch (error) {
    logError(`Failed to start worker: ${error.message}`);
    console.log("\n⚠ Make sure Redis is running!");
    console.log(
      "  - Windows: Download from https://github.com/microsoftarchive/redis/releases",
    );
    console.log("  - Or use Docker: docker run -p 6379:6379 redis\n");
    process.exit(1);
  }
};

/**
 * Graceful shutdown
 */
const shutdown = async () => {
  log("Shutting down...");

  await syncQueue.close();
  await prisma.$disconnect();

  log("Worker shutdown complete");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start worker
startWorker();
