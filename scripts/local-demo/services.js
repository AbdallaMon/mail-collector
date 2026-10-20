const settings = require("./settings");
const MockMicrosoft = require("./mock-microsoft");
const SmtpSink = require("./smtp-sink");

if (process.env.MAIL_COLLECTOR_LOCAL_DEMO !== "1")
  throw new Error("Use npm run local");
const provider = new MockMicrosoft();
const smtp = new SmtpSink();
const server = provider
  .createApp()
  .listen(settings.ports.provider, "127.0.0.1");
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
smtp.listen().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function shutdown() {
  server.closeAllConnections();
  await Promise.all([
    new Promise((resolve) => server.close(resolve)),
    smtp.close(),
  ]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("disconnect", shutdown);
process.on("message", (message) => {
  if (message?.type === "shutdown") shutdown();
});
