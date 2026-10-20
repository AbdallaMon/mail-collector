const accountsUsecase = require("../modules/accounts/accounts.usecase");
const microsoftAuthService = require("../services/microsoftAuth.service");
class AccountsController {
  async reauthenticate(req, res) {
    const { id } = req.params;

    const account = await accountsUsecase.findById(id);

    if (!account) {
      return res.status(404).send(`
        <html>
          <head><title>Account Not Found</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>❌ Account Not Found</h1>
            <p>This account may have been deleted.</p>
          </body>
        </html>
      `);
    }

    // Generate OAuth URL and redirect
    const { url } = microsoftAuthService.generateAuthUrl(id);
    res.redirect(url);
  }
  async oauthUrl(req, res) {
    // Create a temporary account ID for the OAuth flow
    // This will be updated when the OAuth completes
    const { url, state } = microsoftAuthService.generateAuthUrl();

    res.json({
      success: true,
      data: {
        url,
        state,
      },
    });
  }
  async list(req, res) {
    res.json({ success: true, data: await accountsUsecase.list(req.query) });
  }
  async getById(req, res) {
    res.json({
      success: true,
      data: await accountsUsecase.getById(req.params.id),
    });
  }
  async create(req, res) {
    const result = await accountsUsecase.create(req.body);
    res
      .status(result.created ? 201 : 200)
      .json({ success: true, data: result.data });
  }
  async reconnect(req, res) {
    res.json({
      success: true,
      data: await accountsUsecase.reconnect(req.params.id),
    });
  }
  async sync(req, res) {
    res.json(await accountsUsecase.sync(req.params.id));
  }
  async syncAll(req, res) {
    const data = await accountsUsecase.syncAll();
    res.json({
      success: true,
      message: `Sync started for ${data.results.length} accounts`,
      data,
    });
  }
  async test(req, res) {
    res.json({
      success: true,
      data: await accountsUsecase.test(req.params.id),
    });
  }
  async update(req, res) {
    res.json({
      success: true,
      data: await accountsUsecase.update(req.params.id, req.body),
    });
  }
  async remove(req, res) {
    await accountsUsecase.remove(req.params.id);
    res.json({ success: true, message: "Account deleted successfully" });
  }
  async messages(req, res) {
    res.json({
      success: true,
      data: await accountsUsecase.messages(req.params.id, req.query),
    });
  }
}
module.exports = new AccountsController();
