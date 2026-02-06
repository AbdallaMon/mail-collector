const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const prisma = require("../config/database");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { authenticate } = require("../middleware/auth.middleware");
const microsoftAuthService = require("../services/microsoftAuth.service");

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Admin login
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw ApiError.badRequest("Email and password are required");
    }

    // Find user
    const user = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized("Invalid credentials");
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw ApiError.unauthorized("Invalid credentials");
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  }),
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 */
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.adminUser.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: user,
    });
  }),
);

/**
 * @route   GET /api/auth/microsoft/connect
 * @desc    Generate Microsoft OAuth URL for connecting a mailbox
 */
router.get(
  "/microsoft/connect",
  authenticate,
  asyncHandler(async (req, res) => {
    const { accountId } = req.query;

    const { url, state } = microsoftAuthService.generateAuthUrl(accountId);

    res.json({
      success: true,
      data: { url, state },
    });
  }),
);

/**
 * @route   GET /api/auth/microsoft/callback
 * @desc    Microsoft OAuth callback
 */
router.get(
  "/microsoft/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      // Redirect to frontend with error
      return res.redirect(
        `${config.frontendUrl}/oauth/callback?error=${encodeURIComponent(error_description || error)}`,
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${config.frontendUrl}/oauth/callback?error=${encodeURIComponent("Missing code or state")}`,
      );
    }

    try {
      const account = await microsoftAuthService.completeOAuthFlow(code, state);

      // Redirect to frontend with success
      res.redirect(
        `${config.frontendUrl}/oauth/callback?success=true&email=${encodeURIComponent(account.email)}&accountId=${account.id}`,
      );
    } catch (err) {
      res.redirect(
        `${config.frontendUrl}/oauth/callback?error=${encodeURIComponent(err.message)}`,
      );
    }
  }),
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password
 */
router.post(
  "/change-password",
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw ApiError.badRequest(
        "Current password and new password are required",
      );
    }

    if (newPassword.length < 8) {
      throw ApiError.badRequest("New password must be at least 8 characters");
    }

    // Get user
    const user = await prisma.adminUser.findUnique({
      where: { id: req.user.id },
    });

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw ApiError.badRequest("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.adminUser.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  }),
);

module.exports = router;
