const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const controller = require("../controllers/accounts.controller");

const router = express.Router();

/**
 * @route   GET /api/accounts/reauth/:id
 * @desc    Re-authenticate an account (no auth required - accessed via email link)
 */
router.get(
  "/reauth/:id",
  asyncHandler(controller.reauthenticate.bind(controller)),
);

// All routes below require authentication
router.use(authenticate);

/**
 * @route   GET /api/accounts/oauth/url
 * @desc    Generate OAuth URL for connecting a new account
 */
router.get("/oauth/url", asyncHandler(controller.oauthUrl.bind(controller)));

/**
 * @route   GET /api/accounts
 * @desc    Get all mail accounts
 */
router.get("/", asyncHandler(controller.list.bind(controller)));

/**
 * @route   POST /api/accounts/sync-all
 * @desc    Sync all connected accounts (must be before /:id routes)
 */
router.post("/sync-all", asyncHandler(controller.syncAll.bind(controller)));

/**
 * @route   GET /api/accounts/:id
 * @desc    Get a single mail account
 */
router.get("/:id", asyncHandler(controller.getById.bind(controller)));

/**
 * @route   POST /api/accounts
 * @desc    Add a new mail account (generates OAuth link)
 */
router.post("/", asyncHandler(controller.create.bind(controller)));

/**
 * @route   POST /api/accounts/:id/reconnect
 * @desc    Generate new OAuth URL for reconnection
 */
router.post(
  "/:id/reconnect",
  asyncHandler(controller.reconnect.bind(controller)),
);

/**
 * @route   POST /api/accounts/:id/sync
 * @desc    Manually trigger sync for an account
 */
router.post("/:id/sync", asyncHandler(controller.sync.bind(controller)));

/**
 * @route   POST /api/accounts/:id/test
 * @desc    Test connection for an account
 */
router.post("/:id/test", asyncHandler(controller.test.bind(controller)));

/**
 * @route   PATCH /api/accounts/:id
 * @desc    Update account settings
 */
router.patch("/:id", asyncHandler(controller.update.bind(controller)));

/**
 * @route   DELETE /api/accounts/:id
 * @desc    Delete a mail account
 */
router.delete("/:id", asyncHandler(controller.remove.bind(controller)));

/**
 * @route   GET /api/accounts/:id/messages
 * @desc    Get message logs for an account
 */
router.get("/:id/messages", asyncHandler(controller.messages.bind(controller)));

module.exports = router;
