require("dotenv").config();

module.exports = {
  // Server
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 5000,
  apiUrl: process.env.API_URL || "http://localhost:5000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",

  // Webhook
  webhook: {
    url: process.env.WEBHOOK_URL || process.env.API_URL + "/api/webhooks/mail",
  },

  // Developer Email (for error notifications)
  devEmail: process.env.DEV_EMAIL || null,

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || "default-secret-change-me",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  // Encryption
  encryptionKey: process.env.ENCRYPTION_KEY,

  // Microsoft OAuth
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
    scopes: (
      process.env.MICROSOFT_SCOPES ||
      "offline_access User.Read Mail.Read Mail.Send"
    ).split(" "),
    authorizeUrl:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    graphBaseUrl: "https://graph.microsoft.com/v1.0",
  },

  // Email Forwarding
  forwarding: {
    toEmail: process.env.FORWARD_TO_EMAIL || "fwd@dmstoresa2.pro",
  },

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || "Mail Collector <noreply@example.com>",
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Worker
  worker: {
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 10000,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 5,
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 1,
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS, 10) || 5000,
  },

  // Admin
  admin: {
    email: process.env.ADMIN_EMAIL || "admin@example.com",
    password: process.env.ADMIN_PASSWORD || "admin123",
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || "logs/app.log",
  },
};
