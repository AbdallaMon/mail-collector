const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHmac } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const Bull = require("bull");
const settings = require("./settings");
const { DemoScenario, request, waitFor } = require("./scenario");
const { logEvent } = require("./events");

class RepairVerification {
  constructor(session, accountId) {
    this.scenario = new DemoScenario(session);
    this.accountId = accountId;
    this.env = settings.environment();
    settings.assertLocalUrl(this.env.DATABASE_URL);
    this.database = new PrismaClient({
      datasources: { db: { url: this.env.DATABASE_URL } },
    });
    this.faultFile = path.join(settings.directory, "php-logs/faults.json");
  }

  async verifyDelivery(mode) {
    const username = `repair_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const code = "A1B2C";
    const smtpDirectory = path.join(settings.directory, "smtp");
    const beforeMail = new Set(fs.readdirSync(smtpDirectory));
    const before = await this.database.mailAccount.findUnique({
      where: { id: this.accountId },
    });
    fs.writeFileSync(this.faultFile, JSON.stringify({ [username]: mode }));
    const injected = await this.scenario.sendSteam({ username, code });
    const where = {
      accountId_graphMessageId: {
        accountId: this.accountId,
        graphMessageId: injected.messageId,
      },
    };
    const record = await waitFor(async () => {
      const value = await this.database.mailMessageLog.findUnique({ where });
      return value?.forwardStatus === "FORWARDED" ? value : null;
    }, `${mode} retry completion`);
    const after = await this.database.mailAccount.findUnique({
      where: { id: this.accountId },
    });
    const { rows } = await request(
      `${settings.receiverUrl}/__demo/codes?username=${username}`,
    );
    assert.equal(rows.length, 1, "Retry must not save a second receiver row");
    assert.equal(after.status, "CONNECTED");
    assert.equal(after.forwardedCount - before.forwardedCount, 1);
    assert.equal(after.failedForwardCount, before.failedForwardCount);
    assert.equal(record.attempts, 2);
    const mail = fs
      .readdirSync(smtpDirectory)
      .filter((name) => !beforeMail.has(name));
    assert.ok(
      mail.length >= 2,
      "Both original developer notification paths must still send",
    );
    assert.ok(
      mail.some((name) =>
        fs
          .readFileSync(path.join(smtpDirectory, name), "utf8")
          .includes("developer@local.test"),
      ),
    );
    if (mode === "after-save") {
      const phpLog = fs.readFileSync(
        path.join(settings.directory, "php-logs/steam_api_requests.log"),
        "utf8",
      );
      assert.ok(
        phpLog
          .split("\n")
          .some(
            (line) =>
              line.includes(injected.messageId) &&
              line.includes("DUPLICATE_RECENT"),
          ),
      );
    }
    logEvent("REPAIR_RETRY_VERIFIED", {
      mode,
      receiverRows: rows.length,
      attempts: record.attempts,
      developerMails: mail.length,
    });
  }

  async verifyConcurrentReceiver() {
    const username = `parallel_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const body = JSON.stringify({
      source: "local-repair-test",
      graphMessageId: randomUUID(),
      username,
      code: "C3D4E",
      from: "noreply@steampowered.com",
      to: settings.mailbox,
      subject: "Steam access from new computer",
      receivedDateTime: new Date().toISOString(),
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", this.env.STEAM_API_SECRET)
      .update(`${ts}.${body}`)
      .digest("hex");
    const replies = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(this.env.STEAM_API_URL, {
          method: "POST",
          body,
          headers: {
            "Content-Type": "application/json",
            "X-Timestamp": ts,
            "X-Signature": signature,
          },
        }),
      ),
    );
    assert.equal(replies.filter((value) => value.saved === true).length, 1);
    assert.equal(
      replies.filter((value) => value.reason === "DUPLICATE_RECENT").length,
      5,
    );
    const { rows } = await request(
      `${settings.receiverUrl}/__demo/codes?username=${username}`,
    );
    assert.equal(rows.length, 1);
    logEvent("REPAIR_CONCURRENT_SAVE_VERIFIED", {
      requests: 6,
      receiverRows: 1,
    });
  }

