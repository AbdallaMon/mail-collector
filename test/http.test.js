const test = require("node:test");
const assert = require("node:assert/strict");
const { createHarness } = require("./support/load-app");

test("assembled app serves pages, denies unauthenticated API reads and accepts Graph validation", async () => {
  const h = createHarness();
  const app = h.load("src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const denied = await fetch(`${base}/api/accounts`);
    assert.equal(denied.status, 401);
    const validation = await fetch(
      `${base}/api/webhooks/mail?validationToken=sample-token`,
      { method: "POST" },
    );
    assert.equal(validation.status, 200);
    assert.equal(await validation.text(), "sample-token");
    assert.match(validation.headers.get("content-type"), /text\/plain/);
    const notification = await fetch(`${base}/api/webhooks/mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"value":[]}',
    });
    assert.equal(notification.status, 202);
    for (const page of [
      "/",
      "/accounts",
      "/dashboard",
      "/settings",
      "/logs",
      "/oauth/callback",
    ])
      assert.equal((await fetch(base + page)).status, 200, page);
    assert.equal(h.calls.length, 0); // No mail or API delivery during startup/validation.
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("HTTP login, account list and log detail keep their response contracts", async () => {
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
  h.db.mailAccount.findMany = async () => [];
  h.db.mailAccount.count = async () => 0;
  h.db.mailMessageLog.findUnique = async () => null;
  const app = h.load("src/app.js"),
    server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "password-123" }),
    });
    assert.equal(login.status, 200);
    const { data } = await login.json();
    const headers = { Authorization: `Bearer ${data.token}` };
    const accounts = await fetch(base + "/api/accounts", { headers });
    assert.equal(accounts.status, 200);
    assert.deepEqual((await accounts.json()).data.pagination, {
      page: 1,
      limit: 50,
      total: 0,
      pages: 0,
    });
    const missing = await fetch(base + "/api/logs/missing", { headers });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).message, "Log not found");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
