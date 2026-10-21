---
title: "Steam extraction PHP contract and notifications"
category: "Mail Collector"
overview: "webhooks.policy compares a lowercased sender/address domain against configured allowlists. With STEAM_ONLY=true and two empty lists, ordinary Steam messages cannot pass this filter. ForwarderService then requires steampowered.com within the sender address and an access from new subject, one of the supported Arabic new-access subjects, or here is the steam guard code in the normalized body, case-insensitively. Disabling STEAM_ONLY does not remove the second filter or turn the application into a general mail collector."
---

# Steam extraction PHP contract and notifications

[العربية](../ar/04-steam-php.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Two filtering stages

[webhooks.policy](../../../src/modules/webhooks/webhooks.policy.js) compares a lowercased sender/address domain against configured allowlists. With STEAM_ONLY=true and two empty lists, ordinary Steam messages cannot pass this filter. [ForwarderService](../../../src/services/forwarder.service.js) then requires steampowered.com within the sender address and an access from new subject, one of the supported Arabic new-access subjects, or here is the steam guard code in the normalized body, case-insensitively. Disabling STEAM_ONLY does not remove the second filter or turn the application into a general mail collector.

[SteamApiService](../../../src/services/steamApi.service.js) removes style/script/tags and some HTML entities, takes the first standalone five-character uppercase-letter/digit token after the Steam Guard phrase when present (otherwise from the body), and searches several language-specific greeting patterns plus Dear for a username. These are specific parsing rules, not general Steam-message understanding. An empty body throws STEAM_BODY_MISSING. Missing parsed username/code still permits a Node request that PHP may ignore.

The Arabic subjects are `حسابك على Steam: الوصول من جهاز كمبيوتر جديد` and `حسابك على Steam: الوصول من جهاز كمبيوتر او موبايل جديد`. Both او and أو are accepted, with flexible whitespace. These are additional subject alternatives; saving still requires both a parsed username and code. A missing value produces MISSING_USERNAME_OR_CODE and no receiver row.

The body-match flag is computed after stripping HTML and normalizing whitespace, and is covered by the existing HMAC. PHP accepts only boolean true, not the string "true". The email body is still omitted. Both filters must be deployed together, PHP first. A match still requires a parsed username/code before PHP saves anything.

## 2. Payload and signature

JSON includes source, fromAccount, from, to, subject, receivedDateTime, internetMessageId, graphMessageId, username, code and hasSteamGuardCodeText. to joins recipient addresses with commas. Email body and attachments are omitted. source is mail-collector-graph. The webhook fills a missing message date from the stable job timestamp so retry input does not move forward in time.

X-Timestamp contains Unix seconds as a string. X-Signature is hex HMAC-SHA256 over timestamp, a dot and the **exact transmitted JSON string**, keyed by STEAM_API_SECRET. Reformatting JSON after signing changes the signed bytes. The shared example at the end sends no request.

Node POSTs application/json with an AbortController timeout of STEAM_API_TIMEOUT_MS, default 5000ms. saved:true and the existing DUPLICATE_RECENT response confirm delivery; ignored:true is skipped. Unexpected 2xx JSON is reported as a permanent contract error. Non-2xx preserves its source/status/Retry-After, and network/timeouts are retryable. ForwarderService still logs and notifies the developer; the queue retains its second existing notification path, including retryable attempts. Storage failures no longer suppress those alerts.

## 3. PHP processing order

[steam_inbound.php](../../../steam_inbound.php) requires ../includes/functions.php and ../../secrets/steam_secret.php. The secret file returns an array with STEAM_API_SECRET of at least 16 characters. get_mysql_connection supplies the site's database connection. This repository does not contain the rest of that site.

| Check/result | HTTP | Important JSON value |
|---|---|---|
| Missing/invalid secret | 500 | SECRET_NOT_CONFIGURED |
| Empty body or invalid JSON | 400 | EMPTY_BODY or INVALID_JSON |
| Missing signing headers | 401 | MISSING_SIGNATURE_HEADERS |
| Timestamp older than 300 seconds or over 60 seconds ahead | 401 | BAD_TIMESTAMP |
| Different HMAC | 401 | BAD_SIGNATURE |
| Non-Steam or unmatched subject | 200 | ignored:true and reason |
| Empty username or code | 200 | MISSING_USERNAME_OR_CODE with ignored:true |
| Recent duplicate | 200 | saved:false and DUPLICATE_RECENT |
| Persisted | 200 | saved:true and user/code |
| Save lock unavailable | 503 | SAVE_LOCK_TIMEOUT; Retry-After: 2 |
| Connection/write failure | 500 | DB_CONNECT_FAIL or SAVE_FAIL |

Signature comparison uses hash_equals. PHP accepts steampowered.com in from or steam in subject, then accepts access from new or a supported Arabic new-access subject, or the signed boolean hasSteamGuardCodeText=true. Date conversion, duplicate criteria and INSERT columns are preserved. Before SELECT/INSERT, GET_LOCK takes a per-database/normalized-username/code lock, waiting up to two seconds; finally releases it before returning. Strict mysqli errors prevent reporting an unsuccessful INSERT as saved. No columns, indexes, tables or migrations are added. The existing check is LOWER(TRIM(UserName)), code and DateTime >= the original message date minus 60 seconds, without an upper bound. This protects retries and cooperating concurrent requests on the same MySQL server; it is not immutable-message-ID or global exactly-once storage. Other writers must use the same lock, and deleting historical rows removes their deduplication evidence.

## 4. SMTP and logs

[NotificationService](../../../src/services/notification.service.js) uses Nodemailer for security, reauthentication and error messages. Recognized app-access notices are skipped. Other important Microsoft messages go to forwardTo and DEV_EMAIL when different. Reauthentication alerts use the same recipients; the general error alert here is developer-only. forwardTo comes from SystemSetting then environment, with a five-minute cache cleared when the setting changes. Changing that notification address does not change STEAM_API_URL.

sendViaSMTP returns false on SMTP failure instead of throwing. A missing alert does not establish absence of the original failure. PHP writes steam_api_requests.log plus separate runtime/secret/signature logs when necessary. Logs may contain usernames and codes; use synthetic examples when sharing diagnostics.

```js
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const payload = {
  source: "mail-collector-graph",
  fromAccount: "mailbox@example.test",
  from: "noreply@steampowered.com",
  to: "mailbox@example.test",
  subject: "Steam access from new computer",
  receivedDateTime: "2026-10-19T10:00:00Z",
  internetMessageId: "<synthetic@example.test>",
  graphMessageId: "synthetic-message-1",
  username: "demo",
  code: "A1B2C",
  hasSteamGuardCodeText: false
};
const body = JSON.stringify(payload);
const timestamp = "1792404000";
const secret = "synthetic-example-only";
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${body}`).digest("hex");
assert.equal(signature.length, 64);
assert.equal(Object.hasOwn(payload, "body"), false);
// No network request is sent by this example.
```

## Further learning

**Topic name:** HMAC signed HTTP payloads

**Search for:** HMAC signed HTTP payloads official documentation

**Recommended sources:** [Official reference](https://www.php.net/manual/en/function.hash-hmac.php)

[Previous](03-webhooks-queues.md) · [Next](05-data-model.md) · [Overview](00-overview.md)
