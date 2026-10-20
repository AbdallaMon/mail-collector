const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const settings = require("../scripts/local-demo/settings");
const MockMicrosoft = require("../scripts/local-demo/mock-microsoft");

test("local demo uses fixed isolated targets and rejects remote/other database URLs", () => {
  const env = settings.environment();
  assert.equal(new URL(env.DATABASE_URL).pathname, "/mail_collector_demo");
  assert.equal(new URL(env.DATABASE_URL).port, "3368");
  assert.equal(env.REDIS_PORT, "6398");
  assert.throws(
    () => settings.assertLocalUrl("https://graph.microsoft.com/v1.0"),
    /non-loopback/,
  );
  assert.throws(
    () =>
      settings.assertLocalUrl("mysql://user:pass@127.0.0.1:3306/production"),
    /different database/,
  );
});

test("local bootstrap does not read production dotenv files or inherit provider targets", () => {
  const script = `
    const fs = require('node:fs');
    const original = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      if (typeof file === 'string' && /[\\\\/]\\.env(?:\\.test)?$/.test(file)) throw new Error('Production environment was read');
      return original.call(this, file, ...args);
    };
    const config = require('./scripts/local-demo/bootstrap');
    if (config.microsoft.tokenUrl !== 'http://127.0.0.1:5561/oauth/token') throw new Error('External provider target');
    if (config.steam.apiUrl !== 'http://127.0.0.1:5562/api/steam_inbound.php') throw new Error('External PHP target');
    console.log('isolated');
  `;
  const output = execFileSync(process.execPath, ["-e", script], {
    cwd: settings.root,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...settings.environment(),
      STEAM_API_URL: "https://not-local.invalid/api",
      MICROSOFT_CLIENT_SECRET: "must-not-be-used",
    },
  });
  assert.equal(output.trim(), "isolated");
});

test("mock provider rejects external redirects and unauthenticated Graph access", async () => {
  const app = new MockMicrosoft().createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const params = new URLSearchParams({
      client_id: "local-demo-client",
      redirect_uri: "https://not-local.invalid/callback",
      state: "synthetic",
    });
    assert.equal(
      (await fetch(`${base}/oauth/authorize?${params}`, { redirect: "manual" }))
        .status,
      400,
    );
    assert.equal((await fetch(`${base}/v1.0/me`)).status, 401);
    assert.equal(
      (
        await fetch(`${base}/__demo/steam`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
