---
title: "Mail Collector from mailbox to Steam code"
category: "Mail Collector"
overview: "The service connects Microsoft mailboxes through delegated OAuth, receives Inbox message notifications, reads each message from Graph, and sends extracted Steam data to a PHP receiver on shared hosting. PHP saves the code in the other site's IncomingCodes table. SMTP separately delivers security and failure notifications."
---

# Mail Collector from mailbox to Steam code

[العربية](../ar/00-overview.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. What the project does

The service connects Microsoft mailboxes through delegated OAuth, receives Inbox message notifications, reads each message from Graph, and sends extracted Steam data to a PHP receiver on shared hosting. PHP saves the code in the other site's IncomingCodes table. SMTP separately delivers security and failure notifications.

Synthetic example: a message from noreply@steampowered.com has a subject containing from new computer and a body containing username demo and code A1B2C. Node sends the parsed values, message identifiers and metadata, not the email body. Notification receipt, message retrieval, API acceptance and database persistence are separate outcomes.

## 2. Where each part runs

| Component | Responsibility |
|---|---|
| Browser | Administration and account connection; stores the dashboard JWT |
| Node HTTP process | Express, OAuth callback, account APIs, webhook reception and forwarding queue consumption |
| Maintenance worker process | Plans, creates and renews Graph subscriptions |
| Collector MySQL | Accounts, encrypted tokens, subscriptions, logs and settings |
| Redis / Bull | Delivery and maintenance jobs; it does not store the authoritative OAuth tokens |
| Microsoft Graph | Profile, messages and subscriptions |
| PHP shared hosting | Verifies the request signature and saves IncomingCodes in a separate database |
| SMTP | Notifications, not the main destination for Steam codes |

```text
Browser -> OAuth -> Microsoft -> Node callback -> Collector MySQL
Microsoft webhook -> Node HTTP -> Redis webhook-forward
Node queue consumer -> Graph message -> Steam parser -> signed HTTP -> PHP -> IncomingCodes
Maintenance worker -> Redis mail-sync -> Graph subscription create/renew
Errors / security messages -> SMTP -> configured notification recipients
```

## 3. Reading order

Start with the [code map](01-architecture.md), [OAuth](02-microsoft-oauth.md), [webhooks and queues](03-webhooks-queues.md), then the [Steam/PHP contract](04-steam-php.md). The [data model](05-data-model.md) and [API reference](06-api-reference.md) cover storage and requests. The [frontend](07-frontend.md) explains what the UI can establish, and [operations](08-configuration-operations.md) covers every environment variable. Read [verification and organization](09-verification-refactor.md) and [deferred issues](10-known-issues.md) before deploying. The [source reference](11-source-reference.md) links every source file to its responsibility.

## 4. Scope of this version

This guide describes the organized local code and the 20 October reliability repairs, not a deployed release. Automatic collection uses webhooks. Manual delta-sync endpoints remain exposed without background polling. Historical tables and migrations remain intact. See [repairs and deployment boundaries](13-reliability-fixes.md) and the remaining known issues.

## Further learning

**Topic name:** Microsoft Graph change notifications

**Search for:** Microsoft Graph change notifications official documentation

**Recommended sources:** [Official reference](https://learn.microsoft.com/en-us/graph/change-notifications-overview)

[Next](01-architecture.md) · [Overview](00-overview.md)

To exercise the complete flow on your machine, read [the local synthetic Steam demo](12-local-demo.md).
