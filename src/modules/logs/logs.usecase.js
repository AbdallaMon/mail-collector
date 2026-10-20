const messageLogRepo = require("../../repositories/messageLog.repo");
const systemLogRepo = require("../../repositories/systemLog.repo");
class LogsUsecase {
  async list(query) {
    const { status, accountId, page = 1, limit = 50, date, search } = query;

    const where = {};

    if (status) {
      where.forwardStatus = status;
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
      messageLogRepo.findMany({
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
      messageLogRepo.count({ where }),
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

    return {
      logs: mappedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  async getById(id) {
    const log = await messageLogRepo.findUnique({
      where: { id: id },
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
      return null;
    }

    return {
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
    };
  }

  async retry(id) {
    const log = await messageLogRepo.findUnique({
      where: { id: id },
    });

    if (!log) {
      return null;
    }

    // Reset status to pending for retry
    await messageLogRepo.update({
      where: { id: id },
      data: {
        forwardStatus: "PENDING",
        error: null,
      },
    });

    return true;
  }

  async cleanup(query) {
    const { olderThanDays = 30 } = query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

    const [systemLogs, messageLogs] = await Promise.all([
      systemLogRepo.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      }),
      messageLogRepo.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          forwardStatus: "FORWARDED", // Only delete successfully forwarded
        },
      }),
    ]);

    return {
      count: systemLogs.count + messageLogs.count,
      deletedSystemLogs: systemLogs.count,
      deletedMessageLogs: messageLogs.count,
    };
  }
}
module.exports = new LogsUsecase();
