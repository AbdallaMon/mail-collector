const accountRepo = require("../../repositories/account.repo");
const systemLogRepo = require("../../repositories/systemLog.repo");
const messageLogRepo = require("../../repositories/messageLog.repo");
const settingRepo = require("../../repositories/setting.repo");
const systemRepo = require("../../repositories/system.repo");
const syncService = require("../../services/sync.service");

class DashboardUsecase {
  async stats() {
    const stats = await syncService.getStatistics();

    return stats;
  }

  async accountsOverview() {
    const accounts = await accountRepo.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        lastSyncAt: true,
        lastMessageAt: true,
        lastError: true,
        isEnabled: true,
        forwardedCount: true,
        failedForwardCount: true,
      },
      orderBy: [{ status: "asc" }, { lastSyncAt: "desc" }],
    });

    // Group by status
    const grouped = {
      connected: accounts.filter((a) => a.status === "CONNECTED"),
      needsReauth: accounts.filter((a) => a.status === "NEEDS_REAUTH"),
      error: accounts.filter((a) => a.status === "ERROR"),
      pending: accounts.filter((a) => a.status === "PENDING"),
      disabled: accounts.filter((a) => a.status === "DISABLED"),
    };

    return {
      accounts,
      grouped,
    };
  }

  async recentActivity(query) {
    const { limit = 50 } = query;

    const [logs, messages] = await Promise.all([
      systemLogRepo.findMany({
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
      }),
      messageLogRepo.findMany({
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        include: {
          account: {
            select: {
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      logs,
      messages,
    };
  }

  async syncAll() {
    const results = await syncService.syncAllMailboxes();

    return {
      results,
      summary: {
        total: results.length,
        successful: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
      },
    };
  }

  async retryFailed() {
    const results = await syncService.retryFailedMessages();

    return results;
  }

  async health() {
    // Check database
    let dbStatus = "ok";
    try {
      await systemRepo.ping();
    } catch (error) {
      dbStatus = "error";
    }

    // Get counts
    const [accountCount, aggregates] = await Promise.all([
      accountRepo.count({ where: { status: "CONNECTED" } }),
      accountRepo.aggregate({
        _sum: {
          forwardedCount: true,
          failedForwardCount: true,
        },
      }),
    ]);

    const forwarded = aggregates._sum.forwardedCount || 0;
    const failed = aggregates._sum.failedForwardCount || 0;

    return {
      status: dbStatus === "ok" ? "healthy" : "degraded",
      database: dbStatus,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      accounts: accountCount,
      messages: forwarded + failed,
      failed,
    };
  }

  async getConfig() {
    const config = require("../../config");

    // Get forward email from database
    const forwardToSetting = await settingRepo.findUnique({
      where: { key: "forwardToEmail" },
    });

    return {
      forwardTo:
        forwardToSetting?.value ||
        config.forwarding.toEmail ||
        "Not configured",
      syncInterval: config.worker.pollIntervalMs / 1000, // Convert to seconds
      forwardMethod: "Graph API (Direct Forward)",
    };
  }

  async workerStatus() {
    // Get last sync time from any account
    const lastSyncedAccount = await accountRepo.findFirst({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true },
    });

    // Count accounts synced today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const accountsSyncedToday = await accountRepo.count({
      where: {
        lastSyncAt: { gte: today },
      },
    });

    const config = require("../../config");
    const lastRun = lastSyncedAccount?.lastSyncAt;
    const nextRun = lastRun
      ? new Date(new Date(lastRun).getTime() + config.worker.pollIntervalMs)
      : null;

    return {
      isRunning:
        !!lastRun &&
        Date.now() - new Date(lastRun).getTime() <
          config.worker.pollIntervalMs * 3,
      lastRun,
      nextRun,
      accountsSyncedToday,
    };
  }

  async updateConfig({ forwardToEmail }) {
    if (!forwardToEmail) {
      return { error: "forwardToEmail is required" };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forwardToEmail)) {
      return { error: "Invalid email format" };
    }

    // Save to database
    await settingRepo.upsert({
      where: { key: "forwardToEmail" },
      create: { key: "forwardToEmail", value: forwardToEmail },
      update: { value: forwardToEmail },
    });

    // Clear forwarder cache so it picks up the new value
    const forwarderService = require("../../services/forwarder.service");
    forwarderService.clearForwardToCache();

    // Log the change
    await systemLogRepo.create({
      data: {
        level: "info",
        message: `Forward email updated to: ${forwardToEmail}`,
        category: "CONFIG",
      },
    });

    return { forwardTo: forwardToEmail };
  }
  findConnectedAccount() {
    return accountRepo.findFirst({
      where: { status: "CONNECTED", isEnabled: true },
      select: { id: true, email: true },
    });
  }
}
module.exports = new DashboardUsecase();
