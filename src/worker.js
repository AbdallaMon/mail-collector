require("dotenv").config();

const Bull = require("bull");
const config = require("./config");
const prisma = require("./config/database");
const syncService = require("./services/sync.service");

/**
 * Mail Collector Worker with Redis Queue
 * - Prevents duplicate processing (unique jobs per accountId)
 * - Automatic retry with exponential backoff
 * - Proper queue management
 */

const timestamp = () => new Date().toLocaleTimeString();
const log = (msg) => console.log(`[${timestamp()}] ${msg}`);
const logError = (msg) => console.error(`[${timestamp()}] ✗ ${msg}`);

// Create Bull queue
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

/**
 * Process sync jobs from queue
 */
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

/**
 * Process retry failed messages
 */
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

/**
 * Queue event listeners
 */
syncQueue.on("failed", (job, error) => {
  logError(
    `Job failed: ${job.name} - ${error.message} (attempt ${job.attemptsMade}/${job.opts.attempts})`,
  );
});

syncQueue.on("stalled", (job) => {
  log(`⚠ Job stalled: ${job.name}`);
});

/**
 * Schedule sync jobs for all connected accounts
 * Only adds job if no existing job for that accountId is waiting/active
 */
const scheduleAllSyncs = async () => {
  try {
    const accounts = await prisma.mailAccount.findMany({
      where: { status: "CONNECTED", isEnabled: true },
      select: { id: true, email: true },
    });

    if (accounts.length === 0) {
      log("No accounts to sync");
      return;
    }

    log(`\n=== Sync cycle (${accounts.length} account(s)) ===\n`);

    // Get waiting/active jobs to avoid duplicates
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
      // Skip if already in queue
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

    // Schedule retry job (only if not already queued)
    const hasRetryJob = existingJobs.some((job) => job.name === "retry-failed");
    if (!hasRetryJob) {
      await syncQueue.add("retry-failed", {}, { jobId: `retry-${Date.now()}` });
    }
  } catch (error) {
    logError(`Failed to schedule syncs: ${error.message}`);
  }
};

/**
 * Start the worker
 */
const startWorker = async () => {
  try {
    await prisma.$connect();
    log("Database connected");

    // Test Redis connection
    await syncQueue.isReady();
    log("Redis connected");

    const secs = Math.round(config.worker.pollIntervalMs / 1000);
    console.log(`\n🚀 Worker started`);
    console.log(`   Schedule: every ${secs} seconds`);
    console.log(`   Concurrency: ${config.worker.concurrency} jobs\n`);

    // Initial sync
    await scheduleAllSyncs();

    // Schedule recurring syncs
    setInterval(scheduleAllSyncs, config.worker.pollIntervalMs);
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
