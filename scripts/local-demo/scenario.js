const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const settings = require("./settings");
const { logEvent } = require("./events");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, options = {}) {
  settings.assertLocalUrl(url);
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { text };
  }
  if (!response.ok)
    throw new Error(
      `Local HTTP ${response.status}: ${result.error || result.message || response.statusText}`,
    );
  return result;
}

async function waitFor(check, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await pause(250);
  }
  throw new Error(
    `${label} timed out${lastError ? ": " + lastError.message : ""}`,
  );
}

class DemoScenario {
  constructor(session) {
    this.session = session;
    this.controlHeaders = {
      "Content-Type": "application/json",
      "X-Local-Demo-Token": session.controlToken,
    };
  }

  async verifySession() {
    const health = await request(`${settings.providerUrl}/__demo/health`);
    if (
      health.mode !== "LOCAL_SIMULATION" ||
      health.workspaceId !== settings.workspaceId ||
      health.runId !== this.session.runId
    )
      throw new Error(
        "The local service does not belong to this workspace/run",
      );
  }

  async sendSteam({ username, code } = {}) {
    await this.verifySession();
    username ||= `demo_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    code ||= randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
    const injected = await request(`${settings.providerUrl}/__demo/steam`, {
      method: "POST",
      headers: this.controlHeaders,
      body: JSON.stringify({ kind: "steam", username, code }),
    });
    const { row, outcome } = await waitFor(async () => {
      const logFile = path.join(
        settings.directory,
        "php-logs/steam_api_requests.log",
      );
      if (!fs.existsSync(logFile)) return null;
      const entries = fs
        .readFileSync(logFile, "utf8")
        .split("\n")
        .filter((line) => line.includes(injected.messageId));
      const outcome = entries
        .map((line) => {
          try {
            return JSON.parse(line.slice(line.indexOf("{")));
          } catch {
            return null;
          }
        })
        .find(
          (entry) =>
            entry?.saved === true ||
            ["DUPLICATE_RECENT", "DUPLICATE_MESSAGE"].includes(entry?.reason),
        );
      if (!outcome) return null;
      const data = await request(
        `${settings.receiverUrl}/__demo/codes?username=${encodeURIComponent(username)}`,
      );
      const row = data.rows?.find(
        (value) => value.UserName === username && value.Code === code,
      );
      return row ? { row, outcome } : null;
    }, "Saving the synthetic Steam code in PHP/MySQL");
    logEvent(outcome.saved ? "CODE_SAVED" : "CODE_ALREADY_PRESENT", {
      message: outcome.saved
        ? "تم حفظ كود Steam التجريبي في قاعدة PHP المحلية"
        : "السجل موجود مسبقًا؛ PHP تجاهل إعادة الحفظ",
      messageId: injected.messageId,
      rowId: row.Id,
      username,
      code,
    });
    return { ...injected, rowId: row.Id, newlySaved: outcome.saved === true };
  }

  async run() {
    await this.verifySession();
    const login = await request(`${settings.appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: settings.adminEmail,
        password: settings.adminPassword,
      }),
    });
    if (!login.success || !login.data?.token)
      throw new Error("Local dashboard login failed");
    logEvent("DASHBOARD_LOGIN_OK", { email: settings.adminEmail });
    const auth = await request(`${settings.appUrl}/api/accounts/oauth/url`, {
      headers: { Authorization: `Bearer ${login.data.token}` },
    });
    if (!auth.data?.url?.startsWith(`${settings.providerUrl}/oauth/authorize?`))
      throw new Error("OAuth URL was not redirected to the local provider");
    const callback = await fetch(auth.data.url, {
      signal: AbortSignal.timeout(15_000),
    });
    const resultUrl = settings.assertLocalUrl(callback.url);
    await callback.text();
    if (resultUrl.searchParams.get("success") !== "true")
      throw new Error(
        `Local OAuth failed: ${resultUrl.searchParams.get("error") || callback.status}`,
      );
    const accountId = resultUrl.searchParams.get("accountId");
    const account = await request(
      `${settings.appUrl}/api/accounts/${accountId}`,
      { headers: { Authorization: `Bearer ${login.data.token}` } },
    );
    const subscriptions = await request(
      `${settings.providerUrl}/__demo/subscriptions`,
      { headers: this.controlHeaders },
    );
    if (account.data.status !== "CONNECTED" || subscriptions.count !== 1)
      throw new Error(
        "OAuth callback succeeded without a connected account/subscription",
      );
    logEvent("OAUTH_CONNECTED", {
      message: "تم ربط حساب Microsoft التجريبي محليًا",
      accountId,
      email: account.data.email,
    });

    const databaseUrl = settings.environment().DATABASE_URL;
    settings.assertLocalUrl(databaseUrl);
    const { PrismaClient } = require("@prisma/client");
    const database = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    try {
      const token = await database.mailToken.findUnique({
        where: { accountId },
      });
      if (!token?.accessToken?.startsWith("U2FsdGVkX1"))
        throw new Error(
          "The local token was not stored in the expected encrypted format",
        );
      logEvent("TOKEN_STORAGE_VERIFIED", { encrypted: true });
      // Deliberately expire this synthetic token to exercise the real refresh path.
      await database.mailToken.update({
        where: { accountId },
        data: { expiresAt: new Date(0) },
      });
      logEvent("TOKEN_EXPIRY_SIMULATED", { accountId });
      const delivery = await this.sendSteam();
      const refreshed = await database.mailToken.findUnique({
        where: { accountId },
      });
      if (new Date(refreshed.expiresAt).getTime() <= Date.now())
        throw new Error("The synthetic token was not refreshed");
      logEvent("TOKEN_REFRESH_VERIFIED", { accountId });

      const smtpDirectory = path.join(settings.directory, "smtp");
      const before = new Set(
        fs.existsSync(smtpDirectory) ? fs.readdirSync(smtpDirectory) : [],
      );
      await request(`${settings.providerUrl}/__demo/steam`, {
        method: "POST",
        headers: this.controlHeaders,
        body: JSON.stringify({ kind: "security" }),
      });
      await waitFor(
        () =>
          fs.existsSync(smtpDirectory) &&
          fs.readdirSync(smtpDirectory).some((name) => !before.has(name)),
        "Capturing the local SMTP notification",
      );

      const summary = {
        mode: "LOCAL_SIMULATION",
        time: new Date().toISOString(),
        dashboard: settings.appUrl,
        accountId,
        mailbox: settings.mailbox,
        delivery,
        tokenRefresh: true,
        smtpCaptured: true,
      };
      fs.writeFileSync(
        path.join(settings.directory, "last-run.json"),
        JSON.stringify(summary, null, 2) + "\n",
      );
      logEvent("FLOW_COMPLETE", {
        message: "نجح الربط والتجديد واستقبال Steam والحفظ والتنبيه محليًا",
        rowId: delivery.rowId,
      });
      return summary;
    } finally {
      await database.$disconnect();
    }
  }
}

module.exports = { DemoScenario, request, waitFor };
