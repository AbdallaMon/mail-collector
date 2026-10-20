const test = require("node:test");
const assert = require("node:assert/strict");
const { createHarness, plain } = require("./support/load-app");

test("Microsoft failures distinguish account consent, application configuration and transient outages", () => {
  const policy = createHarness().load("src/utils/upstreamErrorPolicy.js");
  const classify = (status, data) =>
    policy.microsoftRefreshError({
      message: "Request failed",
      response: { status, data, headers: { "retry-after": "45" } },
      config: { data: "secret-do-not-retain" },
    });
  const account = classify(400, {
    error: "invalid_grant",
    error_codes: [70000],
  });
  assert.equal(account.needsReauth, true);
  assert.equal(policy.backoff(1, account), -1);
  const app = classify(400, { error: "invalid_grant", error_codes: [7000222] });
  assert.equal(app.appConfigurationError, true);
  assert.equal(app.needsReauth, false);
  assert.equal(app.config, undefined);
  assert.equal(app.cause, undefined);
  for (const status of [429, 503]) {
    const temporary = classify(status, { error: "temporarily_unavailable" });
    assert.equal(temporary.needsReauth, false);
    assert.equal(policy.backoff(1, temporary), 45000);
  }
  assert.equal(policy.isRetryable({ code: "ECONNRESET" }), true);
  assert.equal(policy.isRetryable({ code: "P2034" }), true);
  assert.equal(policy.isRetryable({ response: { status: 403 } }), false);
});

test("only an account-specific token rejection changes the connection status", async () => {
  for (const [oauthCode, aad, expected] of [
    ["invalid_grant", 70000, "NEEDS_REAUTH"],
    ["invalid_client", 7000222, undefined],
  ]) {
    const h = createHarness({
      modules: {
        axios: {
          post: async () => {
            throw Object.assign(new Error("Rejected"), {
              response: {
                status: 400,
                data: { error: oauthCode, error_codes: [aad] },
              },
            });
          },
        },
      },
    });
    const encryption = h.load("src/utils/encryption.js");
    h.db.mailToken.findUnique = async () => ({
      refreshToken: encryption.encrypt("test"),
      expiresAt: new Date(0),
    });
    let update;
    h.db.mailAccount.update = async (args) => {
      update = args;
    };
    await assert.rejects(
      h.load("src/services/microsoftAuth.service.js").getValidAccessToken("a"),
    );
    assert.equal(update.data.status, expected);
  }
});

test("Graph retries a rejected access token once using a forced refresh", async () => {
  let reads = 0;
  const h = createHarness({
    modules: {
      axios: {
        create: () => ({
          get: async () => {
            if (++reads === 1)
              throw Object.assign(new Error("expired"), {
                response: { status: 401 },
              });
            return { data: { id: "message" } };
          },
        }),
      },
    },
  });
  const requests = [];
  h.load("src/services/microsoftAuth.service.js").getValidAccessToken = async (
    ...args
  ) => {
    requests.push(args);
    return "synthetic-token";
  };
  assert.equal(
    (
      await h
        .load("src/services/graph.service.js")
        .getMessageForWebhook("a", "message")
    ).id,
    "message",
  );
  assert.equal(reads, 2);
  assert.equal(requests[1][1].forceRefresh, true);
});

test("maintenance recycles retained terminal jobs and preserves in-flight jobs", async () => {
  const h = createHarness();
  const Worker = h.load("src/workers/webhookMaintenance.worker.js");
  const worker = new Worker();
  for (const state of [
    "failed",
    "completed",
    "active",
    "waiting",
    "delayed",
    "paused",
  ]) {
    let removed = 0;
    worker.queue.getJob = async () => ({
      getState: async () => state,
      remove: async () => {
        removed++;
      },
    });
    const added = await worker.enqueueMaintenanceJob(
      "renew",
      { accountId: "a" },
      "renew:a",
      0,
    );
    const terminal = ["failed", "completed"].includes(state);
    assert.equal(added, terminal);
    assert.equal(removed, terminal ? 1 : 0);
  }
  assert.equal(worker.queue.added.length, 2);
  assert.equal(worker.queue.options.defaultJobOptions.attempts, 5);
  assert.equal(worker.queue.options.defaultJobOptions.removeOnComplete, true);
});

test("maintenance rechecks disabled accounts before touching Graph", async () => {
  const h = createHarness();
  h.db.mailAccount.findUnique = async () => ({
    status: "CONNECTED",
    isEnabled: false,
  });
  const Worker = h.load("src/workers/webhookMaintenance.worker.js");
  const worker = new Worker();
  assert.equal(
    (await worker.renewSubscription({ data: { accountId: "a" } })).skipped,
    true,
  );
  assert.equal(
    (await worker.createSubscription({ data: { accountId: "a" } })).skipped,
    true,
  );
});

