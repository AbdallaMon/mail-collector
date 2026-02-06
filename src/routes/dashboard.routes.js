const express = require("express");
const prisma = require("../config/database");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const syncService = require("../services/sync.service");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get dashboard statistics
 */
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const stats = await syncService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  }),
);

/**
 * @route   GET /api/dashboard/accounts-overview
 * @desc    Get accounts status overview
 */
router.get(
  "/accounts-overview",
  asyncHandler(async (req, res) => {
    const accounts = await prisma.mailAccount.findMany({
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

    res.json({
      success: true,
      data: {
        accounts,
        grouped,
      },
    });
  }),
);

/**
 * @route   GET /api/dashboard/recent-activity
 * @desc    Get recent sync activity
 */
router.get(
  "/recent-activity",
  asyncHandler(async (req, res) => {
    const { limit = 50 } = req.query;

    const [logs, messages] = await Promise.all([
      prisma.systemLog.findMany({
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
      }),
      prisma.mailMessageLog.findMany({
        where: { forwardStatus: "FAILED" },
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

    res.json({
      success: true,
      data: {
        logs,
        messages,
      },
    });
  }),
);

/**
 * @route   POST /api/dashboard/sync-all
 * @desc    Trigger sync for all connected accounts
 */
router.post(
  "/sync-all",
  asyncHandler(async (req, res) => {
    const results = await syncService.syncAllMailboxes();

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          successful: results.filter((r) => !r.error).length,
          failed: results.filter((r) => r.error).length,
        },
      },
    });
  }),
);

/**
 * @route   POST /api/dashboard/retry-failed
 * @desc    Retry failed message forwards
 */
router.post(
  "/retry-failed",
  asyncHandler(async (req, res) => {
    const results = await syncService.retryFailedMessages();

    res.json({
      success: true,
      data: results,
    });
  }),
);

/**
 * @route   GET /api/dashboard/health
 * @desc    System health check
 */
router.get(
  "/health",
  asyncHandler(async (req, res) => {
    // Check database
    let dbStatus = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbStatus = "error";
    }

    // Get counts
    const [accountCount, aggregates] = await Promise.all([
      prisma.mailAccount.count({ where: { status: "CONNECTED" } }),
      prisma.mailAccount.aggregate({
        _sum: {
          forwardedCount: true,
          failedForwardCount: true,
        },
      }),
    ]);

    const forwarded = aggregates._sum.forwardedCount || 0;
    const failed = aggregates._sum.failedForwardCount || 0;

    res.json({
      success: true,
      data: {
        status: dbStatus === "ok" ? "healthy" : "degraded",
        database: dbStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        accounts: accountCount,
        messages: forwarded + failed,
        failed,
      },
    });
  }),
);

/**
 * @route   GET /api/dashboard/config
 * @desc    Get system configuration (from database)
 */
router.get(
  "/config",
  asyncHandler(async (req, res) => {
    const config = require("../config");

    // Get forward email from database
    const forwardToSetting = await prisma.systemSetting.findUnique({
      where: { key: "forwardToEmail" },
    });

    res.json({
      success: true,
      data: {
        forwardTo:
          forwardToSetting?.value ||
          config.forwarding.toEmail ||
          "Not configured",
        syncInterval: config.worker.pollIntervalMs / 1000, // Convert to seconds
        forwardMethod: "Graph API (Direct Forward)",
      },
    });
  }),
);

/**
 * @route   POST /api/dashboard/config
 * @desc    Update system configuration (saves to database)
 */
router.post(
  "/config",
  asyncHandler(async (req, res) => {
    const { forwardToEmail } = req.body;

    if (!forwardToEmail) {
      return res.status(400).json({
        success: false,
        message: "forwardToEmail is required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forwardToEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Save to database
    await prisma.systemSetting.upsert({
      where: { key: "forwardToEmail" },
      create: { key: "forwardToEmail", value: forwardToEmail },
      update: { value: forwardToEmail },
    });

    // Clear forwarder cache so it picks up the new value
    const forwarderService = require("../services/forwarder.service");
    forwarderService.clearForwardToCache();

    // Log the change
    await prisma.systemLog.create({
      data: {
        level: "info",
        message: `Forward email updated to: ${forwardToEmail}`,
        category: "CONFIG",
      },
    });

    res.json({
      success: true,
      message: "Configuration updated successfully",
      data: {
        forwardTo: forwardToEmail,
      },
    });
  }),
);

/**
 * @route   GET /api/dashboard/worker-status
 * @desc    Get worker status
 */
router.get(
  "/worker-status",
  asyncHandler(async (req, res) => {
    // Get last sync time from any account
    const lastSyncedAccount = await prisma.mailAccount.findFirst({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true },
    });

    // Count accounts synced today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const accountsSyncedToday = await prisma.mailAccount.count({
      where: {
        lastSyncAt: { gte: today },
      },
    });

    const config = require("../config");
    const lastRun = lastSyncedAccount?.lastSyncAt;
    const nextRun = lastRun
      ? new Date(new Date(lastRun).getTime() + config.worker.pollIntervalMs)
      : null;

    res.json({
      success: true,
      data: {
        isRunning:
          !!lastRun &&
          Date.now() - new Date(lastRun).getTime() <
            config.worker.pollIntervalMs * 3,
        lastRun,
        nextRun,
        accountsSyncedToday,
      },
    });
  }),
);

/**
 * @route   POST /api/dashboard/test-forward
 * @desc    Test Graph API forward capability
 */
router.post(
  "/test-forward",
  asyncHandler(async (req, res) => {
    // Check if any account is connected and has Mail.Send permission
    const connectedAccount = await prisma.mailAccount.findFirst({
      where: { status: "CONNECTED", isEnabled: true },
      select: { id: true, email: true },
    });

    if (!connectedAccount) {
      return res.status(400).json({
        success: false,
        message: "No connected account available to test forwarding",
      });
    }

    try {
      const graphService = require("../services/graph.service");
      const canConnect = await graphService.testConnection(connectedAccount.id);

      if (canConnect) {
        res.json({
          success: true,
          message: `Graph API connection successful via ${connectedAccount.email}`,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Graph API connection failed",
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Graph API test failed: ${error.message}`,
      });
    }
  }),
);

module.exports = router;
