const upstreamErrorPolicy = require("../utils/upstreamErrorPolicy");
const config = require("../config");
const crypto = require("node:crypto");

class SteamApiService {
  signApiPayload(timestamp, bodyString) {
    const secret = config.steam.apiSecret;
    return crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${bodyString}`)
      .digest("hex");
  }

  async sendSteamToApi({ fromAccount, message, parsed }) {
    const url = config.steam.apiUrl;
    if (!url) {
      throw Object.assign(new Error("STEAM_API_URL is not set"), {
        source: "steam-api",
        retryable: false,
      });
    }
    const payload = {
      source: "mail-collector-graph",
      fromAccount,
      from: message.from?.emailAddress?.address || "",
      to: (message.toRecipients || [])
        .map((r) => r.emailAddress?.address)
        .filter(Boolean)
        .join(", "),
      subject: message.subject || "",
      receivedDateTime: message.receivedDateTime || new Date().toISOString(),
      internetMessageId: message.internetMessageId || null,
      graphMessageId: message.id,
      username: parsed?.username || "",
      code: parsed?.code || "",
    };
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify(payload);
    const controller = new AbortController();
    const timeoutMs =
      Number.isFinite(config.steam.timeoutMs) && config.steam.timeoutMs > 0
        ? config.steam.timeoutMs
        : 5000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Timestamp": ts,
          "X-Signature": this.signApiPayload(ts, body),
        },
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}
      console.log("[API] Steam response", {
        messageId: message.id,
        status: response.status,
        result: data?.reason || data?.saved,
      });
      if (!response.ok) {
        throw Object.assign(
          new Error(
            `API failed: ${response.status} ${response.statusText} - ${text}`,
          ),
          {
            source: "steam-api",
            status: response.status,
            code: data?.err,
            responseText: text,
            retryable:
              [408, 425, 429].includes(response.status) ||
              response.status >= 500,
            retryAfterMs: upstreamErrorPolicy.retryAfterMs({
              response: {
                headers: {
                  "retry-after": response.headers?.get?.("retry-after"),
                },
              },
            }),
          },
        );
      }
      if (data?.ok === true && data.saved === true) {
        return {
          success: true,
          delivered: true,
          duplicate: false,
          response: text,
        };
      }
      // Compatibility with the existing PHP contract: no new database column is required.
      if (
        data?.ok === true &&
        data.saved === false &&
        data.reason === "DUPLICATE_RECENT"
      ) {
        return {
          success: true,
          delivered: true,
          duplicate: true,
          response: text,
        };
      }
      if (data?.ok === true && data.ignored === true) {
        return {
          success: true,
          delivered: false,
          reason: data.reason || "IGNORED",
          response: text,
        };
      }
      throw Object.assign(
        new Error("Steam API returned an unexpected success response"),
        {
          source: "steam-api",
          status: response.status,
          code: "STEAM_API_BAD_RESPONSE",
          responseText: text,
          retryable: false,
        },
      );
    } catch (error) {
      error.source = "steam-api";
      if (typeof error.retryable !== "boolean") {
        error.retryable =
          error.name === "AbortError" ||
          error.message === "fetch failed" ||
          upstreamErrorPolicy.isRetryable(error);
      }
      console.error("[API] Failed to send Steam message", {
        fromAccount,
        messageId: message.id,
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timer);
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
}
module.exports = new SteamApiService();
