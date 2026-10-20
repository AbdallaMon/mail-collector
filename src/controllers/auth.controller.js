const authUsecase = require("../modules/auth/auth.usecase");
const config = require("../config");
const microsoftAuthService = require("../services/microsoftAuth.service");
class AuthController {
  async login(req, res) {
    res.json({ success: true, data: await authUsecase.login(req.body) });
  }
  async me(req, res) {
    res.json({ success: true, data: await authUsecase.me(req.user.id) });
  }
  async connectMicrosoft(req, res) {
    const { accountId } = req.query;

    const { url, state } = microsoftAuthService.generateAuthUrl(accountId);

    res.json({
      success: true,
      data: { url, state },
    });
  }
  async microsoftCallback(req, res) {
    const { code, state, error, error_description } = req.query;

    if (error) {
      // Redirect to frontend with error
      return res.redirect(
        `${config.frontendUrl}/oauth/callback?error=${encodeURIComponent(error_description || error)}`,
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${config.frontendUrl}/oauth/callback?error=${encodeURIComponent("Missing code or state")}`,
      );
    }

    try {
      const account = await microsoftAuthService.completeOAuthFlow(code, state);

      // Redirect to frontend with success
      res.redirect(
        `${config.frontendUrl}/oauth/callback?success=true&email=${encodeURIComponent(account.email)}&accountId=${account.id}`,
      );
    } catch (err) {
      res.redirect(
        `${config.frontendUrl}/oauth/callback?error=${encodeURIComponent(err.message)}`,
      );
    }
  }
  async changePassword(req, res) {
    await authUsecase.changePassword(req.user.id, req.body);
    res.json({ success: true, message: "Password changed successfully" });
  }
}
module.exports = new AuthController();
