const config = require("../config");
const prisma = require("../config/database");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

/**
 * Email Forwarder Service
 * Uses Microsoft Graph API to forward emails directly from the mailbox
 */
class ForwarderService {
  constructor() {
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

  signApiPayload(timestamp, bodyString) {
    const secret = process.env.STEAM_API_SECRET || "";
    return crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${bodyString}`)
      .digest("hex");
  }

  async sendSteamToApi({ fromAccount, message, parsed }) {
    try {
      const url = process.env.STEAM_API_URL;
      if (!url) throw new Error("STEAM_API_URL is not set");

      const from = message.from?.emailAddress?.address || "";
      const to = (message.toRecipients || [])
        .map((r) => r.emailAddress?.address)
        .filter(Boolean)
        .join(", ");
      const subject = message.subject || "";
      const receivedDateTime =
        message.receivedDateTime || new Date().toISOString();

      // minimal payload (NO BODY)
      const payload = {
        source: "mail-collector-graph",
        fromAccount,
        from,
        to,
        subject,
        receivedDateTime,
        internetMessageId: message.internetMessageId || null,
        graphMessageId: message.id,
        username: parsed?.username || "",
        code: parsed?.code || "",
      };

      const ts = Math.floor(Date.now() / 1000).toString();
      const bodyString = JSON.stringify(payload);
      const sig = this.signApiPayload(ts, bodyString);

      const controller = new AbortController();
      const timeoutMs = parseInt(
        process.env.STEAM_API_TIMEOUT_MS || "5000",
        10,
      );
      const t = setTimeout(() => controller.abort(), timeoutMs);

      console.log(`[API] Sending Steam message to API: ${url}`, {
        fromAccount,
        messageId: message.id,
        timeoutMs,
      });

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Timestamp": ts,
            "X-Signature": sig,
          },
          body: bodyString,
          signal: controller.signal,
        });

        const text = await res.text();
        console.log(`[API] Response from Steam API: ${res.status} - ${text}`);

        if (!res.ok) {
          const err = new Error(
            `API failed: ${res.status} ${res.statusText} - ${text}`,
          );
          err.status = res.status;
          err.responseText = text;
          throw err;
        }

        return { success: true, response: text };
      } finally {
        clearTimeout(t);
      }
    } catch (error) {
      console.error(
        `[API] Failed to send Steam message to API: ${error.message}`,
        {
          fromAccount,
          messageId: message?.id,
          error,
        },
      );
      return { success: false, error: error.message };
    }
  }
  extractSteamCodeAndUsername({ subject, bodyType, body }) {
    // Convert HTML to text (simple + fast)
    let text = body || "";
    const subj = (subject || "").toLowerCase();

    if ((bodyType || "").toLowerCase() === "html") {
      // strip tags + decode some common entities
      text = text
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<\/p>|<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Code: 5 chars A-Z0-9
    let code = null;
    const codeMatch = text.match(/\b([A-Z0-9]{5})\b/);
    if (codeMatch) code = codeMatch[1];

    // Username extraction (same patterns you used in PHP)
    let username = null;
    const patterns = [
      /(\w+),\s+It looks like you/i,
      /(\w+),\s+يبدو أنك/i,
      /(\w+),\s+Il semblerait que vous/i,
      /(\w+),\s+Parece que estás/i,
      /(\w+),\s+Sembra che tu stia/i,
      /(\w+),\s+Parece que você está/i,
      /(\w+),\s+Es sieht so aus, als/i,
      /(\w+),\s+Похоже, вы/i,
      /(\w+),\s+あなたが/i,
      /(\w+),\s+당신이/i,
      /(\w+),\s+看起来您/i,
      /(\w+),\s+ดูเหมือนว่าคุณ/i,
      /(\w+),\s+आप/i,
      /(\w+),\s+Wygląda na to, że/i,
      /(\w+),\s+Görünüşe göre/i,
      /(\w+),\s+נראה שאתה/i,
      /Dear\s+(\w+)/i,
    ];

    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]) {
        username = m[1];
        break;
      }
    }

    return { code, username, subject: subj };
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
   * Send important email (like Microsoft security) via SMTP
   * - "New app(s) have access to your data" => dev ONLY (our own app connecting)
   * - Other security emails => BOTH dev AND forward email
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

    // DISABLED: App access email notification to dev
    // if (isAppAccessEmail) {
    //   console.log(`[SMTP] App access email detected, sending to dev only`);
    //   if (!config.devEmail) return false;
    //   return this.sendViaSMTP(
    //     config.devEmail,
    //     `📋 [App Access] ${originalSubject} | Mailbox: ${fromAccount}`,
    //     html,
    //   );
    // }

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
   * Forward a message using Graph API forward endpoint
   * The email is sent directly from the original mailbox
   * @param {object} message - Graph API message object
   * @param {array} attachments - (unused, kept for compatibility)
   * @param {string} fromAccount - Source account email
   * @param {string} accountId - Account ID for Graph API auth
   */
  async forwardGraphMessage(message, attachments = [], fromAccount, accountId) {
    try {
      const originalSender = message.from?.emailAddress?.address || "";
      const subjectRaw = message.subject || "";
      const subject = subjectRaw.toLowerCase();
      const senderLower = (originalSender || "").toLowerCase();

      const isSteam = senderLower.includes("steampowered.com");

      if (isSteam) {
        // IMPORTANT: we need full message body to parse
        const bodyType = message.body?.contentType || "text";
        const bodyContent = message.body?.content || "";

        // If body is missing, it means someone passed msgPreview by mistake
        if (!bodyContent) {
          const err = new Error(
            "Steam email body is missing. Ensure you fetch full message using graphService.getMessage() before calling forwardGraphMessage.",
          );
          err.code = "STEAM_BODY_MISSING";
          throw err;
        }

        // 1) Parse username + code in Node (heavy work here)
        const parsed = this.extractSteamCodeAndUsername({
          subject: subjectRaw,
          bodyType,
          body: bodyContent,
        });

        // If subject not match OR no code/username => still send to API and let PHP ignore?
        // Better: keep SAME old rule in Node too (fast return)
        if (!subject.includes("from new computer")) {
          await this.logForward(
            accountId,
            message,
            "SKIPPED",
            "Steam subject not match",
          );
          return { success: true, messageId: message.id, mode: "SKIP_SUBJECT" };
        }

        // 2) Send minimal payload to PHP API
        const apiResult = await this.sendSteamToApi({
          fromAccount,
          message,
          parsed, // {username, code}
        });

        // 3) Log in DB (use existing enum values only)
        if (!apiResult.success) {
          await this.logForward(
            accountId,
            message,
            apiResult.success ? "FORWARDED" : "FAILED",
            apiResult.success ? null : apiResult.error,
          );
        }

        console.log("[API] Steam message sent", {
          fromAccount,
          messageId: message.id,
          result: apiResult?.success,
        });

        if (!apiResult.success) throw new Error(apiResult.error);

        return { success: true, messageId: message.id, mode: "API" };
      }

      // Non-Steam
      await this.logForward(accountId, message, "SKIPPED", "Not steam");
      return { success: true, messageId: message.id, mode: "SKIP" };
    } catch (error) {
      const status = error?.status || error?.response?.status;
      const details = {
        endpoint: process.env.STEAM_API_URL,
        status,
        errorCode: error?.code,
        errorMessage: error?.message,
        responseText: error?.responseText,
        requestId: error?.response?.headers?.["request-id"],
        clientRequestId: error?.response?.headers?.["client-request-id"],
        messageId: message?.id,
        timestamp: new Date().toISOString(),
      };

      console.error("[Forward/API] Failed", { fromAccount, ...details });

      await this.logForward(
        accountId,
        message,
        "FAILED",
        JSON.stringify(details),
      );

      // notify dev only
      await this.sendErrorNotificationToDev(fromAccount, accountId, details);

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
   * Send re-authentication notification email via SMTP
   * Sends to BOTH developer and forward email
   * Special handling for ErrorExceededMessageLimit (quota exceeded)
   * @param {string} accountEmail - The email account that needs re-auth
   * @param {string} accountId - The account ID that needs re-auth
   * @param {string} errorMessage - The error that occurred (JSON string)
   */
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

  /**
   * Send error notification to DEVELOPER ONLY via SMTP
   * Used for general errors that shouldn't spam the user
   * @param {string} accountEmail - The email account that has an error
   * @param {string} accountId - The account ID with the error
   * @param {object} errorDetails - Full error details object
   */
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

module.exports = new ForwarderService();
