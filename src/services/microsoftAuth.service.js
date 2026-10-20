const tokenRepo = require("../repositories/token.repo");
const accountRepo = require("../repositories/account.repo");
const syncStateRepo = require("../repositories/syncState.repo");
const axios = require("axios");
const { randomUUID } = require("node:crypto");
const config = require("../config");
const encryption = require("../utils/encryption");
const upstreamErrorPolicy = require("../utils/upstreamErrorPolicy");

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
      nonce: randomUUID(),
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
    // A decryption error is a local key/data problem, not revoked Microsoft consent.
    const refreshToken = encryption.decrypt(encryptedRefreshToken);
    if (!refreshToken) {
      throw Object.assign(
        new Error("No refresh token found - please reconnect"),
        {
          source: "microsoft-oauth",
          needsReauth: true,
          retryable: false,
        },
      );
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        timeout: 15_000,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      return response.data;
    } catch (error) {
      throw upstreamErrorPolicy.microsoftRefreshError(error);
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

    await tokenRepo.upsert({
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

  async getValidAccessToken(accountId, { forceRefresh = false } = {}) {
    const tokenRecord = await tokenRepo.findUnique({
      where: { accountId },
    });

    try {
      if (!tokenRecord) {
        throw Object.assign(
          new Error("No tokens found for account - please reconnect"),
          {
            source: "microsoft-oauth",
            needsReauth: true,
            retryable: false,
          },
        );
      }
      const remainingMs =
        new Date(tokenRecord.expiresAt).getTime() - Date.now();
      if (!forceRefresh && remainingMs > 5 * 60 * 1000) {
        const decryptedToken = encryption.decrypt(tokenRecord.accessToken);
        if (!decryptedToken?.trim())
          throw new Error("Stored access token is empty");
        return decryptedToken;
      }
      const newTokens = await this.refreshAccessToken(tokenRecord.refreshToken);
      if (
        !newTokens?.access_token ||
        !Number.isFinite(Number(newTokens.expires_in)) ||
        Number(newTokens.expires_in) <= 0
      ) {
        throw Object.assign(
          new Error("Microsoft returned an invalid token response"),
          {
            source: "microsoft-oauth",
            retryable: false,
          },
        );
      }
      await this.storeTokens(accountId, newTokens);
      return newTokens.access_token;
    } catch (error) {
      try {
        await accountRepo.update({
          where: { id: accountId },
          data: {
            lastError: error.message,
            ...(error.needsReauth === true ? { status: "NEEDS_REAUTH" } : {}),
          },
        });
      } catch (storageError) {
        console.error("Could not persist token failure:", storageError.message);
      }
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
      account = await accountRepo.update({
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
      account = await accountRepo.upsert({
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

    await syncStateRepo.upsert({
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
