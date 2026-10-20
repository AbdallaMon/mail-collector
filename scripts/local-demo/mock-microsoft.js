const express = require("express");
const { randomUUID } = require("node:crypto");
const settings = require("./settings");
const { logEvent } = require("./events");

class MockMicrosoft {
  constructor() {
    this.codes = new Set();
    this.accessTokens = new Map();
    this.refreshTokens = new Set();
    this.messages = new Map();
    this.subscriptions = new Map();
    this.profile = {
      id: "local-microsoft-user",
      mail: settings.mailbox,
      userPrincipalName: settings.mailbox,
      displayName: "Local Steam Demo",
    };
  }

  issueTokens() {
    const access = `local-access-${randomUUID()}`;
    const refresh = `local-refresh-${randomUUID()}`;
    this.accessTokens.set(access, Date.now() + 3600_000);
    this.refreshTokens.add(refresh);
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "User.Read Mail.Read Mail.Send",
    };
  }

  requireToken(req, res, next) {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if ((this.accessTokens.get(token) || 0) <= Date.now()) {
      return res.status(401).json({
        error: {
          code: "InvalidAuthenticationToken",
          message: "Local synthetic token is absent or expired",
        },
      });
    }
    next();
  }

  async createSubscription(req, res) {
    const expected = `${settings.appUrl}/api/webhooks/mail`;
    if (req.body.notificationUrl !== expected)
      return res.status(400).json({
        error: {
          code: "InvalidSubscription",
          message: "Only the local webhook is allowed",
        },
      });
    const validationToken = randomUUID();
    const validation = await fetch(
      `${expected}?validationToken=${validationToken}`,
      { method: "POST", signal: AbortSignal.timeout(5000) },
    );
    if (!validation.ok || (await validation.text()) !== validationToken)
      throw new Error("Local webhook validation failed");
    const subscription = { ...req.body, id: randomUUID() };
    this.subscriptions.set(subscription.id, subscription);
    logEvent("SUBSCRIPTION_CREATED", { subscriptionId: subscription.id });
    res.status(201).json(subscription);
  }

  async inject({ kind = "steam", username, code, variant = "computer" }) {
    if (!["steam", "security"].includes(kind))
      throw new Error("kind must be steam or security");
    if (!["computer", "web", "guard-body"].includes(variant))
      throw new Error("Unknown local Steam message variant");
    if (
      kind === "steam" &&
      (!/^\w{1,80}$/.test(username || "") || !/^[A-Z0-9]{5}$/.test(code || ""))
    )
      throw new Error(
        "Use an alphanumeric username and a five-character uppercase code",
      );
    const active = [...this.subscriptions.values()].filter(
      (s) => new Date(s.expirationDateTime).getTime() > Date.now(),
    );
    if (!active.length)
      throw new Error("Connect the synthetic Microsoft mailbox first");
    const id = `local-message-${randomUUID()}`;
    const message = {
      id,
      internetMessageId: `<${id}@local.test>`,
      receivedDateTime: new Date().toISOString(),
      from: {
        emailAddress: {
          address:
            kind === "steam"
              ? "noreply@steampowered.com"
              : "account-security-noreply@accountprotection.microsoft.com",
          name: "LOCAL SIMULATION",
        },
      },
      toRecipients: [{ emailAddress: { address: settings.mailbox } }],
      subject:
        kind === "steam"
          ? {
              computer: "Steam access from new computer",
              web: "Your Steam account: Access from new web or mobile device",
              "guard-body": "Your Steam Guard code",
            }[variant]
          : "Synthetic Microsoft security notice",
      body: {
        contentType: "html",
        content:
          kind === "steam"
            ? variant === "guard-body"
              ? `<p>Dear ${username},</p><p>Here is the <b>Steam Guard</b>&nbsp;code you need: ${code}</p>`
              : `<p>${username}, It looks like you are signing in from a new device.</p><p>${code}</p>`
            : "<p>This is a local simulated security notice, not a real account alert.</p>",
      },
    };
    this.messages.set(id, message);
    logEvent(
      kind === "steam" ? "STEAM_MESSAGE_INJECTED" : "SECURITY_MESSAGE_INJECTED",
      { messageId: id, username, code },
    );
    for (const subscription of active) {
      const response = await fetch(subscription.notificationUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          value: [
            {
              subscriptionId: subscription.id,
              clientState: subscription.clientState,
              changeType: "created",
              resource: `/me/messages/${id}`,
              resourceData: { id },
            },
          ],
        }),
      });
      if (response.status !== 202)
        throw new Error(`Local webhook returned ${response.status}`);
    }
    return { messageId: id, username, code, notifications: active.length };
  }

  createApp() {
    const app = express();
    const wrap = (handler) => (req, res, next) =>
      Promise.resolve(handler(req, res)).catch(next);
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.get("/__demo/health", (_req, res) =>
      res.json({
        mode: "LOCAL_SIMULATION",
        workspaceId: settings.workspaceId,
        runId: process.env.LOCAL_DEMO_RUN_ID,
      }),
    );

    app.get("/oauth/authorize", (req, res) => {
      if (
        req.query.client_id !== "local-demo-client" ||
        req.query.redirect_uri !==
          `${settings.appUrl}/api/auth/microsoft/callback` ||
        !req.query.state
      )
        return res.status(400).json({ error: "Invalid local OAuth request" });
      const code = `local-code-${randomUUID()}`;
      this.codes.add(code);
      const redirect = new URL(req.query.redirect_uri);
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", req.query.state);
      logEvent("MOCK_OAUTH_APPROVED", { mailbox: settings.mailbox });
      res.redirect(redirect.href);
    });

    app.post("/oauth/token", (req, res) => {
      if (
        req.body.client_id !== "local-demo-client" ||
        req.body.client_secret !== "local-demo-client-secret"
      )
        return res.status(401).json({
          error: "invalid_client",
          error_description: "Local client credentials do not match",
        });
      const refreshing = req.body.grant_type === "refresh_token";
      const allowed = refreshing
        ? this.refreshTokens.has(req.body.refresh_token)
        : req.body.grant_type === "authorization_code" &&
          this.codes.delete(req.body.code);
      if (!allowed)
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Unknown local synthetic grant",
        });
      const tokens = this.issueTokens();
      logEvent(refreshing ? "TOKEN_REFRESHED" : "TOKEN_ISSUED", {
        mailbox: settings.mailbox,
      });
      res.json(tokens);
    });

    app.use("/v1.0", this.requireToken.bind(this));
    app.get("/v1.0/me", (_req, res) => res.json(this.profile));
    app.get("/v1.0/me/mailFolders/inbox", (_req, res) =>
      res.json({ id: "local-inbox", displayName: "Inbox" }),
    );
    app.get("/v1.0/me/messages/:id", (req, res) => {
      const message = this.messages.get(req.params.id);
      if (!message)
        return res.status(404).json({
          error: {
            code: "ErrorItemNotFound",
            message: "Synthetic message not found",
          },
        });
      logEvent("GRAPH_MESSAGE_READ", { messageId: message.id });
      res.json(message);
    });
    app.post("/v1.0/subscriptions", wrap(this.createSubscription.bind(this)));
    app.patch("/v1.0/subscriptions/:id", (req, res) => {
      const subscription = this.subscriptions.get(req.params.id);
      if (!subscription)
        return res.status(404).json({ error: { code: "InvalidSubscription" } });
      subscription.expirationDateTime = req.body.expirationDateTime;
      logEvent("SUBSCRIPTION_RENEWED", { subscriptionId: subscription.id });
      res.json(subscription);
    });
    app.delete("/v1.0/subscriptions/:id", (req, res) => {
      const removed = this.subscriptions.delete(req.params.id);
      res.status(removed ? 204 : 404).end();
    });

    app.use("/__demo", (req, res, next) => {
      if (
        !process.env.LOCAL_DEMO_CONTROL_TOKEN ||
        req.headers["x-local-demo-token"] !==
          process.env.LOCAL_DEMO_CONTROL_TOKEN
      )
        return res.status(403).json({ error: "Local control token required" });
      next();
    });
    app.post(
      "/__demo/steam",
      wrap(async (req, res) => res.json(await this.inject(req.body))),
    );
    app.get("/__demo/subscriptions", (_req, res) =>
      res.json({ count: this.subscriptions.size }),
    );
    app.post("/__demo/stop", (_req, res) => {
      res.json({ stopping: true });
      process.send?.({ type: "stop-demo" });
    });
    app.use((error, _req, res, _next) => {
      console.error(error.message);
      res.status(500).json({ error: error.message, mode: "LOCAL_SIMULATION" });
    });
    return app;
  }
}

module.exports = MockMicrosoft;
