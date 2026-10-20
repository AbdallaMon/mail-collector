const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const controller = require("../controllers/auth.controller");

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Admin login
 */
router.post("/login", asyncHandler(controller.login.bind(controller)));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 */
router.get("/me", authenticate, asyncHandler(controller.me.bind(controller)));

/**
 * @route   GET /api/auth/microsoft/connect
 * @desc    Generate Microsoft OAuth URL for connecting a mailbox
 */
router.get(
  "/microsoft/connect",
  authenticate,
  asyncHandler(controller.connectMicrosoft.bind(controller)),
);

/**
 * @route   GET /api/auth/microsoft/callback
 * @desc    Microsoft OAuth callback
 */
router.get(
  "/microsoft/callback",
  asyncHandler(controller.microsoftCallback.bind(controller)),
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password
 */
router.post(
  "/change-password",
  authenticate,
  asyncHandler(controller.changePassword.bind(controller)),
);

module.exports = router;
