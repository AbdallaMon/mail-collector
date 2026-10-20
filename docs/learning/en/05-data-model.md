---
title: "Data model states and consistency"
category: "Mail Collector"
overview: "schema.prisma uses MySQL and prisma-client-js. Entity IDs are String UUIDs, unlike Transaction-app's Int IDs. database.js supplies the runtime Prisma singleton. The seed remains a separate legacy CLI. This pass does not change the schema or SQL migrations."
---

# Data model states and consistency

[العربية](../ar/05-data-model.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Storage

[schema.prisma](../../../prisma/schema.prisma) uses MySQL and prisma-client-js. Entity IDs are String UUIDs, unlike Transaction-app's Int IDs. [database.js](../../../src/config/database.js) supplies the runtime Prisma singleton. The seed remains a separate legacy CLI. This pass does not change the schema or SQL migrations.

| Model | MySQL table | Stored data and important constraints |
|---|---|---|
| AdminUser | admin_users | Unique email, bcrypt password, name/role/isActive and timestamps |
| MailAccount | mail_accounts | Unique email, msUserId, displayName, status, isEnabled, activity/error fields and delivery counters |
| MailToken | mail_tokens | Unique accountId, encrypted access/refresh tokens, scope/type and expiresAt |
| MailSyncState | mail_sync_state | Unique accountId, deltaLink, lastDeltaAt, lastMessageDateTime and syncCursor |
| MailMessageLog | mail_message_log | Message metadata, attempts, error, timestamps and forwardStatus; unique(accountId, graphMessageId) and globally unique internetMessageId |
| SystemLog | system_logs | Level/category/message, JSON metadata and optional accountId |
| JobState | job_states | Historical job-state table; no current runtime use |
| SystemSetting | system_settings | Unique key and value; current key is forwardToEmail |
| WebhookSubscription | webhook_subscriptions | Unique accountId/subscriptionId, resource/changeType/URL/expiry/clientState |

## 2. Actual relationships

MailToken, MailSyncState and MailMessageLog reference MailAccount with onDelete: Cascade. WebhookSubscription has a unique accountId string but no declared account relation/foreign key. Deleting an account therefore does not automatically delete its subscription. SystemLog and JobState also have no cascading account relation.

```prisma
account MailAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
```

This is an existing relation example, not a proposed migration. Shared hosting's IncomingCodes database is separate. PHP establishes the columns it uses, but the other site's full schema is not present locally.

## 3. Account status versus enablement

| Status | Current use |
|---|---|
| PENDING | Created through POST /accounts and awaiting OAuth |
| CONNECTED | Successful OAuth or reset by manual sync; does not prove subscription health |
| NEEDS_REAUTH | Missing/rejected account authorization or explicit account suspension |
| ERROR | Legacy state; transient webhook errors no longer set it |
| DISABLED | Enum value; the current toggle changes isEnabled only |

isEnabled is independent of status. Webhooks require CONNECTED and isEnabled=true. Manual sync accepts CONNECTED or ERROR; single-account sync does not check isEnabled, while sync-all filters enabled accounts. Toggling does not change OAuth status or cancel the Microsoft subscription.

## 4. Message logs and counters

ForwardStatus remains PENDING, FORWARDED, FAILED or SKIPPED. Successful webhook delivery now writes FORWARDED and increments forwardedCount atomically in [MessageLogRepo.completeForward](../../../src/repositories/messageLog.repo.js). It locks the account row before reading the existing compound account/message key, so repeat completion does not increment twice. recordFailure cannot downgrade FORWARDED. Skips do not count as delivered; terminal queue failures alone increase failedForwardCount.

New success records use the existing accountId/graphMessageId key without populating the optional globally unique internetMessageId, which can be shared across inboxes. The schema is unchanged; other legacy log paths still use that field. Webhook attempts records the Bull attempt number, not all HTTP calls. Existing historical counters are not recalculated, and the manual sync/retry paths retain their older counting limits. PHP's existing username/code/date deduplication may also match distinct message IDs.

## 5. Manual delta sync

Without a deltaLink, initializeDelta pages through existing mail to establish a cursor and skips those messages; it does not automatically resend historical mail. getDeltaMessages follows pagination, excludes removed records and advances the cursor before delivery completes. Graph 410 clears the cursor and reinitializes. SyncService processes batches of eight messages and five accounts. Known retry gaps are documented under [issues](10-known-issues.md); this path is not a guarantee of automatic recovery for all missed messages.

## Further learning

**Topic name:** Prisma relations and Microsoft Graph delta queries

**Search for:** Prisma relations and Microsoft Graph delta queries official documentation

**Recommended sources:** [Official reference](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)

[Previous](04-steam-php.md) · [Next](06-api-reference.md) · [Overview](00-overview.md)
