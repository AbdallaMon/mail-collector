const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createHarness, plain } = require("./support/load-app");

test("Steam payload keeps the PHP HMAC contract and omits the mail body", async () => {
  let request;
  const h = createHarness({
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => '{"ok":true,"saved":true}',
      };
    },
  });
  const api = h.load("src/services/steamApi.service.js");
  const message = {
    id: "message-1",
    from: { emailAddress: { address: "noreply@steampowered.com" } },
    toRecipients: [{ emailAddress: { address: "mailbox@example.test" } }],
    subject: "Access from new computer",
    body: { content: "private body" },
    receivedDateTime: "2026-10-19T10:00:00Z",
  };
  const result = await api.sendSteamToApi({
    fromAccount: "mailbox@example.test",
    message,
    parsed: { username: "demo", code: "A1B2C" },
  });
  assert.equal(result.success, true);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.code, "A1B2C");
  assert.equal(payload.username, "demo");
  assert.equal(payload.graphMessageId, "message-1");
  assert.equal("body" in payload, false);
  assert.equal(
    request.options.headers["X-Signature"],
    crypto
      .createHmac("sha256", h.config.steam.apiSecret)
      .update(
        `${request.options.headers["X-Timestamp"]}.${request.options.body}`,
      )
      .digest("hex"),
  );
});

test("Steam parsing, filtering, skips and successful API delivery keep their current behavior", async () => {
  let sends = 0;
  const h = createHarness({
    fetch: async () => {
      sends++;
      return {
        ok: true,
        status: 200,
        text: async () => '{"ok":true,"saved":true}',
      };
    },
  });
  h.db.systemSetting.findUnique = async () => null;
  const logs = [];
  h.db.mailMessageLog.upsert = async (args) => logs.push(args);
  const forwarder = h.load("src/services/forwarder.service.js");
  const base = {
    id: "m1",
    from: { emailAddress: { address: "noreply@steampowered.com" } },
    subject: "Steam access from new computer",
    body: {
      contentType: "html",
      content: "<p>demo, It looks like you are signing in.</p><b>A1B2C</b>",
    },
  };
  const result = await forwarder.forwardGraphMessage(
    base,
    [],
    "mailbox@example.test",
    "account-1",
  );
  assert.equal(result.mode, "API");
  assert.equal(sends, 1);
  assert.equal(
    (
      await forwarder.forwardGraphMessage(
        { ...base, subject: "Steam sale" },
        [],
        "mailbox@example.test",
        "account-1",
      )
    ).mode,
    "SKIP_SUBJECT",
  );
  assert.equal(sends, 1);
  assert.equal(logs.at(-1).create.forwardStatus, "SKIPPED");
  const policy = h.load("src/modules/webhooks/webhooks.policy.js");
  assert.equal(policy.isSteamMessage(base), true);
  assert.equal(
    policy.isSteamMessage({
      from: { emailAddress: { address: "notice@unrelated.test" } },
    }),
    false,
  );
});

test("inactive accounts and invalid webhook client state never fetch or enqueue messages", async () => {
  const h = createHarness();
  h.db.mailAccount.findUnique = async () => ({
    status: "NEEDS_REAUTH",
    isEnabled: true,
  });
  const usecase = h.load("src/modules/webhooks/webhooks.usecase.js");
  assert.equal(
    (
      await usecase.processMessage({
        data: {
          accountId: "a",
          accountEmail: "a@example.test",
          messageId: "m",
        },
      })
    ).status,
    "ACCOUNT_INACTIVE",
  );
  h.db.webhookSubscription.findUnique = async () => ({
    accountId: "a",
    clientState: "expected",
  });
  let queued = false;
  await usecase.enqueueNotification(
    { subscriptionId: "s", clientState: "wrong", resourceData: { id: "m" } },
    {
      add: async () => {
        queued = true;
      },
    },
  );
  assert.equal(queued, false);
});

