const syncStateRepo = require("../repositories/syncState.repo");
const axios = require("axios");
const config = require("../config");
const microsoftAuthService = require("./microsoftAuth.service");

/**
 * Microsoft Graph API Service
 */
class GraphService {
  constructor() {
    this.baseUrl = config.microsoft.graphBaseUrl;
  }

  createClient(accessToken) {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async withRetry(apiCall, maxRetries = 3) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;

        if (error.response?.status === 429) {
          const retryAfter = parseInt(
            error.response.headers["retry-after"] || "60",
            10,
          );
          await this.sleep(retryAfter * 1000);
        } else if (error.response?.status >= 500) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        } else if (error.response?.status === 401) {
          console.error(
            "401 Unauthorized:",
            error.response?.data?.error?.message,
          );
          throw error;
        } else {
          throw error;
        }
      }
    }

    throw lastError;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async initializeDelta(accountId) {
    const accessToken =
      await microsoftAuthService.getValidAccessToken(accountId);
    const client = this.createClient(accessToken);

    let deltaLink = null;
    let skippedCount = 0;
    let nextLink = `/me/mailFolders('Inbox')/messages/delta?$select=id,subject,from,receivedDateTime&$top=50`;

    // Page through ALL existing messages WITHOUT collecting them
    // We only want the deltaLink so future syncs pick up NEW messages only
    while (nextLink) {
      const response = await this.withRetry(() => client.get(nextLink));

      if (response.data.value) {
        skippedCount += response.data.value.length;
      }

      if (response.data["@odata.nextLink"]) {
        nextLink = response.data["@odata.nextLink"].replace(this.baseUrl, "");
      } else {
        nextLink = null;
        deltaLink = response.data["@odata.deltaLink"];
      }
    }

    if (deltaLink) {
      await syncStateRepo.update({
        where: { accountId },
        data: { deltaLink, lastDeltaAt: new Date() },
      });
    }

    console.log(
      `   ⊘ Skipped ${skippedCount} existing message(s) — will only forward new ones`,
    );
    return { messages: [], deltaLink };
  }

  async getDeltaMessages(accountId) {
    const syncState = await syncStateRepo.findUnique({
      where: { accountId },
    });

    if (!syncState?.deltaLink) {
      return this.initializeDelta(accountId);
    }

    const accessToken =
      await microsoftAuthService.getValidAccessToken(accountId);
    const client = this.createClient(accessToken);

    const messages = [];
    let deltaLink = null;
    let nextLink = syncState.deltaLink;

    try {
      while (nextLink) {
        const url = nextLink.startsWith("http")
          ? nextLink.replace(this.baseUrl, "")
          : nextLink;

        const response = await this.withRetry(() => client.get(url));

        if (response.data?.error) {
          throw new Error(
            `Graph API error: ${response.data.error.message || response.data.error.code}`,
          );
        }

        if (response.data.value) {
          const newMessages = response.data.value.filter(
            (msg) => !msg["@removed"],
          );
          messages.push(...newMessages);
        }

        if (response.data["@odata.nextLink"]) {
          nextLink = response.data["@odata.nextLink"];
        } else {
          nextLink = null;
          deltaLink = response.data["@odata.deltaLink"];
        }
      }

      if (deltaLink) {
        // Calculate lastMessageDateTime safely
        let lastMessageDateTime = undefined;
        if (messages.length > 0) {
          const validDates = messages
            .map((m) => new Date(m.receivedDateTime))
            .filter((d) => !isNaN(d.getTime()));
          if (validDates.length > 0) {
            lastMessageDateTime = new Date(
              Math.max(...validDates.map((d) => d.getTime())),
            );
          }
        }

        await syncStateRepo.update({
          where: { accountId },
          data: {
            deltaLink,
            lastDeltaAt: new Date(),
            ...(lastMessageDateTime && { lastMessageDateTime }),
          },
        });
      }

      return { messages, deltaLink };
    } catch (error) {
      if (error.response?.status === 410) {
        await syncStateRepo.update({
          where: { accountId },
          data: { deltaLink: null },
        });
        return this.initializeDelta(accountId);
      }
      throw error;
    }
  }

  async getMessage(accountId, messageId) {
    const accessToken =
      await microsoftAuthService.getValidAccessToken(accountId);
    const client = this.createClient(accessToken);
    const response = await this.withRetry(() =>
      client.get(`/me/messages/${messageId}?$expand=attachments`),
    );
    return response.data;
  }

  async getMessageForWebhook(accountId, messageId) {
    const url = `/me/messages/${messageId}?$select=id,subject,from,toRecipients,body,receivedDateTime,internetMessageId`;
    const readMessage = async (forceRefresh) => {
      const token = await microsoftAuthService.getValidAccessToken(accountId, {
        forceRefresh,
      });
      const response = await this.createClient(token).get(url, {
        timeout: 15_000,
      });
      return response.data;
    };
    // Bull owns transient retries for this path; avoid multiplying Graph and queue retries.
    try {
      return await readMessage(false);
    } catch (error) {
      if (error.response?.status !== 401) throw error;
      return readMessage(true);
    }
  }

  async testConnection(accountId) {
    try {
      const accessToken =
        await microsoftAuthService.getValidAccessToken(accountId);
      const client = this.createClient(accessToken);
      await client.get("/me/mailFolders/inbox");
      return true;
    } catch (error) {
      return false;
    }
  }
}
module.exports = new GraphService();
