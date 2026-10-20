const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../..");
const rejectIO = () => {
  throw new Error("External I/O is disabled in tests");
};

function createHarness(overrides = {}) {
  const calls = [];
  const queues = [];
  const config = {
    nodeEnv: "test",
    port: 5000,
    apiUrl: "https://collector.example.test",
    frontendUrl: "https://collector.example.test",
    webhook: { url: "https://collector.example.test/api/webhooks/mail" },
    devEmail: "dev@example.test",
    jwt: { secret: "test-only-jwt-secret", expiresIn: "7d" },
    encryptionKey: "test-only-encryption-key",
    microsoft: {
      clientId: "test-client",
      clientSecret: "test-secret",
      redirectUri: "https://collector.example.test/api/auth/microsoft/callback",
      scopes: ["offline_access", "User.Read", "Mail.Read", "Mail.Send"],
      authorizeUrl: "https://login.example.test/authorize",
      tokenUrl: "https://login.example.test/token",
      graphBaseUrl: "https://graph.example.test/v1.0",
    },
    forwarding: { toEmail: "notifications@example.test" },
    smtp: {
      host: "smtp.example.test",
      port: 465,
      secure: true,
      user: "user",
      pass: "pass",
      from: "test@example.test",
    },
    steam: {
      apiUrl: "https://receiver.example.test/api/steam_inbound.php",
      apiSecret: "test-shared-signing-secret",
      timeoutMs: 5000,
      only: true,
      allowedDomains: ["steampowered.com"],
      allowedSenders: [],
      forwardDelayMs: 1,
    },
    redis: { host: "127.0.0.1", port: 6379 },
    worker: { pollIntervalMs: 10000, maxRetries: 5 },
    admin: { email: "admin@example.test", password: "test-password" },
  };
  const db = {};
  for (const model of [
    "adminUser",
    "mailAccount",
    "mailToken",
    "mailSyncState",
    "mailMessageLog",
    "systemLog",
    "systemSetting",
    "webhookSubscription",
  ]) {
    db[model] = new Proxy(
      {},
      {
        get(target, key) {
          return target[key] || rejectIO;
        },
      },
    );
  }
  db.$connect = async () => {};
  db.$disconnect = async () => {};
  db.$queryRaw = async () => [{ result: 1 }];
  db.$transaction = async (handler) => handler(db);
  class FakeQueue {
    constructor(name, options) {
      this.name = name;
      this.options = options;
      this.processors = [];
      this.added = [];
      queues.push(this);
    }
    process(...args) {
      this.processors.push(args);
    }
    on() {}
    async add(...args) {
      this.added.push(args);
      return { id: "test-job" };
    }
    async getJob() {
      return null;
    }
    async isReady() {}
    async close() {}
  }
  const quiet = { log() {}, error() {}, warn() {}, info() {} };
  const modules = {
    [path.join(root, "src/config/index.js")]: config,
    [path.join(root, "src/config/database.js")]: db,
    [path.join(root, "src/config/logger.js")]: quiet,
    dotenv: { config: () => ({ parsed: {} }) },
    bull: FakeQueue,
    axios: {
      create: rejectIO,
      get: rejectIO,
      post: rejectIO,
      patch: rejectIO,
      delete: rejectIO,
    },
    nodemailer: {
      createTransport: () => ({
        sendMail: async (data) => {
          calls.push({ type: "smtp", data });
          return {};
        },
      }),
    },
    ...overrides.modules,
  };
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (Object.hasOwn(modules, absolute)) return modules[absolute];
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const realRequire = createRequire(absolute);
    const scopedRequire = (name) => {
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name.startsWith(".")) return load(realRequire.resolve(name));
      if (
        [
          "express",
          "cors",
          "helmet",
          "morgan",
          "express-rate-limit",
          "bcryptjs",
          "jsonwebtoken",
          "crypto-js",
          "crypto",
          "node:crypto",
          "path",
          "node:path",
        ].includes(name)
      )
        return realRequire(name);
      throw new Error(`Unexpected dependency in isolated test: ${name}`);
    };
    const context = vm.createContext({
      Buffer,
      URLSearchParams,
      URL,
      AbortController,
      Date,
      console: quiet,
      setTimeout,
      clearTimeout,
      fetch: overrides.fetch || rejectIO,
      process: {
        env: { NODE_ENV: "test" },
        on() {},
        exit: rejectIO,
        uptime: () => 1,
        memoryUsage: () => ({ rss: 0 }),
      },
    });
    const fn = new vm.Script(
      `(function(require,module,exports,__filename,__dirname){${fs.readFileSync(absolute, "utf8")}\n})`,
      { filename: absolute },
    ).runInContext(context);
    fn(scopedRequire, module, module.exports, absolute, path.dirname(absolute));
    return module.exports;
  }
  return { load, config, db, queues, calls };
}

module.exports = {
  createHarness,
  plain: (value) => JSON.parse(JSON.stringify(value)),
};
