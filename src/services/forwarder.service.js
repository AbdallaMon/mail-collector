const config = require("../config");
const prisma = require("../config/database");
const graphService = require("./graph.service");

/**
 * Email Forwarder Service
 * Uses Microsoft Graph API to forward emails directly from the mailbox
 */
class ForwarderService {
  constructor() {
    // Delay between each forward operation (ms) to avoid rate limits
    // Reduced from 500ms to 150ms for better performance
    this.forwardDelayMs = parseInt(process.env.FORWARD_DELAY_MS, 10) || 150;
    // Cache for forward email (refreshed every 5 minutes)
    this._forwardToCache = null;
    this._forwardToCacheTime = 0;
  }

  /**
   * Get the forward-to email from database settings
   * Falls back to env variable if not set in DB
   */
  async getForwardToEmail() {
    const now = Date.now();
    // Cache for 5 minutes
    if (this._forwardToCache && now - this._forwardToCacheTime < 300000) {
      return this._forwardToCache;
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { key: "forwardToEmail" },
    });

    this._forwardToCache =
      setting?.value || config.forwarding.toEmail || "fwd@example.com";
    this._forwardToCacheTime = now;
    return this._forwardToCache;
  }

  /**
   * Clear the forward-to email cache (call after updating settings)
   */
  clearForwardToCache() {
    this._forwardToCache = null;
    this._forwardToCacheTime = 0;
  }

  /**
   * Small delay helper to avoid hitting rate limits
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Forward a message using Graph API forward endpoint
   * The email is sent directly from the original mailbox
   * @param {object} message - Graph API message object
   * @param {array} attachments - (unused, kept for compatibility)
   * @param {string} fromAccount - Source account email
   * @param {string} accountId - Account ID for Graph API auth
   */
  async forwardGraphMessage(message, attachments = [], fromAccount, accountId) {
    try {
      const forwardTo = await this.getForwardToEmail();
      const originalSender =
        message.from?.emailAddress?.address || "Unknown Sender";
      const originalSenderName = message.from?.emailAddress?.name || "";
      const originalSubject = message.subject || "No Subject";

      // Build a short comment for the forwarded email
      const comment = `Forwarded by Mail Collector from mailbox: ${fromAccount} | Original sender: ${originalSenderName ? `${originalSenderName} <${originalSender}>` : originalSender}`;

      // Use Graph API to forward the message directly
      await graphService.forwardMessage(
        accountId,
        message.id,
        forwardTo,
        comment,
      );

      return { success: true, messageId: message.id };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Log forwarding result (upsert for efficiency)
   */
  async logForward(accountId, message, status, error = null) {
    const forwardTo = await this.getForwardToEmail();
    const toRecipients = (message.toRecipients || [])
      .map((r) => r.emailAddress?.address)
      .filter(Boolean)
      .join(", ");

    await prisma.mailMessageLog.upsert({
      where: {
        accountId_graphMessageId: {
          accountId,
          graphMessageId: message.id,
        },
      },
      create: {
        accountId,
        graphMessageId: message.id,
        internetMessageId: message.internetMessageId,
        subject: message.subject,
        fromAddress: message.from?.emailAddress?.address,
        toAddresses: toRecipients,
        receivedDateTime: message.receivedDateTime
          ? new Date(message.receivedDateTime)
          : null,
        forwardedTo: forwardTo,
        forwardStatus: status,
        attempts: 1,
        lastAttemptAt: new Date(),
        error,
      },
      update: {
        forwardStatus: status,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        error,
      },
    });
  }

  /**
   * Get failed messages for retry
   */
  async getFailedMessages(limit = 50) {
    return prisma.mailMessageLog.findMany({
      where: {
        forwardStatus: "FAILED",
        attempts: { lt: config.worker.maxRetries },
      },
      include: { account: true },
      orderBy: { lastAttemptAt: "asc" },
      take: limit,
    });
  }

  /**
   * Send re-authentication notification email via Graph API
   * Uses one of the connected accounts to send the notification
   * @param {string} accountEmail - The email account that needs re-auth
   * @param {string} accountId - The account ID that needs re-auth
   * @param {string} errorMessage - The error that occurred
   */
  async sendReauthNotification(accountEmail, accountId, errorMessage) {
    try {
      const forwardTo = await this.getForwardToEmail();

      // Try to find another connected account to send the notification from
      const senderAccount = await prisma.mailAccount.findFirst({
        where: {
          status: "CONNECTED",
          isEnabled: true,
          id: { not: accountId },
        },
        select: { id: true, email: true },
      });

      if (!senderAccount) {
        console.error(
          `[Notification] No connected account available to send re-auth notification for ${accountEmail}`,
        );
        return false;
      }

      const reauthUrl = `${config.apiUrl}/api/accounts/reauth/${accountId}`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #dc2626; margin: 0 0 15px 0;">⚠️ Account Requires Re-Authentication</h2>
            <p style="color: #7f1d1d; margin: 0;">
              The following email account has been disconnected and requires you to sign in again.
            </p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 120px;">Account:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${accountEmail}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Error:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #dc2626;">${errorMessage}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Time:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${reauthUrl}" 
               style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              🔐 Reconnect Account
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            This notification was sent by Mail Collector Service
          </p>
        </div>
      `;

      // Send via Graph API using the sender account
      const microsoftAuthService = require("./microsoftAuth.service");
      const axios = require("axios");
      const accessToken = await microsoftAuthService.getValidAccessToken(
        senderAccount.id,
      );

      // Build recipient list (forward email + optional dev email)
      const toRecipients = [{ emailAddress: { address: forwardTo } }];
      if (config.devEmail) {
        toRecipients.push({ emailAddress: { address: config.devEmail } });
      }

      await axios.post(
        `${config.microsoft.graphBaseUrl}/me/sendMail`,
        {
          message: {
            subject: `⚠️ [Action Required] ${accountEmail} needs re-authentication`,
            body: { contentType: "HTML", content: html },
            toRecipients,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      console.log(`[Notification] Re-auth email sent for ${accountEmail}`);
      return true;
    } catch (error) {
      console.error(
        `[Notification] Failed to send re-auth email: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Send general error notification email via Graph API
   * @param {string} accountEmail - The email account that has an error
   * @param {string} accountId - The account ID with the error
   * @param {string} errorMessage - The error that occurred
   */
  async sendErrorNotification(accountEmail, accountId, errorMessage) {
    try {
      const forwardTo = await this.getForwardToEmail();

      // Try to find a connected account to send from (prefer other accounts)
      let senderAccount = await prisma.mailAccount.findFirst({
        where: {
          status: "CONNECTED",
          isEnabled: true,
          id: { not: accountId },
        },
        select: { id: true, email: true },
      });

      // If no other account, try the same account (if it's still connected)
      if (!senderAccount) {
        senderAccount = await prisma.mailAccount.findFirst({
          where: {
            status: "CONNECTED",
            isEnabled: true,
          },
          select: { id: true, email: true },
        });
      }

      if (!senderAccount) {
        console.error(
          `[Notification] No connected account available to send error notification for ${accountEmail}`,
        );
        return false;
      }

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #b45309; margin: 0 0 15px 0;">⚠️ Sync Error Notification</h2>
            <p style="color: #78350f; margin: 0;">
              An error occurred while syncing the following email account. The system will continue trying.
            </p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 120px;">Account:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${accountEmail}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Error:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #dc2626;">${errorMessage}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Time:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            This notification was sent by Mail Collector Service
          </p>
        </div>
      `;

      const microsoftAuthService = require("./microsoftAuth.service");
      const axios = require("axios");
      const accessToken = await microsoftAuthService.getValidAccessToken(
        senderAccount.id,
      );

      // Build recipient list (forward email + optional dev email)
      const toRecipients = [{ emailAddress: { address: forwardTo } }];
      if (config.devEmail) {
        toRecipients.push({ emailAddress: { address: config.devEmail } });
      }

      await axios.post(
        `${config.microsoft.graphBaseUrl}/me/sendMail`,
        {
          message: {
            subject: `⚠️ [Sync Error] ${accountEmail} - ${errorMessage.substring(0, 50)}`,
            body: { contentType: "HTML", content: html },
            toRecipients,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      console.log(`[Notification] Error email sent for ${accountEmail}`);
      return true;
    } catch (error) {
      console.error(
        `[Notification] Failed to send error email: ${error.message}`,
      );
      return false;
    }
  }
}

module.exports = new ForwarderService();