test("receiver responses distinguish saved, already saved, ignored and invalid responses", async () => {
  for (const [body, delivered] of [
    [{ ok: true, saved: true }, true],
    [{ ok: true, saved: false, reason: "DUPLICATE_RECENT" }, true],
    [{ ok: true, ignored: true, reason: "MISSING_USERNAME_OR_CODE" }, false],
  ]) {
    const h = createHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
      }),
    });
    const result = await h
      .load("src/services/steamApi.service.js")
      .sendSteamToApi({ message: { id: "m" } });
    assert.equal(result.delivered, delivered);
  }
  const h = createHarness({
    fetch: async () => ({
      ok: false,
      status: 503,
      statusText: "Unavailable",
      headers: { get: () => "30" },
      text: async () => '{"ok":false,"err":"BUSY"}',
    }),
  });
  await assert.rejects(
    h
      .load("src/services/steamApi.service.js")
      .sendSteamToApi({ message: { id: "m" } }),
    (error) =>
      error.retryable && error.retryAfterMs === 30000 && error.status === 503,
  );
});

test("Graph throttling preserves connection and developer mail even when error storage fails", async () => {
  const h = createHarness();
  h.db.mailAccount.findUnique = async () => ({
    status: "CONNECTED",
    isEnabled: true,
  });
  h.db.mailMessageLog.findUnique = async () => null;
  // The harness rejects unconfigured database calls: error logging fails here.
  h.db.systemSetting.findUnique = async () => null;
  const error = Object.assign(new Error("Graph throttled"), {
    response: { status: 429, headers: { "retry-after": "30" } },
  });
  h.load("src/services/graph.service.js").getMessageForWebhook = async () => {
    throw error;
  };
  const updates = [];
  h.db.mailAccount.update = async (args) => {
    updates.push(args);
  };
  let discarded = false;
  await assert.rejects(
    h.load("src/modules/webhooks/webhooks.usecase.js").processMessage({
      data: { accountId: "a", accountEmail: "a@example.test", messageId: "m" },
      attemptsMade: 0,
      opts: { attempts: 5 },
      discard() {
        discarded = true;
      },
    }),
    /Graph throttled/,
  );
  assert.equal(discarded, false);
  assert.equal(updates.length, 0);
  assert.equal(h.calls.filter((call) => call.type === "smtp").length, 1);
  assert.equal(h.calls[0].data.to, h.config.devEmail);
});

test("Steam outages retain both existing developer notification paths", async () => {
  const h = createHarness({
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  h.db.mailAccount.findUnique = async () => ({
    status: "CONNECTED",
    isEnabled: true,
  });
  h.db.mailMessageLog.findUnique = async () => null;
  h.db.systemSetting.findUnique = async () => null;
  h.load("src/services/graph.service.js").getMessageForWebhook = async () => ({
    id: "m",
    subject: "Steam access from new computer",
    from: { emailAddress: { address: "noreply@steampowered.com" } },
    body: {
      contentType: "text",
      content: "demo, It looks like you are signing in. A1B2C",
    },
  });
  await assert.rejects(
    h.load("src/modules/webhooks/webhooks.usecase.js").processMessage({
      data: { accountId: "a", accountEmail: "a@example.test", messageId: "m" },
      attemptsMade: 0,
      opts: { attempts: 5 },
    }),
    /fetch failed/,
  );
  assert.equal(h.calls.filter((call) => call.type === "smtp").length, 2);
  assert.ok(h.calls.every((call) => call.data.to === h.config.devEmail));
});

test("confirmed messages bypass another delivery and are never downgraded by failure logging", async () => {
  const h = createHarness();
  h.db.mailAccount.findUnique = async () => ({
    status: "CONNECTED",
    isEnabled: true,
  });
  h.db.mailMessageLog.findUnique = async () => ({ forwardStatus: "FORWARDED" });
  const result = await h
    .load("src/modules/webhooks/webhooks.usecase.js")
    .processMessage({
      data: { accountId: "a", accountEmail: "a@example.test", messageId: "m" },
    });
  assert.equal(result.status, "ALREADY_FORWARDED");
  let query;
  h.db.mailMessageLog.upsert = async () => {};
  h.db.mailMessageLog.updateMany = async (args) => {
    query = args;
    return { count: 0 };
  };
  const saved = await h
    .load("src/repositories/messageLog.repo.js")
    .recordFailure({
      where: {},
      create: { accountId: "a", graphMessageId: "m" },
      update: { forwardStatus: "FAILED" },
    });
  assert.equal(saved.count, 0);
  assert.deepEqual(plain(query.where.forwardStatus), { not: "FORWARDED" });
});
