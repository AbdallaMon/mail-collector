const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

class LocalDemoSettings {
  constructor() {
    this.root = path.resolve(__dirname, "../..");
    this.directory = path.join(this.root, ".local-demo");
    this.compose = path.join(this.root, "local-demo/compose.yaml");
    this.project = "mail-collector-local";
    this.workspaceId = crypto
      .createHash("sha256")
      .update(this.root)
      .digest("hex");
    this.ports = {
      app: 5560,
      provider: 5561,
      receiver: 5562,
      smtp: 5563,
      mysql: 3368,
      redis: 6398,
    };
    this.appUrl = `http://127.0.0.1:${this.ports.app}`;
    this.providerUrl = `http://127.0.0.1:${this.ports.provider}`;
    this.receiverUrl = `http://127.0.0.1:${this.ports.receiver}`;
    this.adminEmail = "admin@local.test";
    this.adminPassword = "LocalDemo123!";
    this.mailbox = "steam-demo@outlook.local.test";
  }

  environment() {
    const env = {};
    for (const name of [
      "PATH",
      "Path",
      "SYSTEMROOT",
      "SystemRoot",
      "SystemDrive",
      "WINDIR",
      "COMSPEC",
      "ComSpec",
      "PATHEXT",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "LOCALAPPDATA",
      "APPDATA",
      "HOME",
      "HOMEDRIVE",
      "HOMEPATH",
      "ProgramData",
      "ProgramFiles",
      "ProgramFiles(x86)",
      "DOCKER_CONFIG",
    ]) {
      if (process.env[name]) env[name] = process.env[name];
    }
    return Object.assign(env, {
      MAIL_COLLECTOR_LOCAL_DEMO: "1",
      NODE_ENV: "development",
      PORT: String(this.ports.app),
      API_URL: this.appUrl,
      FRONTEND_URL: this.appUrl,
      WEBHOOK_URL: `${this.appUrl}/api/webhooks/mail`,
      DATABASE_URL: `mysql://local_demo:local-demo-password@127.0.0.1:${this.ports.mysql}/mail_collector_demo`,
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: String(this.ports.redis),
      REDIS_PASSWORD: "local-demo-redis",
      JWT_SECRET: "local-demo-jwt-not-for-production",
      JWT_EXPIRES_IN: "7d",
      ENCRYPTION_KEY: "local-demo-encryption-not-for-production",
      ADMIN_EMAIL: this.adminEmail,
      ADMIN_PASSWORD: this.adminPassword,
      MICROSOFT_CLIENT_ID: "local-demo-client",
      MICROSOFT_CLIENT_SECRET: "local-demo-client-secret",
      MICROSOFT_REDIRECT_URI: `${this.appUrl}/api/auth/microsoft/callback`,
      MICROSOFT_SCOPES: "offline_access User.Read Mail.Read Mail.Send",
      STEAM_API_URL: `${this.receiverUrl}/api/steam_inbound.php`,
      STEAM_API_SECRET: "local-demo-steam-secret-not-for-production",
      STEAM_API_TIMEOUT_MS: "5000",
      STEAM_ONLY: "true",
      STEAM_ALLOWED_DOMAINS: "steampowered.com",
      STEAM_ALLOWED_SENDERS: "noreply@steampowered.com",
      FORWARD_DELAY_MS: "50",
      FORWARD_TO_EMAIL: "notifications@local.test",
      DEV_EMAIL: "developer@local.test",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(this.ports.smtp),
      SMTP_SECURE: "false",
      SMTP_USER: "local-demo",
      SMTP_PASS: "local-demo",
      SMTP_FROM: "Local Demo <collector@local.test>",
      MAX_RETRIES: "5",
      POLL_INTERVAL_MS: "10000",
      LOG_LEVEL: "info",
      LOG_FILE: path.join(this.directory, "app.log"),
    });
  }

  assertLocalUrl(value) {
    const url = new URL(value);
    if (
      !["http:", "mysql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1"
    ) {
      throw new Error(`Local demo rejected a non-loopback URL`);
    }
    if (
      url.protocol === "mysql:" &&
      (url.port !== String(this.ports.mysql) ||
        url.pathname !== "/mail_collector_demo")
    ) {
      throw new Error("Local demo rejected a different database target");
    }
    return url;
  }

  assertLocalDocker() {
    const endpoint = execFileSync(
      "docker",
      [
        "context",
        "inspect",
        "default",
        "--format",
        "{{.Endpoints.docker.Host}}",
      ],
      { env: this.environment(), encoding: "utf8", windowsHide: true },
    ).trim();
    if (!/^(npipe:|unix:)/.test(endpoint))
      throw new Error("Local demo refuses a remote Docker endpoint");
  }
}

module.exports = new LocalDemoSettings();
