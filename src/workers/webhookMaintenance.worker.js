const Bull = require("bull");
const config = require("../config");
const prisma = require("../config/database");
const webhookService = require("../services/webhook.service");
const accountRepo = require("../repositories/account.repo");
const upstreamErrorPolicy = require("../utils/upstreamErrorPolicy");

const timestamp = () => new Date().toLocaleTimeString();
const log = (msg) => console.log(`[${timestamp()}] ${msg}`);
const logError = (msg) => console.error(`[${timestamp()}] ✗ ${msg}`);

const WEBHOOK_RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ✅ Delays (تقدر تتحكم فيها)
const PLAN_DELAY_MS = 0; // plan job runs immediately when scheduled
const CREATE_STAGGER_MS = 300; // نفس delay اللي كنت عامله (300ms) لكن في queue
const RENEW_STAGGER_MS = 200; // نفس 200ms لكن في queue
const MAINTENANCE_LOCK_JOB_ID = "webhook:plan-maintenance:repeat";

// ✅ Concurrency منخفض عشان limits
const CREATE_CONCURRENCY = 2;
const RENEW_CONCURRENCY = 2;

class WebhookMaintenanceWorker {
  constructor() {
    this.queue = new Bull("mail-sync", {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
      },
      settings: {
        backoffStrategies: {
          upstream: upstreamErrorPolicy.backoff.bind(upstreamErrorPolicy),
        },
      },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 200,
        attempts: 5,
        backoff: { type: "upstream" },
      },
    });
    this.queue.process("webhook:plan-maintenance", 1, () =>
      this.planMaintenance(),
    );
    this.queue.process(
      "webhook:create-subscription",
      CREATE_CONCURRENCY,
      (job) => this.createSubscription(job),
    );
    this.queue.process("webhook:renew-subscription", RENEW_CONCURRENCY, (job) =>
      this.renewSubscription(job),
    );
  }

  async enqueueMaintenanceJob(name, data, jobId, delay) {
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== "completed" && state !== "failed") return false;
      await existing.remove();
    }
    await this.queue.add(name, data, {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: 200,
    });
    return true;
  }

  async canMaintain(accountId) {
    const account = await accountRepo.findUnique({
      where: { id: accountId },
      select: { status: true, isEnabled: true },
    });
    return account?.status === "CONNECTED" && account.isEnabled === true;
  }

  async planMaintenance() {
    log("\n=== Webhook maintenance planner ===\n");

    const missing = await webhookService.getAccountsNeedingSubscription();
    const expiring = await webhookService.getExpiringSubscriptions();

    if (missing.length === 0 && expiring.length === 0) {
      log("All subscriptions are up to date");
      return { createdJobs: 0, renewedJobs: 0 };
    }

    // Enqueue create jobs (staggered)
    let createdJobs = 0;
    for (let i = 0; i < missing.length; i++) {
      const account = missing[i];
      const added = await this.enqueueMaintenanceJob(
        "webhook:create-subscription",
        { accountId: account.id, email: account.email },
        `webhook:create:${account.id}`,
        i * CREATE_STAGGER_MS,
      );
      if (added) createdJobs++;
    }

    // Enqueue renew jobs (staggered)
    let renewedJobs = 0;
    for (let i = 0; i < expiring.length; i++) {
      const sub = expiring[i];
      const added = await this.enqueueMaintenanceJob(
        "webhook:renew-subscription",
        { accountId: sub.accountId },
        `webhook:renew:${sub.accountId}`,
        i * RENEW_STAGGER_MS,
      );
      if (added) renewedJobs++;
    }

    log(`Queued create: ${createdJobs}, renew: ${renewedJobs}`);
    return { createdJobs, renewedJobs };
  }

  async createSubscription(job) {
    const { accountId, email } = job.data;
    try {
      if (!(await this.canMaintain(accountId))) return { skipped: true };
      log(`+ Create subscription: ${email || accountId}`);
      await webhookService.createSubscription(accountId);
      return { ok: true };
    } catch (err) {
      logError(`Create failed for ${email || accountId}: ${err.message}`);
      throw err;
    }
  }

  async renewSubscription(job) {
    const { accountId } = job.data;
    try {
      if (!(await this.canMaintain(accountId))) return { skipped: true };
      log(`~ Renew subscription: ${accountId}`);
      await webhookService.renewSubscription(accountId);
      return { ok: true };
    } catch (err) {
      logError(`Renew failed for ${accountId}: ${err.message}`);
      throw err;
    }
  }
  async start() {
    try {
      await prisma.$connect();
      log("Database connected");

      await this.queue.isReady();
      log("Redis connected");

      console.log(`\n🚀 Worker started (Webhooks Only Mode)`);
      console.log(
        `   Renewal planning: every ${WEBHOOK_RENEWAL_INTERVAL_MS / 1000 / 60} minutes`,
      );
      console.log(
        `   Create concurrency: ${CREATE_CONCURRENCY}, stagger: ${CREATE_STAGGER_MS}ms`,
      );
      console.log(
        `   Renew concurrency: ${RENEW_CONCURRENCY}, stagger: ${RENEW_STAGGER_MS}ms\n`,
      );

      // Run once immediately
      await this.queue.add(
        "webhook:plan-maintenance",
        { reason: "startup" },
        {
          jobId: `webhook:plan-maintenance:now:${Date.now()}`,
          delay: PLAN_DELAY_MS,
        },
      );

      // Repeat every hour (jobId ثابت يمنع duplicates بعد restart)
      await this.queue.add(
        "webhook:plan-maintenance",
        {},
        {
          jobId: MAINTENANCE_LOCK_JOB_ID,
          repeat: { every: WEBHOOK_RENEWAL_INTERVAL_MS },
          delay: PLAN_DELAY_MS,
        },
      );

      log("Maintenance planner scheduled (repeatable job)");
    } catch (error) {
      logError(`Failed to start worker: ${error.message}`);
      process.exit(1);
    }
  }
  async shutdown() {
    log("Shutting down...");
    await this.queue.close();
    await prisma.$disconnect();
    log("Worker shutdown complete");
    process.exit(0);
  }
}
module.exports = WebhookMaintenanceWorker;
