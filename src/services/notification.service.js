const config = require("../config");
const nodemailer = require("nodemailer");
class NotificationService {
  constructor(getForwardToEmail) {
    this.getForwardToEmail = getForwardToEmail;
    // SMTP transporter for fallback notifications
    this.smtpTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  async sendViaSMTP(to, subject, html) {
    try {
      await this.smtpTransporter.sendMail({
        from: config.smtp.from,
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

    // Check if this is a "New app connected" email (our own app) => dev only
    const bodyText = (bodyContent || "").toLowerCase();
    const subjectText = (originalSubject || "").toLowerCase();
    const isAppAccessEmail =
      bodyText.includes("new app(s) have access to your data") ||
      subjectText.includes("new app(s) connected") ||
      bodyText.includes("mail collector connected");

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

    // Skip app access emails entirely
    if (isAppAccessEmail) {
      console.log(`[SMTP] App access email detected, skipping`);
      return false;
    }

    // Other security emails => BOTH forward + dev
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

  async sendReauthNotification(accountEmail, accountId, errorMessage) {
    try {
      const forwardTo = await this.getForwardToEmail();
      const reauthUrl = `${config.apiUrl}/api/accounts/reauth/${accountId}`;

      // Check if the error is ErrorExceededMessageLimit (quota exceeded)
      let isQuotaError = false;
      try {
        const parsed =
          typeof errorMessage === "string"
            ? JSON.parse(errorMessage)
            : errorMessage;
        isQuotaError = parsed?.errorCode === "ErrorExceededMessageLimit";
      } catch (_) {
        isQuotaError = (errorMessage || "").includes(
          "ErrorExceededMessageLimit",
        );
      }

      // Build special quota warning section if applicable
      const quotaWarningHtml = isQuotaError
        ? `
          <div style="background: #fff7ed; border: 2px solid #f97316; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #c2410c; margin: 0 0 10px 0;">🚫 Daily Message Limit Exceeded</h2>
            <p style="color: #9a3412; margin: 0 0 15px 0; font-size: 15px;">
              This account has exceeded the daily sending limit on Outlook/Microsoft.
            </p>
            <div style="background: #fff; border-radius: 6px; padding: 15px; border: 1px solid #fed7aa;">
              <h3 style="color: #c2410c; margin: 0 0 10px 0;">📋 Steps to fix:</h3>
              <ol style="color: #1f2937; margin: 0; padding-left: 20px; line-height: 2;">
                <li><strong>Go to <a href="https://outlook.live.com" style="color: #2563eb;">outlook.live.com</a></strong> and sign in with <strong>${accountEmail}</strong></li>
                <li><strong>Check your Inbox</strong> for a verification email from Microsoft</li>
                <li><strong>Complete the account verification</strong> (verify your identity / solve captcha)</li>
                <li><strong>Wait a few hours</strong> for the sending limit to reset</li>
                <li><strong>Then click the button below</strong> to reconnect the account in our system</li>
              </ol>
            </div>
          </div>
        `
        : `
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #dc2626; margin: 0 0 15px 0;">⚠️ Account Requires Re-Authentication</h2>
            <p style="color: #7f1d1d; margin: 0;">
              The following email account has been disconnected and requires you to sign in again.
            </p>
          </div>
        `;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${quotaWarningHtml}
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 120px;">Account:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${accountEmail}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Error:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #dc2626;">${isQuotaError ? "ErrorExceededMessageLimit - Daily sending limit exceeded" : errorMessage}</td>
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
          ${
            isQuotaError
              ? `<div style="background: #fef9c3; border: 1px solid #facc15; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: left;">
            <p style="color: #854d0e; font-weight: 600; margin: 0 0 10px 0;">📋 Steps to fix:</p>
            <ol style="color: #854d0e; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Open <a href="https://outlook.live.com" style="color: #2563eb;">outlook.live.com</a> and sign in with <strong>${accountEmail}</strong></li>
              <li>Try to <strong>forward any email</strong> manually from your inbox</li>
              <li>Outlook will ask you to verify — complete the verification</li>
              <li>Check your inbox for a verification email and confirm it</li>
              <li>Come back and click <strong>Reconnect Account</strong> above</li>
            </ol>
          </div>`
              : ""
          }
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            This notification was sent by Mail Collector Service via SMTP
          </p>
        </div>
      `;

      // Send via SMTP to BOTH forward email and dev email
      const recipients = [forwardTo];
      if (config.devEmail && config.devEmail !== forwardTo) {
        recipients.push(config.devEmail);
      }

      const subjectPrefix = isQuotaError
        ? "🚫 [Quota Exceeded]"
        : "⚠️ [Action Required]";
      const result = await this.sendViaSMTP(
        recipients,
        `${subjectPrefix} ${accountEmail} needs re-authentication`,
        html,
      );

      if (result) {
        console.log(
          `[Notification] Re-auth SMTP email sent for ${accountEmail} to ${recipients.join(", ")}`,
        );
      }
      return result;
    } catch (error) {
      console.error(
        `[Notification] Failed to send re-auth notification for ${accountEmail}: ${error.message}`,
      );
      return false;
    }
  }

  async sendErrorNotificationToDev(accountEmail, accountId, errorDetails) {
    try {
      if (!config.devEmail) {
        console.log(
          `[Notification] No devEmail configured, skipping error notification`,
        );
        return false;
      }

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
            Developer notification from Mail Collector Service via SMTP
          </p>
        </div>
      `;

      // Send ONLY to devEmail via SMTP
      const result = await this.sendViaSMTP(
        config.devEmail,
        `🚨 [DEV] Forward Error: ${accountEmail} - ${errorDetails.errorCode || errorDetails.status || "Unknown"}`,
        html,
      );

      if (result) {
        console.log(
          `[Notification] Dev error SMTP email sent for ${accountEmail} to ${config.devEmail}`,
        );
      }
      return result;
    } catch (error) {
      console.error(
        `[Notification] Failed to send dev error notification for ${accountEmail}: ${error.message}`,
      );
      return false;
    }
  }
}
module.exports = NotificationService;
