const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");
const prisma = require("../config/database");
const microsoftAuthService = require("./microsoftAuth.service");

class WebhookService {
  constructor() {
    this.graphBaseUrl = config.microsoft.graphBaseUrl;
    // ✅ نفس القيمة بتاعتك (مش هنغير المدة)
    this.subscriptionLifetimeMinutes = 4230;
    // Track unknown subscription IDs to only log once
    this._unknownSubIds = new Set();
  }

  generateClientState() {
    return crypto.randomBytes(32).toString("hex");
  }

  getExpirationDateTime() {
    const expiration = new Date();
    expiration.setMinutes(
      expiration.getMinutes() + this.subscriptionLifetimeMinutes,
    );
    return expiration.toISOString();
  }

  async createSubscription(accountId) {
    const accessToken =
      await microsoftAuthService.getValidAccessToken(accountId);

    // Delete old subscription from Microsoft before creating new one
    await this._deleteOldSubscriptionFromMicrosoft(accountId, accessToken);

    const clientState = this.generateClientState();
    const expirationDateTime = this.getExpirationDateTime();

    const subscriptionPayload = {
      changeType: "created",
      notificationUrl: config.webhook.url,
      resource: "/me/mailFolders('Inbox')/messages",
      expirationDateTime,
      clientState,
    };

    const response = await axios.post(
      `${this.graphBaseUrl}/subscriptions`,
      subscriptionPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const subscription = response.data;

    await prisma.webhookSubscription.upsert({
      where: { accountId },
      create: {
        accountId,
        subscriptionId: subscription.id,
        resource: subscription.resource,
        changeType: subscription.changeType,
        notificationUrl: subscription.notificationUrl,
        expiresAt: new Date(subscription.expirationDateTime),
        clientState,
      },
      update: {
        subscriptionId: subscription.id,
        resource: subscription.resource,
        changeType: subscription.changeType,
        notificationUrl: subscription.notificationUrl,
        expiresAt: new Date(subscription.expirationDateTime),
        clientState,
      },
    });

    console.log(`[Webhook] Subscription created for account ${accountId}`);
    return subscription;
  }

  /**
   * Delete old subscription from Microsoft to prevent stale notifications
   * Silently ignores errors (subscription may already be expired/deleted)
   */
  async _deleteOldSubscriptionFromMicrosoft(accountId, accessToken) {
    try {
      const existing = await prisma.webhookSubscription.findUnique({
        where: { accountId },
        select: { subscriptionId: true },
      });

      if (!existing) return;

      console.log(
        `[Webhook] Deleting old subscription ${existing.subscriptionId} from Microsoft...`,
      );

      await axios.delete(
        `${this.graphBaseUrl}/subscriptions/${existing.subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      console.log(
        `[Webhook] Old subscription ${existing.subscriptionId} deleted from Microsoft`,
      );
    } catch (error) {
      // Ignore 404 (already gone) or any other error — we're creating a new one anyway
      console.log(
        `[Webhook] Could not delete old subscription (${error?.response?.status || error.message}), continuing...`,
      );
    }
  }

  async renewSubscription(accountId) {
    const existingSubscription = await prisma.webhookSubscription.findUnique({
      where: { accountId },
    });

    if (!existingSubscription) {
      return this.createSubscription(accountId);
    }

    try {
      const accessToken =
        await microsoftAuthService.getValidAccessToken(accountId);
      const expirationDateTime = this.getExpirationDateTime();

      const response = await axios.patch(
        `${this.graphBaseUrl}/subscriptions/${existingSubscription.subscriptionId}`,
        { expirationDateTime },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const subscription = response.data;

      await prisma.webhookSubscription.update({
        where: { accountId },
        data: { expiresAt: new Date(subscription.expirationDateTime) },
      });

      console.log(`[Webhook] Subscription renewed for account ${accountId}`);
      return subscription;
    } catch (error) {
      // recreate on invalid/expired
      if (
        error.response?.status === 404 ||
        error.response?.status === 400 ||
        error.response?.data?.error?.code === "InvalidSubscription"
      ) {
        console.log(
          `[Webhook] Subscription invalid for ${accountId}, recreating...`,
        );
        await prisma.webhookSubscription.deleteMany({ where: { accountId } });
        return this.createSubscription(accountId);
      }
      throw error;
    }
  }

  async getAccountsNeedingSubscription() {
    const existing = await prisma.webhookSubscription.findMany({
      select: { accountId: true },
    });
    const existingIds = existing.map((s) => s.accountId);

    return prisma.mailAccount.findMany({
      where: {
        status: "CONNECTED",
        isEnabled: true,
        NOT: { id: { in: existingIds } },
      },
      select: { id: true, email: true },
    });
  }

  async getExpiringSubscriptions() {
    const twelveHoursFromNow = new Date();
    twelveHoursFromNow.setHours(twelveHoursFromNow.getHours() + 12);

    return prisma.webhookSubscription.findMany({
      where: { expiresAt: { lte: twelveHoursFromNow } },
      select: { accountId: true, subscriptionId: true, expiresAt: true },
    });
  }

  async validateNotification(clientState, subscriptionId) {
    const subscription = await prisma.webhookSubscription.findUnique({
      where: { subscriptionId },
    });

    if (!subscription) {
      // Only log once per unknown subscription ID to reduce noise
      if (!this._unknownSubIds.has(subscriptionId)) {
        this._unknownSubIds.add(subscriptionId);
        console.warn(
          `[Webhook] Unknown subscription: ${subscriptionId} (will not log again)`,
        );
      }
      return null;
    }

    if (subscription.clientState !== clientState) {
      console.warn(`[Webhook] Invalid client state for ${subscriptionId}`);
      return null;
    }

    return subscription;
  }

  async getSubscriptionStatus(accountId) {
    return prisma.webhookSubscription.findUnique({
      where: { accountId },
      select: {
        subscriptionId: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

module.exports = new WebhookService();
