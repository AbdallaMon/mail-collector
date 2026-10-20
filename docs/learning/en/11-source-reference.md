---
title: "Complete source-file reference"
category: "Mail Collector"
overview: "This table links every src/public/prisma file, the PHP receiver, project tooling and tests. Members list declared class methods or top-level functions as navigation aids, not a claim that every method runs automatically. Read the relevant chapter for contracts and effects. Documentation remains editable Markdown; docs:check reports new source files absent from this reference."
---

# Complete source-file reference

[العربية](../ar/11-source-reference.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Using the reference

This table links every src/public/prisma file, the PHP receiver, project tooling and tests. Members list declared class methods or top-level functions as navigation aids, not a claim that every method runs automatically. Read the relevant chapter for contracts and effects. Documentation remains editable Markdown; docs:check reports new source files absent from this reference.

| File | Responsibility | Members |
|---|---|---|
| [prisma/migrations/20260204162144_init/migration.sql](../../../prisma/migrations/20260204162144_init/migration.sql) | Historical SQL; applied through Prisma migrations only | — |
| [prisma/migrations/20260205123504_change_some/migration.sql](../../../prisma/migrations/20260205123504_change_some/migration.sql) | Historical SQL; applied through Prisma migrations only | — |
| [prisma/migrations/20260206123821_change_mail_account/migration.sql](../../../prisma/migrations/20260206123821_change_mail_account/migration.sql) | Historical SQL; applied through Prisma migrations only | — |
| [prisma/migrations/20260206153702_added/migration.sql](../../../prisma/migrations/20260206153702_added/migration.sql) | Historical SQL; applied through Prisma migrations only | — |
| [prisma/migrations/20260207055352_added_subs/migration.sql](../../../prisma/migrations/20260207055352_added_subs/migration.sql) | Historical SQL; applied through Prisma migrations only | — |
| [prisma/migrations/migration_lock.toml](../../../prisma/migrations/migration_lock.toml) | Migration provider lock: mysql | — |
| [prisma/schema.prisma](../../../prisma/schema.prisma) | MySQL models, relations and enums | — |
| [prisma/seed.js](../../../prisma/seed.js) | Legacy administrator seeding CLI with fixed settings | main |
| [public/accounts.html](../../../public/accounts.html) | Static HTML page | — |
| [public/css/styles.css](../../../public/css/styles.css) | Application page styling | — |
| [public/dashboard.html](../../../public/dashboard.html) | Static HTML page | — |
| [public/index.html](../../../public/index.html) | Static HTML page | — |
| [public/js/accounts.js](../../../public/js/accounts.js) | Browser page/helper behavior; see frontend chapter | — |
| [public/js/api.js](../../../public/js/api.js) | Browser page/helper behavior; see frontend chapter | getHeaders, request, get, post, put, patch, delete |
| [public/js/auth.js](../../../public/js/auth.js) | Browser page/helper behavior; see frontend chapter | isLoggedIn, getUser, getToken, login, logout, requireAuth |
| [public/js/dashboard.js](../../../public/js/dashboard.js) | Browser page/helper behavior; see frontend chapter | loadDashboard, loadRecentLogs, logout |
| [public/js/login.js](../../../public/js/login.js) | Browser page/helper behavior; see frontend chapter | — |
| [public/js/logs.js](../../../public/js/logs.js) | Browser page/helper behavior; see frontend chapter | loadLogs, prevPage, nextPage, logout |
| [public/js/modal.js](../../../public/js/modal.js) | Browser page/helper behavior; see frontend chapter | — |
| [public/js/oauth-callback.js](../../../public/js/oauth-callback.js) | Browser page/helper behavior; see frontend chapter | handleCallback |
| [public/js/settings.js](../../../public/js/settings.js) | Browser page/helper behavior; see frontend chapter | loadConfig, loadWorkerStatus, handleForwardEmailChange, testForward, handlePasswordChange, logout |
| [public/js/ui.js](../../../public/js/ui.js) | Browser page/helper behavior; see frontend chapter | formatDate, formatRelativeTime, statusBadge, showLoading, showEmpty, showError, toast, confirm, renderSidebar |
| [public/logs.html](../../../public/logs.html) | Static HTML page | — |
| [public/oauth-callback.html](../../../public/oauth-callback.html) | Static HTML page | — |
| [public/settings.html](../../../public/settings.html) | Static HTML page | — |
| [scripts/check-docs-coverage.mjs](../../../scripts/check-docs-coverage.mjs) | API/env/model/file coverage and example validation | — |
| [scripts/check-learning-docs.mjs](../../../scripts/check-learning-docs.mjs) | Chapter-pair and link validation | walkMarkdownFiles, pathExists, findRepairedTarget, normalizeMarkdownTarget, hasLearningSection, hasExplicitLearningGuide |
| [scripts/check.js](../../../scripts/check.js) | Syntax/import verification without runtime execution | — |
| [scripts/docs-site-server.mjs](../../../scripts/docs-site-server.mjs) | Serve local HTML and rebuild docs | sendJson, runBuild, sanitizePath |
| [scripts/docs-site.css](../../../scripts/docs-site.css) | RTL/LTR documentation theme from Transaction-app | — |
| [scripts/generate-docs-site.mjs](../../../scripts/generate-docs-site.mjs) | Generate HTML from Markdown | measureTopbar, syncNavigation, collect, slugify, stripExt, toTitleCase, trimQuotes, parseFrontmatter, headingMatch, tableSeparator, parseTable, countIndent, parseList, parseBlockquote, parseBlocks, findHeadingIndices, isNumberedTitle, parseSectionContent, cleanSectionId, parseMarkdownDocument, safeDescription, findFirstParagraph, escapeHtml, renderInline, renderListHtml, renderTableHtml, renderBlockHtml, renderBlocksHtml, splitLeadingNumber, renderSectionHtml, buildSidebarHtml, breadcrumbHtml, renderDocPage, renderIndexPage, folderCardHtml, docCardHtml, renderFolderIndexPage, formatPhaseLabel, renderRootIndexPage, interactiveJsContent, ensureDir, readMarkdownFiles, dirExists, readMarkdownFilesRecursive, posixNormalize, makeDocKey, posixDirname, relFromTo, relIndex, assetPrefixFor, folderLabel, docPageRel, buildDocTree, sortedChildren, countItems, buildDocLinkIndex, rewriteInternalDocLinks, buildSection, resolvePhases, build |
| [src/app.js](../../../src/app.js) | Express assembly and middleware order | create |
| [src/config/database.js](../../../src/config/database.js) | Prisma singleton and connection lifecycle | — |
| [src/config/index.js](../../../src/config/index.js) | Load and parse 37 application settings | — |
| [src/config/logger.js](../../../src/config/logger.js) | Winston console/files and size rotation | — |
| [src/controllers/accounts.controller.js](../../../src/controllers/accounts.controller.js) | HTTP request/response adapter | reauthenticate, oauthUrl, list, getById, create, reconnect, sync, syncAll, test, update, remove, messages |
| [src/controllers/auth.controller.js](../../../src/controllers/auth.controller.js) | HTTP request/response adapter | login, me, connectMicrosoft, microsoftCallback, changePassword |
| [src/controllers/dashboard.controller.js](../../../src/controllers/dashboard.controller.js) | HTTP request/response adapter | stats, accountsOverview, recentActivity, syncAll, retryFailed, health, getConfig, workerStatus, updateConfig, testForward |
| [src/controllers/logs.controller.js](../../../src/controllers/logs.controller.js) | HTTP request/response adapter | list, getById, retry, cleanup |
| [src/controllers/webhooks.controller.js](../../../src/controllers/webhooks.controller.js) | HTTP request/response adapter | receive |
| [src/middleware/auth.middleware.js](../../../src/middleware/auth.middleware.js) | JWT and user authentication | — |
| [src/middleware/error.middleware.js](../../../src/middleware/error.middleware.js) | HTTP error mapping | — |
| [src/modules/accounts/accounts.usecase.js](../../../src/modules/accounts/accounts.usecase.js) | Usecase rules and orchestration | findById, requireAccount, list, getById, create, reconnect, sync, syncAll, test, update, remove, messages |
| [src/modules/auth/auth.usecase.js](../../../src/modules/auth/auth.usecase.js) | Usecase rules and orchestration | login, me, changePassword |
| [src/modules/dashboard/dashboard.usecase.js](../../../src/modules/dashboard/dashboard.usecase.js) | Usecase rules and orchestration | stats, accountsOverview, recentActivity, syncAll, retryFailed, health, getConfig, workerStatus, updateConfig, findConnectedAccount |
| [src/modules/logs/logs.usecase.js](../../../src/modules/logs/logs.usecase.js) | Usecase rules and orchestration | list, getById, retry, cleanup |
| [src/modules/webhooks/webhooks.policy.js](../../../src/modules/webhooks/webhooks.policy.js) | Filter/error policy | isAuthOrSuspendError, isSteamMessage, isImportantSender, buildErrorDetails |
| [src/modules/webhooks/webhooks.usecase.js](../../../src/modules/webhooks/webhooks.usecase.js) | Usecase rules and orchestration | processMessage, enqueueNotification |
| [src/queues/forward.queue.js](../../../src/queues/forward.queue.js) | Register webhook-forward consumer and options | — |
| [src/repositories/account.repo.js](../../../src/repositories/account.repo.js) | Prisma calls for this responsibility | findUnique, findMany, count, create, update, delete, aggregate, findFirst, upsert, groupBy |
| [src/repositories/admin.repo.js](../../../src/repositories/admin.repo.js) | Prisma calls for this responsibility | findUnique, create, update |
| [src/repositories/messageLog.repo.js](../../../src/repositories/messageLog.repo.js) | Prisma calls for this responsibility | findMany, count, findUnique, update, deleteMany, upsert |
| [src/repositories/setting.repo.js](../../../src/repositories/setting.repo.js) | Prisma calls for this responsibility | findUnique, upsert |
| [src/repositories/subscription.repo.js](../../../src/repositories/subscription.repo.js) | Prisma calls for this responsibility | upsert, findUnique, update, deleteMany, findMany |
| [src/repositories/syncState.repo.js](../../../src/repositories/syncState.repo.js) | Prisma calls for this responsibility | update, findUnique, upsert |
| [src/repositories/system.repo.js](../../../src/repositories/system.repo.js) | Prisma calls for this responsibility | ping |
| [src/repositories/systemLog.repo.js](../../../src/repositories/systemLog.repo.js) | Prisma calls for this responsibility | create, findMany, deleteMany |
| [src/repositories/token.repo.js](../../../src/repositories/token.repo.js) | Prisma calls for this responsibility | upsert, findUnique |
| [src/routes/accounts.routes.js](../../../src/routes/accounts.routes.js) | HTTP routes, authentication and controller binding | asyncHandler |
| [src/routes/auth.routes.js](../../../src/routes/auth.routes.js) | HTTP routes, authentication and controller binding | asyncHandler |
| [src/routes/dashboard.routes.js](../../../src/routes/dashboard.routes.js) | HTTP routes, authentication and controller binding | asyncHandler |
| [src/routes/logs.routes.js](../../../src/routes/logs.routes.js) | HTTP routes, authentication and controller binding | — |
| [src/routes/webhooks.routes.js](../../../src/routes/webhooks.routes.js) | HTTP routes, authentication and controller binding | — |
| [src/server.js](../../../src/server.js) | HTTP startup/shutdown, database connection and administrator initialization | start, shutdown |
| [src/services/admin.service.js](../../../src/services/admin.service.js) | Default administrator startup creation | ensureDefaultAdmin |
| [src/services/forwarder.service.js](../../../src/services/forwarder.service.js) | Steam orchestration, delivery/logging/notification and settings cache | constructor, getForwardToEmail, clearForwardToCache, forwardGraphMessage, logForward, sendViaSMTP, sendImportantEmailViaSMTP, sendReauthNotification, sendErrorNotificationToDev |
| [src/services/graph.service.js](../../../src/services/graph.service.js) | Graph client/retry, messages, delta and Inbox test | constructor, createClient, withRetry, sleep, initializeDelta, getDeltaMessages, getMessage, getMessageForWebhook, testConnection |
| [src/services/microsoftAuth.service.js](../../../src/services/microsoftAuth.service.js) | OAuth, tokens and account connection | constructor, generateAuthUrl, exchangeCodeForTokens, refreshAccessToken, getUserProfile, storeTokens, getValidAccessToken, completeOAuthFlow |
| [src/services/notification.service.js](../../../src/services/notification.service.js) | SMTP alerts and templates | constructor, sendViaSMTP, sendImportantEmailViaSMTP, sendReauthNotification, sendErrorNotificationToDev |
| [src/services/steamApi.service.js](../../../src/services/steamApi.service.js) | Parser, HMAC and HTTP to PHP | signApiPayload, sendSteamToApi, extractSteamCodeAndUsername |
| [src/services/sync.service.js](../../../src/services/sync.service.js) | Manual delta/retry and statistics | sleep, processMessage, syncMailbox, syncAllMailboxes, retryFailedMessages, retryMessage, getStatistics |
| [src/services/webhook.service.js](../../../src/services/webhook.service.js) | Microsoft subscription creation/renewal/validation | constructor, generateClientState, getExpirationDateTime, createSubscription, _deleteOldSubscriptionFromMicrosoft, renewSubscription, getAccountsNeedingSubscription, getExpiringSubscriptions, validateNotification, getSubscriptionStatus |
| [src/utils/ApiError.js](../../../src/utils/ApiError.js) | HTTP error with status/details | constructor |
| [src/utils/asyncHandler.js](../../../src/utils/asyncHandler.js) | Forward promise rejections to next | — |
| [src/utils/encryption.js](../../../src/utils/encryption.js) | CryptoJS AES token encryption | constructor, encrypt, decrypt |
| [src/worker.js](../../../src/worker.js) | Maintenance process entrypoint | — |
| [src/workers/webhookMaintenance.worker.js](../../../src/workers/webhookMaintenance.worker.js) | Maintenance planner, create/renew processors and lifecycle | constructor, planMaintenance, createSubscription, renewSubscription, start, shutdown |
| [steam_inbound.php](../../../steam_inbound.php) | PHP intake, HMAC validation, filtering and persistence | — |
| [test/http.test.js](../../../test/http.test.js) | HTTP contract checks with isolated services | — |
| [test/mail-flow.test.js](../../../test/mail-flow.test.js) | Mail/token flow and dependency compatibility tests | — |
| [test/support/load-app.js](../../../test/support/load-app.js) | VM loader and I/O test replacements | createHarness |

| [local-demo/compose.env](../../../local-demo/compose.env) | Empty file preventing Compose from loading production environment | — |
| [local-demo/compose.yaml](../../../local-demo/compose.yaml) | Separate MySQL/Redis/PHP services and loopback ports | — |
| [local-demo/mysql/init.sql](../../../local-demo/mysql/init.sql) | Synthetic IncomingCodes table and local receiver database grants | — |
| [local-demo/php/Dockerfile](../../../local-demo/php/Dockerfile) | Official PHP image with mysqli | — |
| [local-demo/php/functions.php](../../../local-demo/php/functions.php) | Demo PHP database connection only | — |
| [local-demo/php/router.php](../../../local-demo/php/router.php) | Route the real receiver plus demo health and row inspection | — |
| [local-demo/php/steam_secret.php](../../../local-demo/php/steam_secret.php) | Synthetic demo HMAC secret | — |
| [scripts/local-demo/bootstrap.js](../../../scripts/local-demo/bootstrap.js) | Local-only configuration, dotenv isolation and Microsoft endpoint routing | — |
| [scripts/local-demo/client.js](../../../scripts/local-demo/client.js) | Synthetic message injection and local stop commands | — |
| [scripts/local-demo/events.js](../../../scripts/local-demo/events.js) | LOCAL_SIMULATION structured JSON events | — |
| [scripts/local-demo/mock-microsoft.js](../../../scripts/local-demo/mock-microsoft.js) | OAuth/Graph/subscription substitute without external service calls | constructor, issueTokens, requireToken, createSubscription, inject, createApp |
| [scripts/local-demo/run.js](../../../scripts/local-demo/run.js) | Docker/migration/process/scenario lifecycle orchestration | constructor, execute, compose, ensurePortAvailable, launch, migrate, run, stop |
| [scripts/local-demo/scenario.js](../../../scripts/local-demo/scenario.js) | OAuth/refresh/Steam scenario with PHP-log, MySQL-row and SMTP checks | constructor, verifySession, sendSteam, run |
| [scripts/local-demo/server.js](../../../scripts/local-demo/server.js) | Run the real app on loopback against the demo database | — |
| [scripts/local-demo/services.js](../../../scripts/local-demo/services.js) | Start simulated Microsoft HTTP and local SMTP services | — |
| [scripts/local-demo/settings.js](../../../scripts/local-demo/settings.js) | Fixed synthetic configuration and local-target guards | constructor, environment, assertLocalUrl, assertLocalDocker |
| [scripts/local-demo/smtp-sink.js](../../../scripts/local-demo/smtp-sink.js) | Capture SMTP into local EML files | constructor, accept, listen, close |
| [scripts/local-demo/worker.js](../../../scripts/local-demo/worker.js) | Run the real maintenance worker with demo settings | — |
| [test/local-demo.test.js](../../../test/local-demo.test.js) | Configuration isolation and external-target rejection tests | — |

## 2. Where to start a change

For endpoints, trace route -> controller/usecase -> repo. Microsoft authorization belongs to MicrosoftAuthService. Filtering spans webhooks.policy and ForwarderService. Parsing/HMAC spans SteamApiService and PHP. Retry/job identity belongs to queue/worker code and requires considering retained Redis data. UI work spans HTML, its JavaScript and the API contract.

Keep business rules out of routes and secrets out of docs. Find callers before removing methods. Migrations are historical records, not dead Node code. The table provides complete file navigation; behavioral explanations are in preceding chapters.

## Further learning

Reliability repair sources: [upstreamErrorPolicy.js](../../../src/utils/upstreamErrorPolicy.js), [reliability.test.js](../../../test/reliability.test.js), [verify-repairs.js](../../../scripts/local-demo/verify-repairs.js).

**Topic name:** Code navigation and module responsibilities

**Search for:** Code navigation and module responsibilities official documentation

**Recommended sources:** [Official reference](https://nodejs.org/api/modules.html)

[Previous](10-known-issues.md) · [Overview](00-overview.md)

[Next](12-local-demo.md)
