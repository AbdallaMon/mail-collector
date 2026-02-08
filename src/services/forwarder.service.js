const config = require("../config");
const prisma = require("../config/database");
const graphService = require("./graph.service");
const nodemailer = require("nodemailer");

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

    // SMTP transporter for fallback notifications
    this.smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 465,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send email via SMTP (fallback when Graph API fails)
   */
  async sendViaSMTP(to, subject, html) {
    try {
      await this.smtpTransporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        html,
      });
      console.log(`[SMTP] Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error(`[SMTP] Failed to send email: ${error.message}`);
      return false;
    }
  }

  /**
   * Send non-Steam email content to developer via SMTP
   * Used when an email is skipped (not from Steam) but we want dev to see it
   * @param {object} message - Full message object from Graph API
   * @param {string} fromAccount - The mailbox account email
   */
  async sendNonSteamEmailToDev(message, fromAccount) {
    if (!config.devEmail) {
      console.log(
        `[SMTP] No devEmail configured, skipping non-Steam notification`,
      );
      return false;
    }

    const originalSender = message.from?.emailAddress?.address || "Unknown";
    const originalSenderName = message.from?.emailAddress?.name || "";
    const originalSubject = message.subject || "(No Subject)";
    const receivedAt = message.receivedDateTime
      ? new Date(message.receivedDateTime).toLocaleString()
      : "Unknown";
    const bodyContent = message.body?.content || "(No body)";
    const bodyType = message.body?.contentType || "text";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background: #e0f2fe; border: 1px solid #7dd3fc; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <h2 style="color: #0369a1; margin: 0 0 10px 0;">📧 Non-Steam Email (Skipped Forward)</h2>
          <p style="color: #0c4a6e; margin: 0;">This email was not forwarded because it's not from Steam.</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 120px;">Mailbox:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${fromAccount}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">From:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${originalSenderName ? `${originalSenderName} &lt;${originalSender}&gt;` : originalSender}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Subject:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${originalSubject}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Received:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${receivedAt}</td>
          </tr>
        </table>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; background: #f9fafb;">
          <h3 style="color: #374151; margin: 0 0 10px 0;">Email Content:</h3>
          ${bodyType === "html" ? bodyContent : `<pre style="white-space: pre-wrap; font-family: inherit;">${bodyContent}</pre>`}
        </div>
        <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 20px;">
          Sent by Mail Collector Service - Non-Steam Email Notification
        </p>
      </div>
    `;

    return this.sendViaSMTP(
      config.devEmail,
      `📧 [Non-Steam] ${originalSubject} | From: ${originalSender} | Mailbox: ${fromAccount}`,
      html,
    );
  }

  /**
   * Send important email (like Microsoft security) to BOTH dev AND forward email via SMTP
   * @param {object} message - Full message object from Graph API
   * @param {string} fromAccount - The mailbox account email
   */
  async sendImportantEmailViaSMTP(message, fromAccount) {
    const forwardTo = await this.getForwardToEmail();
    const originalSender = message.from?.emailAddress?.address || "Unknown";
    const originalSenderName = message.from?.emailAddress?.name || "";
    const originalSubject = message.subject || "(No Subject)";
    const receivedAt = message.receivedDateTime
      ? new Date(message.receivedDateTime).toLocaleString()
      : "Unknown";
    const bodyContent = message.body?.content || "(No body)";
    const bodyType = message.body?.contentType || "text";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <h2 style="color: #b45309; margin: 0 0 10px 0;">🚨 Important Security Email</h2>
          <p style="color: #78350f; margin: 0;">This email requires your attention - forwarded via SMTP.</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 120px;">Mailbox:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${fromAccount}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">From:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${originalSenderName ? `${originalSenderName} &lt;${originalSender}&gt;` : originalSender}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Subject:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${originalSubject}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Received:</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${receivedAt}</td>
          </tr>
        </table>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; background: #f9fafb;">
          <h3 style="color: #374151; margin: 0 0 10px 0;">Email Content:</h3>
          ${bodyType === "html" ? bodyContent : `<pre style="white-space: pre-wrap; font-family: inherit;">${bodyContent}</pre>`}
        </div>
        <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 20px;">
          Sent by Mail Collector Service - Important Email Notification
        </p>
      </div>
    `;

    // Build recipient list (forward + dev)
    const recipients = [forwardTo];
    if (config.devEmail && config.devEmail !== forwardTo) {
      recipients.push(config.devEmail);
    }

    return this.sendViaSMTP(
      recipients,
      `🚨 [Security] ${originalSubject} | From: ${originalSender} | Mailbox: ${fromAccount}`,
      html,
    );
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
      const status = error?.response?.status;
      const data = error?.response?.data;

      console.error("[Forward] Failed", {
        fromAccount,
        messageId: message?.id,
        status,
        data,
        requestId: error?.response?.headers?.["request-id"],
        clientRequestId: error?.response?.headers?.["client-request-id"],
      });
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
        NOT: { error: { contains: '"status":403' } },
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
        `[Notification] Graph API failed, trying SMTP fallback: ${error.message}`,
      );

      // SMTP Fallback
      const forwardTo = await this.getForwardToEmail();
      const reauthUrl = `${config.apiUrl}/api/accounts/reauth/${accountId}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #dc2626; margin: 0 0 15px 0;">⚠️ Account Requires Re-Authentication</h2>
          </div>
          <p><strong>Account:</strong> ${accountEmail}</p>
          <p><strong>Error:</strong> ${errorMessage}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <p><a href="${reauthUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px;">🔐 Reconnect Account</a></p>
        </div>
      `;

      const recipients = [forwardTo];
      if (config.devEmail) recipients.push(config.devEmail);

      return this.sendViaSMTP(
        recipients,
        `⚠️ [Action Required] ${accountEmail} needs re-authentication`,
        html,
      );
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
        `[Notification] Graph API failed for error notification, trying SMTP fallback: ${error.message}`,
      );

      // SMTP Fallback
      const forwardTo = await this.getForwardToEmail();
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #b45309;">⚠️ Sync Error Notification</h2>
          <p><strong>Account:</strong> ${accountEmail}</p>
          <p><strong>Error:</strong> ${errorMessage}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `;

      const recipients = [forwardTo];
      if (config.devEmail) recipients.push(config.devEmail);

      return this.sendViaSMTP(
        recipients,
        `⚠️ [Sync Error] ${accountEmail} - ${errorMessage.substring(0, 50)}`,
        html,
      );
    }
  }

  /**
   * Send error notification to DEVELOPER ONLY (not to forward email)
   * Used for general errors that shouldn't spam the user
   * @param {string} accountEmail - The email account that has an error
   * @param {string} accountId - The account ID with the error
   * @param {object} errorDetails - Full error details object
   */
  async sendErrorNotificationToDev(accountEmail, accountId, errorDetails) {
    try {
      // Check if devEmail is configured
      if (!config.devEmail) {
        console.log(
          `[Notification] No devEmail configured, skipping error notification`,
        );
        return false;
      }

      // Try to find a connected account to send from (prefer other accounts)
      let senderAccount = await prisma.mailAccount.findFirst({
        where: {
          status: "CONNECTED",
          isEnabled: true,
          id: { not: accountId },
        },
        select: { id: true, email: true },
      });

      // If no other account, try any connected account
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
          `[Notification] No connected account available to send error notification`,
        );
        return false;
      }

      // Format error details for the email
      const errorJson = JSON.stringify(errorDetails, null, 2);

      const html = `
        <div style="font-family: 'Courier New', monospace; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #dc2626; margin: 0 0 15px 0;">🚨 Forward Error (Dev Notification)</h2>
            <p style="color: #7f1d1d; margin: 0;">
              An error occurred while forwarding an email. Full details below.
            </p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 150px;">Account:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${accountEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">API Endpoint:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${errorDetails.endpoint || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Status:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #dc2626;">${errorDetails.status || "N/A"} ${errorDetails.statusText || ""}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Error Code:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${errorDetails.errorCode || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Error Message:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${errorDetails.errorMessage || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Timestamp:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${errorDetails.timestamp || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Request ID:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${errorDetails.requestId || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Message ID:</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; word-break: break-all;">${errorDetails.messageId || "N/A"}</td>
            </tr>
          </table>
          <div style="margin-top: 20px;">
            <h3 style="color: #374151; margin-bottom: 10px;">Full Error JSON:</h3>
            <pre style="background: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all;">${errorJson}</pre>
          </div>
          <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 20px;">
            Developer notification from Mail Collector Service
          </p>
        </div>
      `;

      const microsoftAuthService = require("./microsoftAuth.service");
      const axios = require("axios");
      const accessToken = await microsoftAuthService.getValidAccessToken(
        senderAccount.id,
      );

      // Send ONLY to devEmail
      await axios.post(
        `${config.microsoft.graphBaseUrl}/me/sendMail`,
        {
          message: {
            subject: `🚨 [DEV] Forward Error: ${accountEmail} - ${errorDetails.errorCode || errorDetails.status || "Unknown"}`,
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: config.devEmail } }],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      console.log(
        `[Notification] Dev error email sent for ${accountEmail} to ${config.devEmail}`,
      );
      return true;
    } catch (error) {
      console.error(
        `[Notification] Graph API failed for dev error, trying SMTP fallback: ${error.message}`,
      );

      // SMTP Fallback
      if (!config.devEmail) return false;

      const errorJson = JSON.stringify(errorDetails, null, 2);
      const html = `
        <div style="font-family: 'Courier New', monospace; padding: 20px;">
          <h2 style="color: #dc2626;">🚨 Forward Error (Dev Notification)</h2>
          <p><strong>Account:</strong> ${accountEmail}</p>
          <p><strong>Endpoint:</strong> ${errorDetails.endpoint || "N/A"}</p>
          <p><strong>Status:</strong> ${errorDetails.status || "N/A"}</p>
          <p><strong>Error Code:</strong> ${errorDetails.errorCode || "N/A"}</p>
          <p><strong>Error Message:</strong> ${errorDetails.errorMessage || "N/A"}</p>
          <p><strong>Timestamp:</strong> ${errorDetails.timestamp || "N/A"}</p>
          <pre style="background: #1f2937; color: #f3f4f6; padding: 15px; font-size: 12px; white-space: pre-wrap;">${errorJson}</pre>
        </div>
      `;

      return this.sendViaSMTP(
        config.devEmail,
        `🚨 [DEV] Forward Error: ${accountEmail} - ${errorDetails.errorCode || errorDetails.status || "Unknown"}`,
        html,
      );
    }
  }
}

module.exports = new ForwarderService();
