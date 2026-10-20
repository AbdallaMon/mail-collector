const prisma = require("../config/database");

class MessageLogRepo {
  findMany(args) {
    return prisma.mailMessageLog.findMany(args);
  }
  count(args) {
    return prisma.mailMessageLog.count(args);
  }
  findUnique(args) {
    return prisma.mailMessageLog.findUnique(args);
  }
  update(args) {
    return prisma.mailMessageLog.update(args);
  }
  deleteMany(args) {
    return prisma.mailMessageLog.deleteMany(args);
  }
  upsert(args) {
    return prisma.mailMessageLog.upsert(args);
  }

  recordFailure({ where, create, update }) {
    return prisma.$transaction(async (tx) => {
      await tx.mailMessageLog.upsert({
        where,
        create: { ...create, attempts: 0 },
        update: {},
      });
      // Never downgrade a confirmed delivery, including after an uncertain
      // transaction acknowledgement or a competing consumer's failure.
      return tx.mailMessageLog.updateMany({
        where: {
          accountId: create.accountId,
          graphMessageId: create.graphMessageId,
          forwardStatus: { not: "FORWARDED" },
        },
        data: update,
      });
    });
  }

  completeForward({ accountId, message, attempts }) {
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      // Lock the account row before testing the message record so two consumers
      // cannot both increment the counter for the same confirmed delivery.
      await tx.mailAccount.update({
        where: { id: accountId },
        data: { lastSyncAt: now },
      });
      const where = {
        accountId_graphMessageId: { accountId, graphMessageId: message.id },
      };
      const existing = await tx.mailMessageLog.findUnique({ where });
      if (existing?.forwardStatus === "FORWARDED") return { recorded: false };
      const metadata = {
        subject: message.subject,
        fromAddress: message.from?.emailAddress?.address,
        toAddresses: (message.toRecipients || [])
          .map((r) => r.emailAddress?.address)
          .filter(Boolean)
          .join(", "),
        receivedDateTime: message.receivedDateTime
          ? new Date(message.receivedDateTime)
          : null,
        forwardStatus: "FORWARDED",
        attempts: Math.max(existing?.attempts || 0, attempts),
        lastAttemptAt: now,
        error: null,
      };
      // The account/message pair is the delivery identity. internetMessageId is
      // globally unique in the existing schema and may be shared across inboxes.
      await tx.mailMessageLog.upsert({
        where,
        create: { accountId, graphMessageId: message.id, ...metadata },
        update: metadata,
      });
      await tx.mailAccount.update({
        where: { id: accountId },
        data: {
          forwardedCount: { increment: 1 },
          lastMessageAt: message.receivedDateTime
            ? new Date(message.receivedDateTime)
            : now,
        },
      });
      return { recorded: true };
    });
  }
}

module.exports = new MessageLogRepo();