  async verifyRetainedJobs() {
    // Use a dedicated queue in the synthetic Redis, never the production queue.
    const queue = new Bull(`local-repair-${randomUUID()}`, {
      redis: {
        host: "127.0.0.1",
        port: settings.ports.redis,
        password: this.env.REDIS_PASSWORD,
      },
    });
    // The real maintenance module is loaded only after synthetic settings replace dotenv.
    Object.assign(process.env, this.env);
    require("./bootstrap");
    const Worker = require("../../src/workers/webhookMaintenance.worker");
    try {
      await queue.pause();
      queue.process("renew", async (job) => {
        if (!job.data.recovered)
          throw new Error("Synthetic old retained failure");
        return { ok: true };
      });
      const old = await queue.add(
        "renew",
        {},
        { jobId: "renew:local", attempts: 1, removeOnFail: false },
      );
      await queue.resume();
      await waitFor(
        async () => (await old.getState()) === "failed",
        "Retained failed Redis job",
      );
      await queue.pause();
      const helper = Worker.prototype.enqueueMaintenanceJob.bind({ queue });
      assert.equal(
        await helper("renew", { recovered: true }, "renew:local", 0),
        true,
      );
      assert.equal(
        await helper("renew", { recovered: true }, "renew:local", 0),
        false,
      );
      const recovered = await queue.getJob("renew:local");
      const finished = recovered.finished();
      await queue.resume();
      assert.equal((await finished).ok, true);
      await waitFor(
        async () => !(await queue.getJob("renew:local")),
        "Completed maintenance job removal",
      );
      logEvent("REPAIR_REDIS_RECOVERY_VERIFIED", {
        retainedFailureReplaced: true,
        pendingDuplicateSkipped: true,
      });
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
      await require("../../src/config/database").$disconnect();
    }
  }

  async verifySteamFilters() {
    for (const variant of ["web", "guard-body"]) {
      const injected = await this.scenario.sendSteam({ variant });
      await waitFor(async () => {
        const record = await this.database.mailMessageLog.findUnique({
          where: {
            accountId_graphMessageId: {
              accountId: this.accountId,
              graphMessageId: injected.messageId,
            },
          },
        });
        return record?.forwardStatus === "FORWARDED";
      }, `Steam ${variant} delivery`);
      logEvent("STEAM_FILTER_VERIFIED", { variant, saved: true });
    }
    // PHP must not trust a truthy string or accept an unmatched legacy payload.
    for (const flag of [undefined, false, "true"]) {
      const body = JSON.stringify({
        from: "noreply@steampowered.com",
        subject: "Your Steam Guard code",
        username: "local_filter_probe",
        code: "A1B2C",
        hasSteamGuardCodeText: flag,
      });
      const ts = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac("sha256", this.env.STEAM_API_SECRET)
        .update(`${ts}.${body}`)
        .digest("hex");
      const response = await request(this.env.STEAM_API_URL, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "X-Timestamp": ts,
          "X-Signature": signature,
        },
      });
      assert.equal(response.ignored, true);
      assert.equal(response.reason, "SUBJECT_NOT_MATCH");
    }
    logEvent("STEAM_FILTER_FLAG_VALIDATED", {
      rejectsMissingFalseAndString: true,
    });
  }

  async run() {
    try {
      await this.scenario.verifySession();
      await this.verifyDelivery("before-save");
      await this.verifyDelivery("after-save");
      await this.verifyConcurrentReceiver();
      await this.verifySteamFilters();
      await this.verifyRetainedJobs();
      const result = {
        time: new Date().toISOString(),
        retryBeforeSave: true,
        retryAfterSave: true,
        concurrentSave: true,
        retainedJobRecovery: true,
        steamSubjectAndBodyFilters: true,
      };
      fs.writeFileSync(
        path.join(settings.directory, "repairs-result.json"),
        JSON.stringify(result, null, 2) + "\n",
      );
      logEvent("REPAIRS_VERIFIED", result);
    } finally {
      fs.writeFileSync(this.faultFile, "{}");
      await this.database.$disconnect();
    }
  }
}

module.exports = RepairVerification;
