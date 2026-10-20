const webhooksUsecase = require("../modules/webhooks/webhooks.usecase");
const forwardQueue = require("../queues/forward.queue");

class WebhooksController {
  async receive(req, res) {
    // Validation
    if (req.query.validationToken) {
      console.log("[Webhook] Validation request received");
      res.set("Content-Type", "text/plain");
      return res.status(200).send(req.query.validationToken);
    }

    try {
      const notifications = req.body?.value || [];
      if (notifications.length === 0) {
        return res.status(202).send();
      }

      // Respond immediately (required within 3 seconds)
      res.status(202).send();

      // Add each notification to the queue (processed sequentially)
      for (const notification of notifications) {
        try {
          await webhooksUsecase.enqueueNotification(notification, forwardQueue);
        } catch (error) {
          console.error(
            "[Webhook] Error enqueuing notification:",
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("[Webhook] Error handling notifications:", error.message);
      if (!res.headersSent) res.status(202).send();
    }
  }
}
module.exports = new WebhooksController();
