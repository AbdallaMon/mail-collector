const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const controller = require("../controllers/dashboard.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get dashboard statistics
 */
router.get("/stats", asyncHandler(controller.stats.bind(controller)));

/**
 * @route   GET /api/dashboard/accounts-overview
 * @desc    Get accounts status overview
 */
router.get(
  "/accounts-overview",
  asyncHandler(controller.accountsOverview.bind(controller)),
);

/**
 * @route   GET /api/dashboard/recent-activity
 * @desc    Get recent sync activity
 */
router.get(
  "/recent-activity",
  asyncHandler(controller.recentActivity.bind(controller)),
);

/**
 * @route   POST /api/dashboard/sync-all
 * @desc    Trigger sync for all connected accounts
 */
router.post("/sync-all", asyncHandler(controller.syncAll.bind(controller)));

/**
 * @route   POST /api/dashboard/retry-failed
 * @desc    Retry failed message forwards
 */
router.post(
  "/retry-failed",
  asyncHandler(controller.retryFailed.bind(controller)),
);

/**
 * @route   GET /api/dashboard/health
 * @desc    System health check
 */
router.get("/health", asyncHandler(controller.health.bind(controller)));

/**
 * @route   GET /api/dashboard/config
 * @desc    Get system configuration (from database)
 */
router.get("/config", asyncHandler(controller.getConfig.bind(controller)));

/**
 * @route   POST /api/dashboard/config
 * @desc    Update system configuration (saves to database)
 */
router.post("/config", asyncHandler(controller.updateConfig.bind(controller)));

/**
 * @route   GET /api/dashboard/worker-status
 * @desc    Get worker status
 */
router.get(
  "/worker-status",
  asyncHandler(controller.workerStatus.bind(controller)),
);

/**
 * @route   POST /api/dashboard/test-forward
 * @desc    Test Graph API forward capability
 */
router.post(
  "/test-forward",
  asyncHandler(controller.testForward.bind(controller)),
);

module.exports = router;
