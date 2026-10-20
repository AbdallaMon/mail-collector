const accountRepo = require("../../repositories/account.repo");
const systemLogRepo = require("../../repositories/systemLog.repo");
const messageLogRepo = require("../../repositories/messageLog.repo");
const microsoftAuthService = require("../../services/microsoftAuth.service");
const graphService = require("../../services/graph.service");
const syncService = require("../../services/sync.service");
const ApiError = require("../../utils/ApiError");

class AccountsUsecase {
  findById(id) {
    return accountRepo.findUnique({ where: { id } });
  }

  async requireAccount(id, include) {
    const account = await accountRepo.findUnique({
      where: { id },
      ...(include && { include }),
    });
    if (!account) throw ApiError.notFound("Account not found");
    return account;
  }

  async list(query) {
    const { status, q, health } = query;
    const page = Math.max(parseInt(query.page ?? "1", 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(query.limit ?? "50", 10) || 50, 1),
      200,
    );
    const where = {};
    if (status) where.status = status;
    if (health === "working") where.status = "CONNECTED";
    else if (health === "not_working") where.status = { not: "CONNECTED" };
    if (q && q.trim() !== "") where.email = { contains: q.trim() };
    const [accounts, total] = await Promise.all([
      accountRepo.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: parseInt(limit),
        include: {
          syncState: {
            select: { lastDeltaAt: true, lastMessageDateTime: true },
          },
        },
      }),
      accountRepo.count({ where }),
    ]);
    return {
      accounts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  getById(id) {
    return this.requireAccount(id, {
      syncState: true,
      tokens: { select: { expiresAt: true, scope: true, updatedAt: true } },
    });
  }

  async create({ email }) {
    if (!email) throw ApiError.badRequest("Email is required");
    const existing = await accountRepo.findUnique({ where: { email } });
    if (existing) {
      const { url } = microsoftAuthService.generateAuthUrl(existing.id);
      return {
        created: false,
        data: {
          account: existing,
          connectUrl: url,
          message:
            "Account already exists. Use the connect URL to re-authenticate.",
        },
      };
    }
    const account = await accountRepo.create({
      data: { email, status: "PENDING" },
    });
    const { url } = microsoftAuthService.generateAuthUrl(account.id);
    await systemLogRepo.create({
      data: {
        level: "info",
        category: "auth",
        message: "New account created, awaiting OAuth",
        accountId: account.id,
        metadata: { email },
      },
    });
    return { created: true, data: { account, connectUrl: url } };
  }

  async reconnect(id) {
    await this.requireAccount(id);
    return { connectUrl: microsoftAuthService.generateAuthUrl(id).url };
  }

  async sync(id) {
    const account = await this.requireAccount(id);
    if (account.status !== "CONNECTED" && account.status !== "ERROR")
      throw ApiError.badRequest(
        `Cannot sync account with status: ${account.status}`,
      );
    // Preserve the existing endpoint's error response for sync failures.
    try {
      return { success: true, data: await syncService.syncMailbox(id) };
    } catch (error) {
      return { success: false, error: error.message };
    }
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

  async test(id) {
    await this.requireAccount(id);
    return { connected: await graphService.testConnection(id) };
  }

  update(id, { isEnabled }) {
    return accountRepo.update({
      where: { id },
      data: { isEnabled: isEnabled !== undefined ? isEnabled : undefined },
    });
  }

  async remove(id) {
    const account = await this.requireAccount(id);
    await accountRepo.delete({ where: { id } });
    await systemLogRepo.create({
      data: {
        level: "info",
        category: "auth",
        message: `Account deleted: ${account.email}`,
        metadata: { email: account.email },
      },
    });
  }

  async messages(id, { status, page = 1, limit = 50 }) {
    const where = { accountId: id };
    if (status) where.forwardStatus = status;
    const [messages, total] = await Promise.all([
      messageLogRepo.findMany({
        where,
        orderBy: { receivedDateTime: "desc" },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      messageLogRepo.count({ where }),
    ]);
    return {
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = new AccountsUsecase();
