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

  // ✅ NEW: accounts without subscription
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

  // ✅ NEW: expiring subscriptions (within 12 hours)
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
      console.warn(`[Webhook] Unknown subscription: ${subscriptionId}`);
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
