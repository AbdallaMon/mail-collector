const settings = require("./settings");

if (process.env.MAIL_COLLECTOR_LOCAL_DEMO !== "1") {
  throw new Error("Start the local environment with npm run local");
}

const environment = settings.environment();
Object.assign(process.env, environment);
for (const key of [
  "DATABASE_URL",
  "API_URL",
  "FRONTEND_URL",
  "WEBHOOK_URL",
  "STEAM_API_URL",
  "MICROSOFT_REDIRECT_URI",
]) {
  settings.assertLocalUrl(environment[key]);
}

// In these local-only child processes, even nested dotenv calls cannot load .env/.env.test.
require("dotenv").config = () => ({ parsed: { ...environment } });
const config = require("../../src/config");
Object.assign(config.microsoft, {
  authorizeUrl: `${settings.providerUrl}/oauth/authorize`,
  tokenUrl: `${settings.providerUrl}/oauth/token`,
  graphBaseUrl: `${settings.providerUrl}/v1.0`,
});

module.exports = config;
