---
title: "Webhooks queues and subscription maintenance"
category: "Mail Collector"
overview: "webhooks.controller echoes validationToken as text/plain with status 200. For ordinary notifications it sends 202 first, then processes value[] and adds jobs. This acknowledgement precedes successful Redis persistence; later enqueue failures are logged without changing Microsoft's response."
---

# Webhooks queues and subscription maintenance

[العربية](../ar/03-webhooks-queues.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Notification reception

[webhooks.controller](../../../src/controllers/webhooks.controller.js) echoes validationToken as text/plain with status 200. For ordinary notifications it sends 202 first, then processes value[] and adds jobs. This acknowledgement precedes successful Redis persistence; later enqueue failures are logged without changing Microsoft's response.

[WebhooksUsecase.enqueueNotification](../../../src/modules/webhooks/webhooks.usecase.js) validates subscriptionId/clientState, reads the account and requires CONNECTED plus isEnabled. It obtains messageId from resourceData.id or the resource suffix after /messages/. The queued payload contains accountId, accountEmail and messageId; jobId is accountId:messageId.

## 2. Delivery queue

| Setting | Current value |
|---|---|
| Name | webhook-forward |
| Consumer | HTTP process; [forward.queue.js](../../../src/queues/forward.queue.js) |
| Concurrency | 1 per consumer |
| Attempts | Up to 5 total; transient errors only |
| removeOnComplete | true |
| removeOnFail | Last 100 jobs |
| Post-delivery delay | FORWARD_DELAY_MS, fallback 500ms |

Processing rechecks account eligibility and the existing message log. A FORWARDED record bypasses another delivery. It retrieves selected fields without attachments; Graph 401 forces one token refresh. STEAM_ONLY and important-security SMTP behavior are preserved. Only a confirmed saved/already-saved API result reaches completeForward, which writes FORWARDED and increments the account counter in one collector-database transaction.

Ignored/skipped results do not increase the webhook counter. Transient network/408/425/429/5xx and selected database failures retry with exponential backoff, starting at 5 seconds and honoring a longer Retry-After. Permanent errors stop early. Developer notifications remain active on each failed attempt; failedForwardCount increases on terminal failure only when the log was not already FORWARDED. Persistent deduplication lasts while the message record exists; log cleanup can remove it.

## 3. Subscription creation and renewal

[WebhookService](../../../src/services/webhook.service.js) subscribes to created changes on /me/mailFolders('Inbox')/messages for 4230 minutes (70.5 hours), with a random 32-byte hex clientState. It attempts to delete the old Microsoft subscription before creating a replacement and ignores deletion failure. Subscription identifiers, expiry and metadata are stored in MySQL.

renewSubscription performs PATCH, creates when no record exists, and deletes/recreates the local subscription record on Graph 400, 404 or InvalidSubscription. Both missing and expiring selections require CONNECTED, enabled accounts; expiry must be within 12 hours. Processors recheck eligibility at execution. Orphan subscription rows are excluded, not deleted.

## 4. Maintenance queue

| Setting | Current value |
|---|---|
| Name | mail-sync |
| Planner | webhook:plan-maintenance; concurrency 1; immediately and every hour |
| Create | webhook:create-subscription; concurrency 2; 300ms stagger |
| Renew | webhook:renew-subscription; concurrency 2; 200ms stagger |
| Attempts/backoff | Up to 5; 5s exponential delay, respecting a longer Retry-After |
| Retention | Remove completed; keep last 200 failed jobs |
| jobId | webhook:create:accountId and webhook:renew:accountId |

The [worker](../../../src/workers/webhookMaintenance.worker.js) inspects the fixed jobId before scheduling: completed/failed jobs are removed and recreated, while waiting/delayed/active jobs are retained. This repairs old failed jobs selected by the next startup/hourly plan without flushing Redis. Run one maintenance worker; check/remove/add is not a distributed planner lock. Tokens refresh on demand; the planner renews subscriptions, not every token.

## 5. Status and failure implications

Both Bull queues use the shared transient-error policy. The older Graph withRetry helper remains on manual delta paths; webhook message reads leave transient retry to Bull. AADSTS70000 still requires Microsoft's security verification. Lifecycle notifications and missed-message reconciliation remain unimplemented; PM2 online or CONNECTED alone cannot prove end-to-end health.

## Further learning

**Topic name:** Bull job retention and Graph subscription lifecycle

**Search for:** Bull job retention and Graph subscription lifecycle official documentation

**Recommended sources:** [Official reference](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md)

[Previous](02-microsoft-oauth.md) · [Next](04-steam-php.md) · [Overview](00-overview.md)
