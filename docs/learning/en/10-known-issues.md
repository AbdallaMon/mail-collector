---
title: "Known issues and repair status"
category: "Mail Collector"
overview: "This chapter separates the 19 October production snapshot from the locally implemented 20 October repairs and remaining work. Account counts are historical; no production deployment is claimed."
---

# Known issues and repair status

[العربية](../ar/10-known-issues.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Evidence boundary

This chapter separates the 19 October 2026 production snapshot from locally implemented 20 October repairs and remaining work. Account counts are historical, not live monitoring. The original investigation remains in [DIAGNOSIS.ar.md](../../DIAGNOSIS.ar.md). See [implementation and deployment](13-reliability-fixes.md); no production deployment is claimed.

## 2. Confirmed snapshot findings

| ID | Historical evidence | Current local status |
|---|---|---|
| MC-01 |28 enabled CONNECTED accounts had expired subscriptions; all had old failed renew jobs retained under the same jobId | Implemented terminal-job replacement, completion removal and eligible-account filtering; production recovery awaits deployment |
| MC-02 | AADSTS70000 requested security proof for accounts flagged by Microsoft; the two NEEDS_REAUTH accounts carried this reason | Complete Microsoft's verification and review account activity; reconnect when needed without bypassing verification |
| MC-03 | Jobs dated 6 August recorded AADSTS7000222 for an expired client secret; successful renewals occurred later | Monitor the actual Entra secret expiry; do not assume the current secret is expired or all secrets last two years |
| MC-04 | Retained delivery failures included 503 and fetch failed; forwarding attempts=1 | Implemented bounded retries, response validation, collector delivery records and serialized PHP duplicate checking without DDL |

The 21:57 Cairo sample contained 244 accounts: 242 CONNECTED and 2 NEEDS_REAUTH. There were 323 subscription records, including 79 without a current account and 31 expired for existing accounts; the 28 above are a subset of 31. Thus 110 expired subscriptions overall did not mean 110 current disabled users. PM2 reported both server and worker online, which did not establish successful renewal execution.

## 3. Shared-hosting comparison

On 19 October, the deployed steam_inbound.php matched the then-local file byte-for-byte, with this SHA-256. The repaired local file now differs; this is a historical comparison:

```text
5ABCCD7586591EB5D76A32ADD0590C858C11C8547AA9FFBCD0E490458656D8BE
```

The steam_api_requests.log sample contained 12911 lines from 9 February through 19 October: 6451 RECEIVED, 6440 SAVED, 11 DUPLICATE_RECENT and 9 EMPTY_BODY. Its last entry was 18:16:54 Cairo on 19 October. That day's six received requests had six save entries. These are line counts by event type, not 12911 separate messages.

No BAD_SIGNATURE/BAD_TIMESTAMP appeared in this file, and no receiver-specific errors appeared in the inspected general error_log through 3 October. No separate signature/secret/PHP error file was shown in the API directory at inspection. A503 can occur before PHP receives a request, so absence from its log does not exclude a hosting failure. The infrastructure cause of503 was not established.

## 4. Repaired behavior and remaining limitations

- MC-05: Implemented classification: transient refresh/Graph failures retain connection, real authorization refusal can require reconnect, application-secret failures stay separate. One forced refresh handles a stale Graph token.
- MC-06: No lifecycleNotificationUrl or missed/subscriptionRemoved/reauthorizationRequired handling. Proposal: lifecycle recovery and missed-message reconciliation; this was not proven as the cause for the 28 accounts.
- MC-07: Implemented saved/duplicate/ignored outcomes, webhook FORWARDED records and atomic success counting. HTTP202 still precedes durable Redis enqueue; lost notifications and log cleanup remain limitations. PHP still uses username/code/date matching, not a permanent message-ID constraint.
- MC-08: Expiry selection and processors now exclude missing/disabled/non-CONNECTED accounts. Existing orphan rows are not deleted; schema and account deletion lifecycle remain unchanged.
- MC-09: Manual log retry still only writes PENDING; retryFailedMessages still references missing getFailedMessages and the legacy forwardDelayMs gap remains. Manual-sync error notification now uses the existing developer notification method. Full manual-path recovery/counting is separate work.
- MC-10: Worker status uses last-message time and a polling interval despite the frontend call being commented out. test-forward only tests Inbox; logs/system shows the same message records. Proposal: accurate UI/monitoring semantics in a separate change.
- MC-11: OAuth state has no saved-session/age verification, a legacy frontend callback calls an unregistered route, and password validation differs at six versus eight characters. Proposal: separately scoped contract/security/UI changes with focused tests.

## 5. Suggested repair order

The agreed reliability code is implemented and tested locally. The deployment guide requires the PHP receiver before Node retry activation, one maintenance planner, and no schema migration for this repair. Existing NEEDS_REAUTH/ERROR accounts are not silently reset and historical failed Steam-code jobs are not bulk replayed. Microsoft verification, secret-expiry review, lifecycle recovery, UI semantics and manual paths remain separate actions.

## Further learning

**Topic name:** Failure classification and subscription recovery

**Search for:** Failure classification and subscription recovery official documentation

**Recommended sources:** [Official reference](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events)

[Previous](09-verification-refactor.md) · [Next](11-source-reference.md) · [Overview](00-overview.md)
