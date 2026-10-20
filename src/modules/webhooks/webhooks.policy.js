const config = require("../../config");

const STEAM_ONLY = config.steam.only;

const STEAM_ALLOWED_DOMAINS = config.steam.allowedDomains;

const STEAM_ALLOWED_SENDERS = config.steam.allowedSenders;

const FORWARD_DELAY_MS = config.steam.forwardDelayMs;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthOrSuspendError(error) {
  return (
    error?.needsReauth === true ||
    error?.response?.data?.error?.code === "ErrorAccountSuspend"
  );
}

const IMPORTANT_SENDERS = [
  "account-security-noreply@accountprotection.microsoft.com",
];

function isSteamMessage(msgPreview) {
  const fromAddress = (
    msgPreview?.from?.emailAddress?.address || ""
  ).toLowerCase();

  // 1. Check exact sender email
  if (STEAM_ALLOWED_SENDERS.includes(fromAddress)) return true;

  // 2. Check sender domain
  const domain = fromAddress.split("@")[1] || "";
  if (domain && STEAM_ALLOWED_DOMAINS.includes(domain)) return true;

  return false;
}

function isImportantSender(msgPreview) {
  const fromAddress = (
    msgPreview?.from?.emailAddress?.address || ""
  ).toLowerCase();
  return IMPORTANT_SENDERS.includes(fromAddress);
}

function buildErrorDetails(error, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    api: error?.source || context.api || "unknown",
    endpoint: context.endpoint || "unknown",
    accountId: context.accountId || "unknown",
    accountEmail: context.accountEmail || "unknown",
    messageId: context.messageId || "unknown",
    status: error?.status ?? error?.response?.status ?? null,
    statusText: error?.response?.statusText || null,
    errorCode:
      error?.oauthCode ||
      error?.code ||
      error?.response?.data?.error?.code ||
      null,
    errorMessage: error?.response?.data?.error?.message || error.message,
    requestId: error?.response?.headers?.["request-id"] || null,
    clientRequestId: error?.response?.headers?.["client-request-id"] || null,
    stack: error.stack,
  };
}

module.exports = {
  STEAM_ONLY,
  FORWARD_DELAY_MS,
  sleep,
  isAuthOrSuspendError,
  isSteamMessage,
  isImportantSender,
  buildErrorDetails,
};
