---
title: "Reliability repairs without shared-hosting schema changes"
category: "Mail Collector"
overview: "The 20 October 2026 implementation fixes retained renewal jobs, failure classification and Steam retries while preserving developer notifications and existing tables."
---

# Reliability repairs without shared-hosting schema changes

[العربية](../ar/13-reliability-fixes.md)

> Implemented and tested locally on 20 October 2026. No VPS/shared-hosting deployment or production database writes were performed.

## 1. Repairs and source files

| Problem | Implementation | Source |
|---|---|---|
| Old job blocks the next renewal | Inspect jobId; replace failed/completed jobs only; remove completion and keep 200 failures | [WebhookMaintenanceWorker](../../../src/workers/webhookMaintenance.worker.js) |
| Ineligible account maintenance | Select CONNECTED/enabled accounts and recheck at execution | [WebhookService](../../../src/services/webhook.service.js) |
| Temporary outage requests reconnect | Separate network/429/5xx, account authorization refusal and application configuration; 15s timeout | [MicrosoftAuthService](../../../src/services/microsoftAuth.service.js), [UpstreamErrorPolicy](../../../src/utils/upstreamErrorPolicy.js) |
| Token rejected before locally stored expiry | One forced refresh after 401 during webhook message reading | [GraphService](../../../src/services/graph.service.js) |
| API outage without retry | Up to 5 attempts, exponential delay from 5s, honor Retry-After; stop permanent failures | [Forward queue](../../../src/queues/forward.queue.js) |
| Ignored response counted or confirmed delivery repeated | saved/duplicate/ignored outcomes; compound-key FORWARDED record and atomic counting | [SteamApiService](../../../src/services/steamApi.service.js), [WebhooksUsecase](../../../src/modules/webhooks/webhooks.usecase.js), [MessageLogRepo](../../../src/repositories/messageLog.repo.js) |
| PHP SELECT/INSERT race | GET_LOCK derived from database/normalized username/code, then check/save, finally RELEASE_LOCK | [steam_inbound.php](../../../steam_inbound.php) |

Both queues share the error policy. Retained terminal maintenance jobs no longer block the next eligible plan after deployment. Active/waiting/delayed jobs stay intact; the planner does not take work away from an active consumer.

## 2. Developer notifications and shared-hosting storage

[NotificationService](../../../src/services/notification.service.js) is byte-for-byte unchanged from the pre-repair version: templates, DEV_EMAIL and security/reauthentication recipients remain the same. Both existing API error notification paths remain, so one failed attempt can send a forwarder alert and a queue alert, including attempts that will retry. Failure to persist an error no longer suppresses developer mail. Manual-sync failure calls the existing developer notification method.

No new ALTER/CREATE, graphMessageId column, index or migration is introduced for IncomingCodes. INSERT uses the same columns; signing, secret and payload formats remain. The named lock is temporary MySQL state released explicitly or when its connection ends. Collector Prisma schema/migrations are also unchanged; FORWARDED uses the existing table.

## 3. Deduplication boundaries

The receiver retains its existing match: LOWER/TRIM username, code and DateTime >= original message time minus 60 seconds. That original timestamp stays stable across retries, so a row saved by the first attempt still matches a delayed retry. The lock serializes cooperating requests with the same key. The PHP source changes; the shared site's schema does not.

This is not general exactly-once delivery: the receiver stores no unique message identity, and its criteria may match two different messages. Locks require the same MySQL server and cooperating writers. Deleting IncomingCodes rows or cleaning up collector FORWARDED records removes deduplication evidence. Historical counters and the older manual paths are not retroactively repaired.

## 4. Repeatable verification

```sh
npm run check
npm test
npm run local:verify
npm run docs:check
npm run docs:build
```

At the time of writing, 24 isolated tests passed, together with these local checks using MySQL 8.4, Redis 7 and PHP 8.3:

| Scenario | Verified result |
|---|---|
| 503 before persistence | Second attempt succeeds; one PHP row, one count increment, account CONNECTED |
| Save followed by lost success response as 503 | Retry returns DUPLICATE_RECENT; one row, two attempts, one count increment |
| Six concurrent PHP requests | One save, five DUPLICATE_RECENT responses |
| Retained failed Redis job with the same ID | Replaced and executed; pending duplicate skipped; completion removed |
| Developer alert on failure | Both existing developer alerts captured locally for each 503; no external mail |

The launcher runs [verify-repairs.js](../../../scripts/local-demo/verify-repairs.js) in the isolated synthetic environment, then stops its resources. Evidence is in `.local-demo/repairs-result.json`, with detail in `.local-demo/scenario.log`, server.log and smtp/*.eml. Fault injection belongs only to the local test router, never to the deployable PHP receiver.

## 5. Deployment order after review

1. Preserve the current files and runtime settings. This repair requires no db:push, setup or migration on shared hosting.
2. Deploy the changed steam_inbound.php to its existing path first, preserving includes/functions.php and the secret. Confirm the host's MySQL supports GET_LOCK; verify persistence, duplication and alerts on the selected environment.
3. Deploy Node and its locked dependencies. Run the HTTP process and one maintenance worker. Its startup plan replaces eligible terminal jobs; do not use FLUSHALL or clear Redis.
4. Observe real subscription expiry/execution, then an authorized test-message flow. PM2 online alone is insufficient. Review existing ERROR/NEEDS_REAUTH accounts individually; the code does not silently reset them or bulk replay historical Steam codes.
5. Preserve the previous release for rollback. After the new version has run, inspect Redis jobs first: newly queued jobs use the `upstream` backoff strategy, which the old code does not register. Restoring files alone is not a complete rollback; retain queue-policy compatibility without clearing jobs. The modified PHP receiver remains compatible with the previous Node contract. There is no schema rollback for this patch.

These are documented steps, not completed production actions. Hosting behavior, actual client-secret validity and real Microsoft security verification are outside local simulation evidence.

## 6. Microsoft and remaining work

AADSTS70000 requesting security proof still needs the account holder to complete verification and reconnect if required; the code does not bypass Microsoft. AADSTS7000222 indicates an expired application secret in that log; review actual Entra expiry and update the value when needed without marking all accounts disconnected. Local simulation needs no Entra registration; real Microsoft connection requires an App Registration.

This patch does not add lifecycle notifications, change 202-before-enqueue, or repair every manual endpoint/UI inconsistency. See [issue status](10-known-issues.md) for the distinction between implemented repairs and remaining work.

## Further learning

**Topic name:** Retry policies and MySQL advisory locks

**Search for:** Bull custom backoff Retry-After MySQL GET_LOCK RELEASE_LOCK

**Recommended sources:** [Bull reference](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md), [MySQL locking functions](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html), [Microsoft errors](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes)

[Previous](12-local-demo.md) · [Overview](00-overview.md)