test("Steam accepts new-access subjects or a Guard phrase in the body without widening the sender filter", async () => {
  const requests = [];
  const h = createHarness({
    fetch: async (_url, options) => {
      requests.push(options);
      return {
        ok: true,
        status: 200,
        text: async () => '{"ok":true,"saved":true}',
      };
    },
  });
  h.db.systemSetting.findUnique = async () => null;
  h.db.mailMessageLog.upsert = async () => {};
  const forwarder = h.load("src/services/forwarder.service.js");
  const body = "<p>demo, It looks like you are signing in.</p><p>A1B2C</p>";
  for (const subject of [
    "Your Steam account: Access from new computer",
    "Your Steam account: Access from new web or mobile device",
    "Steam ACCESS FROM NEW device type",
  ]) {
    const result = await forwarder.forwardGraphMessage(
      {
        id: `subject-${requests.length}`,
        from: { emailAddress: { address: "noreply@steampowered.com" } },
        subject,
        body: { contentType: "html", content: body },
      },
      [],
      "mailbox@example.test",
      "account-1",
    );
    assert.equal(result.delivered, true);
    assert.equal(JSON.parse(requests.at(-1).body).hasSteamGuardCodeText, false);
  }
  for (const [contentType, content] of [
    ["text", "Dear demo,\nHERE IS THE STEAM GUARD CODE you need: A1B2C"],
    [
      "html",
      "<p>Dear demo,</p><p>Here is the <b>Steam Guard</b>&nbsp;code you need: A1B2C</p>",
    ],
  ]) {
    const result = await forwarder.forwardGraphMessage(
      {
        id: `body-${requests.length}`,
        from: { emailAddress: { address: "noreply@steampowered.com" } },
        subject: "Your Steam Guard code",
        body: { contentType, content },
      },
      [],
      "mailbox@example.test",
      "account-1",
    );
    assert.equal(result.delivered, true);
    const sent = requests.at(-1);
    const payload = JSON.parse(sent.body);
    assert.equal(payload.hasSteamGuardCodeText, true);
    assert.equal(payload.username, "demo");
    assert.equal(payload.code, "A1B2C");
    assert.equal("body" in payload, false);
    assert.equal(
      sent.headers["X-Signature"],
      crypto
        .createHmac("sha256", h.config.steam.apiSecret)
        .update(`${sent.headers["X-Timestamp"]}.${sent.body}`)
        .digest("hex"),
    );
  }
  for (const [from, subject, content] of [
    ["noreply@steampowered.com", "Steam sale", body],
    [
      "notice@example.test",
      "Steam access from new computer",
      "Dear demo, Here is the Steam Guard code A1B2C",
    ],
    ["noreply@steampowered.com", "Steam from new computer", body],
  ]) {
    const result = await forwarder.forwardGraphMessage(
      {
        id: "ignored",
        from: { emailAddress: { address: from } },
        subject,
        body: { contentType: "html", content },
      },
      [],
      "mailbox@example.test",
      "account-1",
    );
    assert.equal(result.delivered, false);
  }
  assert.equal(requests.length, 5);
  const missingCode = h
    .load("src/services/steamApi.service.js")
    .extractSteamCodeAndUsername({
      subject: "Steam Guard",
      bodyType: "text",
      body: "Dear demo, HERE IS THE STEAM GUARD CODE",
    });
  assert.equal(missingCode.hasSteamGuardCodeText, true);
  assert.equal(missingCode.code, null);
});

test("OAuth refresh persists replacement tokens using the existing encryption format", async () => {
  const h = createHarness({
    modules: {
      axios: {
        post: async () => ({
          data: {
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
            scope: "Mail.Read",
          },
        }),
      },
    },
  });
  const encryption = h.load("src/utils/encryption.js");
  h.db.mailToken.findUnique = async () => ({
    accessToken: encryption.encrypt("old-access"),
    refreshToken: encryption.encrypt("old-refresh"),
    expiresAt: new Date(0),
  });
  let stored;
  h.db.mailToken.upsert = async (args) => {
    stored = args;
  };
  const auth = h.load("src/services/microsoftAuth.service.js");
  assert.equal(await auth.getValidAccessToken("a"), "new-access");
  assert.equal(encryption.decrypt(stored.update.refreshToken), "new-refresh");
  assert.equal(encryption.decrypt(stored.update.accessToken), "new-access");
});

