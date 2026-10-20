---
title: "API routes and response contracts"
category: "Mail Collector"
overview: "The base path is /api; JWT uses Authorization: Bearer. Accounts routes require authenticate except reauth/:id. All dashboard/log routes require authentication. auth/login, auth/microsoft/callback, webhooks/mail and health are public. Current routers add no role/object-scope guards; a role claim does not imply role enforcement."
---

# API routes and response contracts

[العربية](../ar/06-api-reference.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Authentication and envelopes

The base path is /api; JWT uses Authorization: Bearer. Accounts routes require authenticate except reauth/:id. All dashboard/log routes require authentication. auth/login, auth/microsoft/callback, webhooks/mail and health are public. Current routers add no role/object-scope guards; a role claim does not imply role enforcement.

Success usually has success:true and data, sometimes message. ApiError returns success:false, error and details, while some controllers use message. Prisma P2002 maps to 409 and P2025 to 404. Other failures can return 500. This is the existing contract, not Transaction-app's response envelope. Api.request reads json.message on non-2xx, so some error strings do not reach the UI unchanged.

The following list covers 33 endpoints: 31 auth/accounts/dashboard/log routes plus webhook and health. Public does not mean side-effect-free: callback and reauth participate in account authorization. Test/sync operations can refresh tokens and write the database.

| Method / path | Access | Input | Result |
|---|---|---|---|
| `POST /api/auth/login` | public | email, password | JWT + user |
| `GET /api/auth/me` | JWT | — | Current user |
| `GET /api/auth/microsoft/connect` | JWT | accountId? query | url + state |
| `GET /api/auth/microsoft/callback` | public | code/state or error | Connection writes then redirect |
| `POST /api/auth/change-password` | JWT | currentPassword, newPassword | Update bcrypt password |
| `GET /api/accounts/reauth/:id` | public | id | 404 HTML or Microsoft redirect |
| `GET /api/accounts/oauth/url` | JWT | — | url + state for a new connection |
| `GET /api/accounts` | JWT | page, limit, status, health, q | accounts + pagination.pages |
| `POST /api/accounts/sync-all` | JWT | — | results + summary + message |
| `GET /api/accounts/:id` | JWT | id | account + syncState + token metadata |
| `POST /api/accounts` | JWT | email | 201 new /200 existing; account + connectUrl |
| `POST /api/accounts/:id/reconnect` | JWT | id | connectUrl; does not itself complete authorization |
| `POST /api/accounts/:id/sync` | JWT | id | Sync result or contract-specific failure |
| `POST /api/accounts/:id/test` | JWT | id | data.connected; may refresh token |
| `PATCH /api/accounts/:id` | JWT | isEnabled | Updated account |
| `DELETE /api/accounts/:id` | JWT | id | Delete then SystemLog |
| `GET /api/accounts/:id/messages` | JWT | status, page, limit | messages + pagination.pages |
| `GET /api/dashboard/stats` | JWT | — | accounts/messages counters |
| `GET /api/dashboard/accounts-overview` | JWT | — | accounts + grouped |
| `GET /api/dashboard/recent-activity` | JWT | limit | System logs + message logs |
| `POST /api/dashboard/sync-all` | JWT | — | results + summary |
| `POST /api/dashboard/retry-failed` | JWT | — | Manual path currently calling a missing method |
| `GET /api/dashboard/health` | JWT | — | MySQL check + counters + process stats |
| `GET /api/dashboard/config` | JWT | — | forwardTo, syncInterval, forwardMethod |
| `POST /api/dashboard/config` | JWT | forwardToEmail | upsert + clear cache + audit |
| `GET /api/dashboard/worker-status` | JWT | — | Indicator derived from lastSyncAt |
| `POST /api/dashboard/test-forward` | JWT | — | First enabled connected account; Inbox test only |
| `GET /api/logs` | JWT | status, accountId, page, limit, date, search | logs + pagination.totalPages |
| `GET /api/logs/:id` | JWT | id | Log DTO or404 |
| `POST /api/logs/:id/retry` | JWT | id | PENDING only; no enqueue |
| `DELETE /api/logs/cleanup` | JWT | olderThanDays? default 30 | Delete old system logs and old FORWARDED messages |
| `POST /api/webhooks/mail` | public | validationToken or value[] | 200 text/plain or202 |
| `GET /health` | public | — | status:ok + timestamp |

## 2. Pagination and inputs

GET /accounts accepts page, limit, status, q and health. Page defaults to 1 with a minimum of 1; limit defaults to 50 and caps at 200. health=working forces CONNECTED; not_working forces not CONNECTED and can override status. q searches trimmed email text. Account messages use status/page/limit without the same clamp. Logs accept status/accountId/page/limit/date/search; date is a day in the Node process timezone, and search targets subject/fromAddress.

There is no shared schema-validation layer. Usecases contain checks and manual coercion. Account creation rejects empty email without an email-format validator. forwardToEmail has a regex. Password change requires the current password, a valid bcrypt match and a new length of at least 8. Account PATCH passes isEnabled through when defined.

## 3. Client-visible exceptions

POST /accounts returns 201 for new accounts and 200 for existing ones, with connectUrl. /accounts/:id/sync can return HTTP 200 with success:false for an internal failure, or success:true with data.errors because SyncService catches certain failures. sync-all summaries count !r.error without inspecting every r.errors entry. Log retry writes PENDING but adds no job. test-forward only checks Inbox access; it does not deliver Steam data to PHP or test SMTP.

GET /accounts/:id returns token expiry/scope/updatedAt, not plaintext access/refresh values. GET /health only returns status:ok and timestamp without checking Redis/MySQL. Dashboard health checks MySQL and reports counters/memory/uptime, not complete delivery health. Sources: [routes](../../../src/routes), [controllers](../../../src/controllers), [usecases](../../../src/modules).

## Further learning

**Topic name:** Express routes and HTTP contracts

**Search for:** Express routes and HTTP contracts official documentation

**Recommended sources:** [Official reference](https://expressjs.com/en/guide/routing.html)

[Previous](05-data-model.md) · [Next](07-frontend.md) · [Overview](00-overview.md)
