require("./bootstrap");
const settings = require("./settings");
const prisma = require("../../src/config/database");
const adminService = require("../../src/services/admin.service");
const app = require("../../src/app");
const queue = require("../../src/queues/forward.queue");

let server;
async function shutdown() {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("disconnect", shutdown);
process.on("message", (message) => {
  if (message?.type === "shutdown") shutdown();
});

(async () => {
  await prisma.$connect();
  await adminService.ensureDefaultAdmin();
  await queue.isReady();
  server = app.listen(settings.ports.app, "127.0.0.1", () => {
    console.log(`[LOCAL_SIMULATION] Dashboard ready: ${settings.appUrl}`);
  });
  server.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
