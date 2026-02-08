const express = require("express");
const prisma = require("../config/database");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { authenticate } = require("../middleware/auth.middleware");
const microsoftAuthService = require("../services/microsoftAuth.service");
const graphService = require("../services/graph.service");
const syncService = require("../services/sync.service");

const router = express.Router();

/**
 * @route   GET /api/accounts/reauth/:id
 * @desc    Re-authenticate an account (no auth required - accessed via email link)
 */
router.get(
  "/reauth/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const account = await prisma.mailAccount.findUnique({
      where: { id },
    });

    if (!account) {
      return res.status(404).send(`
        <html>
          <head><title>Account Not Found</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>❌ Account Not Found</h1>
            <p>This account may have been deleted.</p>
          </body>
        </html>
      `);
    }

    // Generate OAuth URL and redirect
    const { url } = microsoftAuthService.generateAuthUrl(id);
    res.redirect(url);
  }),
);

// All routes below require authentication
router.use(authenticate);

/**
 * @route   GET /api/accounts/oauth/url
 * @desc    Generate OAuth URL for connecting a new account
 */
router.get(
  "/oauth/url",
  asyncHandler(async (req, res) => {
    // Create a temporary account ID for the OAuth flow
    // This will be updated when the OAuth completes
    const { url, state } = microsoftAuthService.generateAuthUrl();

    res.json({
      success: true,
      data: {
        url,
        state,
      },
    });
  }),
);

/**
 * @route   GET /api/accounts
 * @desc    Get all mail accounts
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, q } = req.query;
    const page = Math.max(parseInt(req.query.page ?? "1", 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? "50", 10) || 50, 1),
      200,
    );
    const skip = (page - 1) * limit;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (q && q.trim() !== "") {
      where.email = {
        contains: q.trim(),
      };
    }

    const [accounts, total] = await Promise.all([
      prisma.mailAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          syncState: {
            select: {
              lastDeltaAt: true,
              lastMessageDateTime: true,
            },
          },
        },
      }),
      prisma.mailAccount.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        accounts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  }),
);

/**
 * @route   POST /api/accounts/sync-all
 * @desc    Sync all connected accounts (must be before /:id routes)
 */
router.post(
  "/sync-all",
  asyncHandler(async (req, res) => {
    const results = await syncService.syncAllMailboxes();

    res.json({
      success: true,
      message: `Sync started for ${results.length} accounts`,
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
 * @route   GET /api/accounts/:id
 * @desc    Get a single mail account
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const account = await prisma.mailAccount.findUnique({
      where: { id },
      include: {
        syncState: true,
        tokens: {
          select: {
            expiresAt: true,
            scope: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!account) {
      throw ApiError.notFound("Account not found");
    }

    res.json({
      success: true,
      data: account,
    });
  }),
);

/**
 * @route   POST /api/accounts
 * @desc    Add a new mail account (generates OAuth link)
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      throw ApiError.badRequest("Email is required");
    }

    // Check if account already exists
    const existing = await prisma.mailAccount.findUnique({
      where: { email },
    });

    if (existing) {
      // Generate reconnect URL
      const { url } = microsoftAuthService.generateAuthUrl(existing.id);

      return res.json({
        success: true,
        data: {
          account: existing,
          connectUrl: url,
          message:
            "Account already exists. Use the connect URL to re-authenticate.",
        },
      });
    }

    // Create new account in pending state
    const account = await prisma.mailAccount.create({
      data: {
        email,
        status: "PENDING",
      },
    });

    // Generate OAuth URL
    const { url } = microsoftAuthService.generateAuthUrl(account.id);

    // Log creation
    await prisma.systemLog.create({
      data: {
        level: "info",
        category: "auth",
        message: "New account created, awaiting OAuth",
        accountId: account.id,
        metadata: { email },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        account,
        connectUrl: url,
      },
    });
  }),
);

/**
 * @route   POST /api/accounts/:id/reconnect
 * @desc    Generate new OAuth URL for reconnection
 */
router.post(
  "/:id/reconnect",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const account = await prisma.mailAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw ApiError.notFound("Account not found");
    }

    const { url } = microsoftAuthService.generateAuthUrl(id);

    res.json({
      success: true,
      data: {
        connectUrl: url,
      },
    });
  }),
);

/**
 * @route   POST /api/accounts/:id/sync
 * @desc    Manually trigger sync for an account
 */
router.post(
  "/:id/sync",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const account = await prisma.mailAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw ApiError.notFound("Account not found");
    }

    // Allow CONNECTED and ERROR status (ERROR accounts can try again)
    if (account.status !== "CONNECTED" && account.status !== "ERROR") {
      throw ApiError.badRequest(
        `Cannot sync account with status: ${account.status}`,
      );
    }

    try {
      const result = await syncService.syncMailbox(id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.json({
        success: false,
        error: error.message,
      });
    }
  }),
);

/**
 * @route   POST /api/accounts/:id/test
 * @desc    Test connection for an account
 */
router.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const account = await prisma.mailAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw ApiError.notFound("Account not found");
    }

    const isConnected = await graphService.testConnection(id);

    res.json({
      success: true,
      data: {
        connected: isConnected,
      },
    });
  }),
);

/**
 * @route   PATCH /api/accounts/:id
 * @desc    Update account settings
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isEnabled } = req.body;

    const account = await prisma.mailAccount.update({
      where: { id },
      data: {
        isEnabled: isEnabled !== undefined ? isEnabled : undefined,
      },
    });

    res.json({
      success: true,
      data: account,
    });
  }),
);

/**
 * @route   DELETE /api/accounts/:id
 * @desc    Delete a mail account
 */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const account = await prisma.mailAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw ApiError.notFound("Account not found");
    }

    // Delete account (cascades to tokens, sync state, logs)
    await prisma.mailAccount.delete({
      where: { id },
    });

    // Log deletion
    await prisma.systemLog.create({
      data: {
        level: "info",
        category: "auth",
        message: `Account deleted: ${account.email}`,
        metadata: { email: account.email },
      },
    });

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  }),
);

/**
 * @route   GET /api/accounts/:id/messages
 * @desc    Get message logs for an account
 */
router.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, page = 1, limit = 50 } = req.query;

    const where = { accountId: id };
    if (status) {
      where.forwardStatus = status;
    }

    const [messages, total] = await Promise.all([
      prisma.mailMessageLog.findMany({
        where,
        orderBy: { receivedDateTime: "desc" },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.mailMessageLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  }),
);

module.exports = router;
