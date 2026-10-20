class UpstreamErrorPolicy {
  status(error) {
    return Number(error?.status ?? error?.response?.status) || null;
  }

  retryAfterMs(error) {
    if (Number.isFinite(error?.retryAfterMs)) {
      return Math.max(0, error.retryAfterMs);
    }
    const value = error?.response?.headers?.["retry-after"];
    if (value == null) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(String(value));
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
  }

  isRetryable(error) {
    if (error?.needsReauth || error?.appConfigurationError) return false;
    if (typeof error?.retryable === "boolean") return error.retryable;
    const status = this.status(error);
    if (status) return [408, 425, 429].includes(status) || status >= 500;
    return [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ECONNABORTED",
      "EAI_AGAIN",
      "ENOTFOUND",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "P1001",
      "P1002",
      "P1008",
      "P1017",
      "P2024",
      "P2034",
    ].includes(error?.code || error?.cause?.code);
  }

  backoff(attemptsMade, error) {
    if (!this.isRetryable(error)) return -1;
    const exponential = Math.min(300_000, 5_000 * 2 ** (attemptsMade - 1));
    return Math.max(exponential, this.retryAfterMs(error));
  }

  microsoftRefreshError(error) {
    const data = error?.response?.data || {};
    const oauthCode = typeof data.error === "string" ? data.error : "";
    const description = data.error_description || error.message;
    const aadCodes = Array.isArray(data.error_codes)
      ? data.error_codes.map(Number)
      : [...String(description).matchAll(/AADSTS(\d+)/g)].map((match) =>
          Number(match[1]),
        );
    const appConfigurationError =
      [
        "invalid_client",
        "unauthorized_client",
        "invalid_scope",
        "invalid_request",
        "unsupported_grant_type",
      ].includes(oauthCode) ||
      aadCodes.some((code) =>
        [70002, 7000215, 7000218, 7000222].includes(code),
      );
    const retryable =
      !appConfigurationError &&
      (this.isRetryable(error) ||
        ["temporarily_unavailable", "server_error"].includes(oauthCode));
    const needsReauth =
      !appConfigurationError &&
      !retryable &&
      ([
        "invalid_grant",
        "interaction_required",
        "login_required",
        "consent_required",
      ].includes(oauthCode) ||
        aadCodes.includes(70000));
    // Do not retain Axios request/config: these contain the client secret and refresh token.
    return Object.assign(new Error(`Token refresh failed: ${description}`), {
      source: "microsoft-oauth",
      status: this.status(error),
      oauthCode,
      aadCodes,
      appConfigurationError,
      needsReauth,
      retryable,
      retryAfterMs: this.retryAfterMs(error),
    });
  }
}

module.exports = new UpstreamErrorPolicy();
