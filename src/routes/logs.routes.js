const express = require("express");
const prisma = require("../config/database");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /api/logs
 * @desc    Get email forwarding logs (MailMessageLog)
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, accountId, page = 1, limit = 50, date, search } = req.query;

    const where = {};

    // Default to FAILED status if no status filter specified (only errors are logged now)
    if (status) {
      where.forwardStatus = status;
    } else {
      where.forwardStatus = "FAILED";
    }
    if (accountId) where.accountId = accountId;

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { fromAddress: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.mailMessageLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          account: {
            select: {
              email: true,
              displayName: true,
            },
          },
        },
      }),
      prisma.mailMessageLog.count({ where }),
    ]);

    // Map to frontend expected format
    const mappedLogs = logs.map((log) => ({
      id: log.id,
      accountId: log.accountId,
      messageId: log.graphMessageId,
      subject: log.subject,
      fromAddress: log.fromAddress,
      originalRecipient: log.account?.email,
      status: log.forwardStatus,
      forwardedTo: log.forwardedTo,
      receivedAt: log.receivedDateTime,
      forwardedAt: log.lastAttemptAt,
      errorMessage: log.error,
      attempts: log.attempts,
      bodyPreview: null, // Not stored in DB
      createdAt: log.createdAt,
      mailAccount: log.account,
    }));

    res.json({
      success: true,
      data: {
        logs: mappedLogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  }),
);

/**
 * @route   GET /api/logs/:id
 * @desc    Get single log details
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const log = await prisma.mailMessageLog.findUnique({
      where: { id: req.params.id },
      include: {
        account: {
          select: {
            email: true,
            displayName: true,
          },
        },
      },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Log not found",
      });
    }

    res.json({
      success: true,
      data: {
        id: log.id,
        accountId: log.accountId,
        messageId: log.graphMessageId,
        subject: log.subject,
        fromAddress: log.fromAddress,
        originalRecipient: log.account?.email,
        status: log.forwardStatus,
        forwardedTo: log.forwardedTo,
        receivedAt: log.receivedDateTime,
        forwardedAt: log.lastAttemptAt,
        errorMessage: log.error,
        attempts: log.attempts,
        bodyPreview: null,
        createdAt: log.createdAt,
        mailAccount: log.account,
      },
    });
  }),
);

/**
 * @route   POST /api/logs/:id/retry
 * @desc    Retry forwarding a failed message
 */
router.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    const log = await prisma.mailMessageLog.findUnique({
      where: { id: req.params.id },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Log not found",
      });
    }

    // Reset status to pending for retry
    await prisma.mailMessageLog.update({
      where: { id: req.params.id },
      data: {
        forwardStatus: "PENDING",
        error: null,
      },
    });

    res.json({
      success: true,
      message: "Message queued for retry",
    });
  }),
);

/**
 * @route   DELETE /api/logs/cleanup
 * @desc    Clear old logs
 */
router.delete(
  "/cleanup",
  asyncHandler(async (req, res) => {
    const { olderThanDays = 30 } = req.query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

    const [systemLogs, messageLogs] = await Promise.all([
      prisma.systemLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      }),
      prisma.mailMessageLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          forwardStatus: "FORWARDED", // Only delete successfully forwarded
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        count: systemLogs.count + messageLogs.count,
        deletedSystemLogs: systemLogs.count,
        deletedMessageLogs: messageLogs.count,
      },
    });
  }),
);

module.exports = router;
