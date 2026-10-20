require("./config");
const WebhookMaintenanceWorker = require("./workers/webhookMaintenance.worker");
const worker = new WebhookMaintenanceWorker();
process.on("SIGINT", () => worker.shutdown());
process.on("SIGTERM", () => worker.shutdown());
worker.start();
