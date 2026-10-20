const Bull = require("bull");
const config = require("../config");
const webhooksUsecase = require("../modules/webhooks/webhooks.usecase");
const upstreamErrorPolicy = require("../utils/upstreamErrorPolicy");

const forwardQueue = new Bull("webhook-forward", {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  },
  settings: {
    backoffStrategies: {
      upstream: upstreamErrorPolicy.backoff.bind(upstreamErrorPolicy),
    },
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "upstream" },
    removeOnComplete: true, // Remove immediately after success
    removeOnFail: 100, // Keep some failed jobs for debugging
  },
});

forwardQueue.process(1, (job) => webhooksUsecase.processMessage(job));
forwardQueue.on("failed", (job, err) => {
  console.error(`[Queue] Job ${job.id} failed: ${err.message}`);
});
module.exports = forwardQueue;
