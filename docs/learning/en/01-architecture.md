---
title: "Files layers and process ownership"
category: "Mail Collector"
overview: "The routes previously mixed URLs, HTTP handling, Prisma queries, queue creation and message processing. The current organization preserves endpoints and response contracts while assigning each responsibility a clear location. It follows Transaction-app's classes and layering, while retaining this project's CommonJS, Express 4 and existing contracts; it does not import another project's permission or i18n system."
---

# Files layers and process ownership

[العربية](../ar/01-architecture.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Why the code was separated

The routes previously mixed URLs, HTTP handling, Prisma queries, queue creation and message processing. The current organization preserves endpoints and response contracts while assigning each responsibility a clear location. It follows Transaction-app's classes and layering, while retaining this project's CommonJS, Express 4 and existing contracts; it does not import another project's permission or i18n system.

| Layer | Location | Responsibility |
|---|---|---|
| Assembly | [app.js](../../../src/app.js) | Middleware order, routers and pages |
| Routes | [routes](../../../src/routes) | URL, HTTP method, authentication and controller binding |
| Controllers | [controllers](../../../src/controllers) | Request extraction, orchestration calls, HTTP status/JSON/redirect |
| Usecases | [modules](../../../src/modules) | Account/settings rules and notification processing |
| Services | [services](../../../src/services) | Microsoft, Graph, Steam, SMTP and manual sync orchestration |
| Repositories | [repositories](../../../src/repositories) | Prisma calls through the existing singleton |
| Queues/workers | [queues](../../../src/queues) and [workers](../../../src/workers) | Consumer registration and scheduling |
| Utilities/config | [utils](../../../src/utils) and [config](../../../src/config) | Errors, encryption, configuration and logging |

## 2. Startup order

[server.js](../../../src/server.js) loads configuration and the application, connects to MySQL, creates the default administrator if absent, then listens on PORT. Importing app loads forward.queue and registers a Bull consumer inside the HTTP process. Importing app in a real script is not free of Redis connection side effects.

Express mounts Helmet, CORS, body parsers, /api/webhooks, the /api rate limiter, Morgan, health/other APIs/static pages, then 404/error handlers. The webhook's placement before the limiter and Morgan is preserved. The current limiter allows 100 requests per IP in 15 minutes; the application does not configure trust proxy.

[worker.js](../../../src/worker.js) constructs WebhookMaintenanceWorker, registers SIGINT/SIGTERM and starts it. It checks MySQL and Redis, schedules an immediate planner and an hourly repeat. It does not automatically run SyncService.

## 3. Service ownership

| Class | Responsibility |
|---|---|
| MicrosoftAuthService | Consent URL, code exchange, refresh, encrypted token storage and connection completion |
| GraphService | Message/delta retrieval, Inbox connection test and Graph retries |
| WebhookService | Subscription creation/renewal and clientState validation |
| WebhooksUsecase | Account eligibility, message retrieval, filtering, delivery, counters and failures |
| SteamApiService | Username/code extraction, JSON signing and HTTP delivery to PHP |
| ForwarderService | Steam/subject decisions, delivery orchestration/logging and notification-address cache |
| NotificationService | SMTP message composition and delivery |
| SyncService | Manual delta sync/retry and dashboard statistics |
| AdminService | Default administrator creation at startup |

## 4. Dependency boundaries

Routes do not call Prisma. Repositories receive the same query arguments as before; the refactor does not introduce new query rules. MicrosoftAuthService lazily loads WebhookService to avoid a circular dependency because subscription creation also needs an access token. HTTP exceptions pass through [asyncHandler](../../../src/utils/asyncHandler.js) and [error.middleware](../../../src/middleware/error.middleware.js).

Small stateless helpers remain functions. Creating a class for every helper is not an objective. Names such as forwardGraphMessage remain compatibility interfaces even though current delivery targets the PHP API.

## Further learning

**Topic name:** Express middleware and CommonJS modules

**Search for:** Express middleware and CommonJS modules official documentation

**Recommended sources:** [Official reference](https://expressjs.com/en/guide/using-middleware.html)

[Previous](00-overview.md) · [Next](02-microsoft-oauth.md) · [Overview](00-overview.md)
