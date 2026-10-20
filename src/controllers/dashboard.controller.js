const dashboardUsecase = require("../modules/dashboard/dashboard.usecase");
class DashboardController {
  async stats(req, res) {
    res.json({ success: true, data: await dashboardUsecase.stats() });
  }
  async accountsOverview(req, res) {
    res.json({
      success: true,
      data: await dashboardUsecase.accountsOverview(),
    });
  }
  async recentActivity(req, res) {
    res.json({
      success: true,
      data: await dashboardUsecase.recentActivity(req.query),
    });
  }
  async syncAll(req, res) {
    res.json({ success: true, data: await dashboardUsecase.syncAll() });
  }
  async retryFailed(req, res) {
    res.json({ success: true, data: await dashboardUsecase.retryFailed() });
  }
  async health(req, res) {
    res.json({ success: true, data: await dashboardUsecase.health() });
  }
  async getConfig(req, res) {
    res.json({ success: true, data: await dashboardUsecase.getConfig() });
  }
  async workerStatus(req, res) {
    res.json({ success: true, data: await dashboardUsecase.workerStatus() });
  }
  async updateConfig(req, res) {
    const result = await dashboardUsecase.updateConfig(req.body);
    if (result.error)
      return res.status(400).json({ success: false, message: result.error });
    res.json({
      success: true,
      message: "Configuration updated successfully",
      data: result,
    });
  }
  async testForward(req, res) {
    // Check if any account is connected and has Mail.Send permission
    const connectedAccount = await dashboardUsecase.findConnectedAccount();

    if (!connectedAccount) {
      return res.status(400).json({
        success: false,
        message: "No connected account available to test forwarding",
      });
    }

    try {
      const graphService = require("../services/graph.service");
      const canConnect = await graphService.testConnection(connectedAccount.id);

      if (canConnect) {
        res.json({
          success: true,
          message: `Graph API connection successful via ${connectedAccount.email}`,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Graph API connection failed",
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Graph API test failed: ${error.message}`,
      });
    }
  }
}
module.exports = new DashboardController();