test("temporary refresh failures retain the account connection", async () => {
  const h = createHarness({
    modules: {
      axios: {
        post: async () => {
          throw Object.assign(new Error("temporary network failure"), {
            code: "ECONNRESET",
          });
        },
      },
    },
  });
  const encryption = h.load("src/utils/encryption.js");
  h.db.mailToken.findUnique = async () => ({
    refreshToken: encryption.encrypt("refresh"),
    expiresAt: new Date(0),
  });
  let changed;
  h.db.mailAccount.update = async (args) => {
    changed = args;
  };
  await assert.rejects(
    h.load("src/services/microsoftAuth.service.js").getValidAccessToken("a"),
    /temporary network failure/,
  );
  assert.equal(changed.data.status, undefined);
  assert.match(changed.data.lastError, /temporary network failure/);
});

test("maintenance scheduling retains current queue names, retry policy and job identifiers", async () => {
  const h = createHarness();
  const Worker = h.load("src/workers/webhookMaintenance.worker.js");
  h.db.webhookSubscription.findMany = async (args) =>
    args.where ? [{ accountId: "existing" }] : [];
  h.db.mailAccount.findMany = async () => [
    { id: "new", email: "new@example.test" },
  ];
  const worker = new Worker();
  await worker.planMaintenance();
  assert.equal(h.queues[0].name, "mail-sync");
  assert.equal(h.queues[0].options.defaultJobOptions.removeOnFail, 200);
  assert.deepEqual(
    h.queues[0].added.map((a) => a[2].jobId),
    ["webhook:create:new", "webhook:renew:existing"],
  );
  assert.equal(h.queues[0].processors.length, 3);
});

test("account pagination, creation audit and invalid sync transitions are preserved", async () => {
  const h = createHarness();
  let criteria;
  h.db.mailAccount.findMany = async (args) => {
    criteria = args;
    return [];
  };
  h.db.mailAccount.count = async () => 0;
  const usecase = h.load("src/modules/accounts/accounts.usecase.js");
  const result = await usecase.list({
    page: "-2",
    limit: "999",
    health: "working",
    q: " abc ",
  });
  assert.deepEqual(plain(result.pagination), {
    page: 1,
    limit: 200,
    total: 0,
    pages: 0,
  });
  assert.deepEqual(plain(criteria.where), {
    status: "CONNECTED",
    email: { contains: "abc" },
  });
  h.db.mailAccount.findUnique = async () => ({ status: "NEEDS_REAUTH" });
  await assert.rejects(usecase.sync("a"), { statusCode: 400 });
  h.db.mailAccount.findUnique = async () => null;
  h.db.mailAccount.create = async ({ data }) => ({ id: "new", ...data });
  let audit;
  h.db.systemLog.create = async (args) => {
    audit = args;
  };
  const created = await usecase.create({ email: "new@example.test" });
  assert.equal(created.created, true);
  assert.equal(audit.data.accountId, "new");
  assert.ok(
    created.data.connectUrl.startsWith("https://login.example.test/authorize?"),
  );
});

test("updated bcrypt and JWT still support dashboard login and deny wrong passwords", async () => {
  const h = createHarness();
  const bcrypt = require("bcryptjs");
  const user = {
    id: "admin",
    email: "admin@example.test",
    password: await bcrypt.hash("password-123", 10),
    role: "admin",
    isActive: true,
  };
  h.db.adminUser.findUnique = async () => user;
  const auth = h.load("src/modules/auth/auth.usecase.js");
  await assert.rejects(auth.login({ email: user.email, password: "wrong" }), {
    statusCode: 401,
  });
  const data = await auth.login({
    email: user.email,
    password: "password-123",
  });
  assert.equal(
    require("jsonwebtoken").verify(data.token, h.config.jwt.secret).userId,
    "admin",
  );
  assert.equal("password" in data.user, false);
});

test("updated Nodemailer composes notification mail locally without SMTP", async () => {
  const transport = require("nodemailer").createTransport({
    jsonTransport: true,
  });
  const result = await transport.sendMail({
    from: "sender@example.test",
    to: ["recipient@example.test"],
    subject: "Synthetic compatibility check",
    html: "<p>Test only</p>",
  });
  const message = JSON.parse(result.message);
  assert.equal(message.subject, "Synthetic compatibility check");
  assert.equal(message.to[0].address, "recipient@example.test");
});

test("Bull timer identifiers remain compatible with the updated UUID dependency", () => {
  const TimerManager = require("bull/lib/timer-manager");
  const timer = new TimerManager();
  const id = timer.set("compatibility", 60000, () => {});
  assert.match(
    id,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
  );
  timer.clear(id);
});
