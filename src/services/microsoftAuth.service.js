const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const config = require("../config");
const encryption = require("../utils/encryption");
const prisma = require("../config/database");

// Lazy load to avoid circular dependency
let webhookService = null;
const getWebhookService = () => {
  if (!webhookService) {
    webhookService = require("./webhook.service");
  }
  return webhookService;
};

/**
 * Microsoft OAuth 2.0 Service
 */
class MicrosoftAuthService {
  constructor() {
    this.clientId = config.microsoft.clientId;
    this.clientSecret = config.microsoft.clientSecret;
    this.redirectUri = config.microsoft.redirectUri;
    this.scopes = config.microsoft.scopes;
    this.authorizeUrl = config.microsoft.authorizeUrl;
    this.tokenUrl = config.microsoft.tokenUrl;
    this.graphBaseUrl = config.microsoft.graphBaseUrl;
  }

  generateAuthUrl(accountId = null) {
    const state = JSON.stringify({
      accountId,
      nonce: uuidv4(),
      timestamp: Date.now(),
    });

    const encodedState = Buffer.from(state).toString("base64url");

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      response_mode: "query",
      scope: this.scopes.join(" "),
      state: encodedState,
      prompt: "consent",
    });

    return {
      url: `${this.authorizeUrl}?${params.toString()}`,
      state: encodedState,
    };
  }

  async exchangeCodeForTokens(code) {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
        scope: this.scopes.join(" "),
      });

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Token exchange failed: ${error.response?.data?.error_description || error.message}`,
      );
    }
  }

  async refreshAccessToken(encryptedRefreshToken) {
    try {
      const refreshToken = encryption.decrypt(encryptedRefreshToken);

      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: this.scopes.join(" "),
      });

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Token refresh failed: ${error.response?.data?.error_description || error.message}`,
      );
    }
  }

  async getUserProfile(accessToken) {
    try {
      const response = await axios.get(`${this.graphBaseUrl}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  async storeTokens(accountId, tokenData) {
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    await prisma.mailToken.upsert({
      where: { accountId },
      create: {
        accountId,
        accessToken: encryption.encrypt(tokenData.access_token),
        refreshToken: encryption.encrypt(tokenData.refresh_token),
        tokenType: tokenData.token_type || "Bearer",
        scope: tokenData.scope,
        expiresAt,
      },
      update: {
        accessToken: encryption.encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token
          ? encryption.encrypt(tokenData.refresh_token)
          : undefined,
        tokenType: tokenData.token_type || "Bearer",
        scope: tokenData.scope,
        expiresAt,
      },
    });
  }

  async getValidAccessToken(accountId) {
    const tokenRecord = await prisma.mailToken.findUnique({
      where: { accountId },
    });

    if (!tokenRecord) {
      throw new Error("No tokens found for account - please reconnect");
    }

    const now = new Date();
    const expiresAt = new Date(tokenRecord.expiresAt);
    const bufferTime = 5 * 60 * 1000;

    if (expiresAt.getTime() - now.getTime() > bufferTime) {
      const decryptedToken = encryption.decrypt(tokenRecord.accessToken);
      if (!decryptedToken || decryptedToken.trim() === "") {
        throw new Error("Stored access token is empty - please reconnect");
      }
      return decryptedToken;
    }

    try {
      const newTokens = await this.refreshAccessToken(tokenRecord.refreshToken);
      await this.storeTokens(accountId, newTokens);
      return newTokens.access_token;
    } catch (error) {
      await prisma.mailAccount.update({
        where: { id: accountId },
        data: {
          status: "NEEDS_REAUTH",
          lastError: `Token refresh failed: ${error.message}`,
        },
      });
      throw error;
    }
  }

  async completeOAuthFlow(code, state) {
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    } catch (error) {
      throw new Error("Invalid state parameter");
    }

    const tokenData = await this.exchangeCodeForTokens(code);
    const profile = await this.getUserProfile(tokenData.access_token);

    const email = profile.mail || profile.userPrincipalName;
    const msUserId = profile.id;
    const displayName = profile.displayName;

    let account;
    if (stateData.accountId) {
      account = await prisma.mailAccount.update({
        where: { id: stateData.accountId },
        data: {
          email,
          msUserId,
          displayName,
          status: "CONNECTED",
          lastError: null,
          errorCount: 0,
        },
      });
    } else {
      account = await prisma.mailAccount.upsert({
        where: { email },
        create: { email, msUserId, displayName, status: "CONNECTED" },
        update: {
          msUserId,
          displayName,
          status: "CONNECTED",
          lastError: null,
          errorCount: 0,
        },
      });
    }

    await this.storeTokens(account.id, tokenData);

    await prisma.mailSyncState.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id },
      update: {},
    });

    // Create webhook subscription for real-time notifications
    try {
      await getWebhookService().createSubscription(account.id);
      console.log(`[OAuth] Webhook subscription created for ${email}`);
    } catch (webhookError) {
      // Log but don't fail the OAuth flow
      console.error(
        `[OAuth] Failed to create webhook subscription for ${email}:`,
        webhookError.message,
      );
    }

    return account;
  }
}

module.exports = new MicrosoftAuthService();
