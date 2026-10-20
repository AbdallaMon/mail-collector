const logsUsecase = require("../modules/logs/logs.usecase");
class LogsController {
  async list(req, res) {
    res.json({ success: true, data: await logsUsecase.list(req.query) });
  }
  async getById(req, res) {
    const data = await logsUsecase.getById(req.params.id);
    if (!data)
      return res.status(404).json({ success: false, message: "Log not found" });
    res.json({ success: true, data });
  }
  async retry(req, res) {
    const found = await logsUsecase.retry(req.params.id);
    if (!found)
      return res.status(404).json({ success: false, message: "Log not found" });
    res.json({ success: true, message: "Message queued for retry" });
  }
  async cleanup(req, res) {
    res.json({ success: true, data: await logsUsecase.cleanup(req.query) });
  }
}
module.exports = new LogsController();
