const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");
const prisma = require("../config/database");
const microsoftAuthService = require("./microsoftAuth.service");

/**
 * Microsoft Graph Webhook Service
 * Handles subscription creation, renewal, and deletion
 */
class WebhookService {
  constructor() {
    this.graphBaseUrl = config.microsoft.graphBaseUrl;
    // Maximum subscription lifetime is 4230 minutes (about 3 days) for mail
    this.subscriptionLifetimeMinutes = 4230;
  }

  /**
   * Generate a random client state for webhook validation
   */
  generateClientState() {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Calculate expiration date for subscription
   */
  getExpirationDateTime() {
    const expiration = new Date();
    expiration.setMinutes(
      expiration.getMinutes() + this.subscriptionLifetimeMinutes,
    );
    return expiration.toISOString();
  }

  /**
   * Create a webhook subscription for an account
   * @param {string} accountId - The account ID
   * @returns {object} - Subscription details
   */
  async createSubscription(accountId) {
    try {
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

      // Store subscription in database
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
    } catch (error) {
      console.error(
        `[Webhook] Failed to create subscription for ${accountId}:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Renew a webhook subscription
   * @param {string} accountId - The account ID
   * @returns {object} - Updated subscription details
   */
  async renewSubscription(accountId) {
    try {
      const existingSubscription = await prisma.webhookSubscription.findUnique({
        where: { accountId },
      });

      if (!existingSubscription) {
        // No existing subscription, create a new one
        return this.createSubscription(accountId);
      }

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

      // Update subscription in database
      await prisma.webhookSubscription.update({
        where: { accountId },
        data: {
          expiresAt: new Date(subscription.expirationDateTime),
        },
      });

      console.log(`[Webhook] Subscription renewed for account ${accountId}`);
      return subscription;
    } catch (error) {
      // If subscription not found (404 or 400), recreate it
      if (
        error.response?.status === 404 ||
        error.response?.status === 400 ||
        error.response?.data?.error?.code === "InvalidSubscription"
      ) {
        console.log(
          `[Webhook] Subscription expired/invalid for ${accountId}, recreating...`,
        );
        // Delete old subscription record
        await prisma.webhookSubscription.deleteMany({ where: { accountId } });
        return this.createSubscription(accountId);
      }
      throw error;
    }
  }

  /**
   * Delete a webhook subscription
   * @param {string} accountId - The account ID
   */
  async deleteSubscription(accountId) {
    try {
      const subscription = await prisma.webhookSubscription.findUnique({
        where: { accountId },
      });

      if (!subscription) {
        return;
      }

      try {
        const accessToken =
          await microsoftAuthService.getValidAccessToken(accountId);

        await axios.delete(
          `${this.graphBaseUrl}/subscriptions/${subscription.subscriptionId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
      } catch (apiError) {
        // Ignore errors from Microsoft (subscription may already be deleted)
        console.log(
          `[Webhook] Could not delete from Microsoft: ${apiError.message}`,
        );
      }

      // Always delete from our database
      await prisma.webhookSubscription.delete({
        where: { accountId },
      });

      console.log(`[Webhook] Subscription deleted for account ${accountId}`);
    } catch (error) {
      console.error(
        `[Webhook] Failed to delete subscription for ${accountId}:`,
        error.message,
      );
    }
  }

  /**
   * Renew all subscriptions that are about to expire (within 12 hours)
   */
  async renewExpiringSubscriptions() {
    const twelveHoursFromNow = new Date();
    twelveHoursFromNow.setHours(twelveHoursFromNow.getHours() + 12);

    const expiringSubscriptions = await prisma.webhookSubscription.findMany({
      where: {
        expiresAt: {
          lte: twelveHoursFromNow,
        },
      },
    });

    if (expiringSubscriptions.length === 0) {
      return { renewed: 0, failed: 0 };
    }

    console.log(
      `[Webhook] Renewing ${expiringSubscriptions.length} expiring subscription(s)...`,
    );

    let renewed = 0;
    let failed = 0;

    for (const sub of expiringSubscriptions) {
      try {
        await this.renewSubscription(sub.accountId);
        renewed++;
      } catch (error) {
        console.error(
          `[Webhook] Failed to renew subscription for ${sub.accountId}:`,
          error.message,
        );
        failed++;
      }
      // Small delay between renewals to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`[Webhook] Renewed: ${renewed}, Failed: ${failed}`);
    return { renewed, failed };
  }

  /**
   * Create subscriptions for all connected accounts that don't have one
   */
  async createMissingSubscriptions() {
    const accountsWithoutSubscription = await prisma.mailAccount.findMany({
      where: {
        status: "CONNECTED",
        isEnabled: true,
        // No webhook subscription
        NOT: {
          id: {
            in: (
              await prisma.webhookSubscription.findMany({
                select: { accountId: true },
              })
            ).map((s) => s.accountId),
          },
        },
      },
      select: { id: true, email: true },
    });

    if (accountsWithoutSubscription.length === 0) {
      return { created: 0, failed: 0 };
    }

    console.log(
      `[Webhook] Creating subscriptions for ${accountsWithoutSubscription.length} account(s)...`,
    );

    let created = 0;
    let failed = 0;

    for (const account of accountsWithoutSubscription) {
      try {
        await this.createSubscription(account.id);
        created++;
      } catch (error) {
        console.error(
          `[Webhook] Failed to create subscription for ${account.email}:`,
          error.message,
        );
        failed++;
      }
      // Small delay between creations
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    console.log(`[Webhook] Created: ${created}, Failed: ${failed}`);
    return { created, failed };
  }

  /**
   * Validate incoming webhook notification
   * @param {string} clientState - Client state from notification
   * @param {string} subscriptionId - Subscription ID from notification
   * @returns {object|null} - Subscription record if valid, null otherwise
   */
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

  /**
   * Get subscription status for an account
   * @param {string} accountId - The account ID
   * @returns {object|null} - Subscription status
   */
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
