const settingRepo = require("../repositories/setting.repo");
const messageLogRepo = require("../repositories/messageLog.repo");
const config = require("../config");
const steamApiService = require("./steamApi.service");
const NotificationService = require("./notification.service");

class ForwarderService {
  constructor() {
    this._forwardToCache = null;
    this._forwardToCacheTime = 0;
    this.notifications = new NotificationService(() =>
      this.getForwardToEmail(),
    );
  }
  async getForwardToEmail() {
    const now = Date.now();
    // Cache for 5 minutes
    if (this._forwardToCache && now - this._forwardToCacheTime < 300000) {
      return this._forwardToCache;
    }

    const setting = await settingRepo.findUnique({
      where: { key: "forwardToEmail" },
    });

    this._forwardToCache =
      setting?.value || config.forwarding.toEmail || "fwd@example.com";
    this._forwardToCacheTime = now;
    return this._forwardToCache;
  }

  clearForwardToCache() {
    this._forwardToCache = null;
    this._forwardToCacheTime = 0;
  }

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
        const parsed = steamApiService.extractSteamCodeAndUsername({
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
          return {
            success: true,
            delivered: false,
            messageId: message.id,
            mode: "SKIP_SUBJECT",
          };
        }

        // 2) Send minimal payload to PHP API
        const apiResult = await steamApiService.sendSteamToApi({
          fromAccount,
          message,
          parsed, // {username, code}
        });

        if (!apiResult.delivered) {
          await this.logForward(
            accountId,
            message,
            "SKIPPED",
            apiResult.reason || "Ignored by Steam API",
          );
        }

        console.log("[API] Steam message sent", {
          fromAccount,
          messageId: message.id,
          result: apiResult?.success,
        });

        return {
          ...apiResult,
          messageId: message.id,
          mode: apiResult.delivered ? "API" : "SKIP_API",
        };
      }

      // Non-Steam
      await this.logForward(accountId, message, "SKIPPED", "Not steam");
      return {
        success: true,
        delivered: false,
        messageId: message.id,
        mode: "SKIP",
      };
    } catch (error) {
      const status = error?.status || error?.response?.status;
      const details = {
        endpoint: config.steam.apiUrl,
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

      try {
        await this.logForward(
          accountId,
          message,
          "FAILED",
          JSON.stringify(details),
        );
      } catch (storageError) {
        console.error(
          "[Forward/API] Failed to save error log:",
          storageError.message,
        );
      }

      // notify dev only
      await this.sendErrorNotificationToDev(fromAccount, accountId, details);

      throw error;
    }
  }

  async logForward(accountId, message, status, error = null) {
    const forwardTo = await this.getForwardToEmail();
    const toRecipients = (message.toRecipients || [])
      .map((r) => r.emailAddress?.address)
      .filter(Boolean)
      .join(", ");

    const persist =
      status === "FAILED"
        ? messageLogRepo.recordFailure.bind(messageLogRepo)
        : messageLogRepo.upsert.bind(messageLogRepo);
    await persist({
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
  sendViaSMTP(...args) {
    return this.notifications.sendViaSMTP(...args);
  }
  sendImportantEmailViaSMTP(...args) {
    return this.notifications.sendImportantEmailViaSMTP(...args);
  }
  sendReauthNotification(...args) {
    return this.notifications.sendReauthNotification(...args);
  }
  sendErrorNotificationToDev(...args) {
    return this.notifications.sendErrorNotificationToDev(...args);
  }
}
module.exports = new ForwarderService();
