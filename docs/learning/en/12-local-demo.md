---
title: "Complete local run with a synthetic Steam message"
category: "Mail Collector"
overview: "One command starts the real application, MySQL, Redis and PHP locally, simulates Microsoft connection and token refresh, and verifies Steam delivery and SMTP capture."
---

# Complete local run with a synthetic Steam message

[العربية](../ar/12-local-demo.md)

> This is LOCAL_SIMULATION. The mailbox and Steam message are synthetic. Application and PHP code run normally; external Microsoft, Graph and SMTP are replaced by local services. This runs the locally repaired code; production has not been deployed.

## 1. Start with one command

Use Node 24, running Docker Desktop with Linux containers, and dependencies installed with npm ci. The first build may download the official PHP image and compile mysqli inside it. From the repository root:

```sh
npm run local
```

The command creates separate containers under the mail-collector-local project, waits for health, and applies the five existing migrations to **mail_collector_demo only**. It starts the local Microsoft substitute and the application's real HTTP and maintenance paths, then runs verification automatically. It stays running afterwards for interactive use.

Dashboard: [http://127.0.0.1:5560](http://127.0.0.1:5560). Synthetic administrator: admin@local.test / LocalDemo123!. The connected mailbox is steam-demo@outlook.local.test, not a real Outlook account.

## 2. What actually runs

| Component | Local implementation | Address |
|---|---|---|
| Application UI/API | Existing Express application and classes | 127.0.0.1:5560 |
| Microsoft OAuth and Graph | HTTP simulator with synthetic data | 127.0.0.1:5561 |
| Steam receiver | Current steam_inbound.php mounted read-only in PHP 8.3 with mysqli | 127.0.0.1:5562 |
| SMTP | Local sink saving EML without external delivery | 127.0.0.1:5563 |
| Collector database | Separate MySQL 8.4, mail_collector_demo | 127.0.0.1:3368 |
| PHP database | steam_receiver_demo in the same test MySQL container | Inside local MySQL |
| Queue | Real Bull with separate Redis 7 | 127.0.0.1:6398 |

PHP uses small local fixtures for includes/functions.php and the secret because the rest of the shared-hosting site is absent. Its IncomingCodes table mirrors the columns used by the current receiver, not the site's actual data. The runner does not use the existing MariaDB on3306 or other projects' MySQL/Redis services.

## 3. Verified scenario

1. Log into the actual administrator API.
2. Obtain an authorization URL, pass through simulated Microsoft and the real callback.
3. Check CONNECTED and exactly one subscription after real validationToken handling.
4. Check encrypted token storage, then expire **only this synthetic local token**.
5. Create a synthetic Steam message and notify the application's webhook.
6. Read it from local Graph, refresh the token, parse its username/code and sign the request.
7. Send to the real PHP receiver and verify the corresponding IncomingCodes row.
8. Inject a synthetic security message and verify SMTP capture as an EML file.

The runner does not report persistence merely because it received202; it waits for an actual PHP database row. FLOW_COMPLETE follows all checks. This exercises internal connection, encryption, queue and persistence paths, not Microsoft's actual authorization policies, Entra configuration or Internet webhook delivery.

## 4. Inject and stop

```sh
npm run local:steam
npm run local:steam -- --username demo_user --code A1B2C
npm run local:steam -- --variant web
npm run local:steam -- --variant guard-body
npm run local:stop
npm run local:smoke
npm run local:verify
```

local:steam requires a running local environment and verifies another synthetic delivery. Usernames use letters/digits/underscore; codes use five uppercase letters/digits. local:stop orCtrl+C stops Node children and **only this project's containers**, retaining data. local:smoke starts from a stopped state, runs the scenario and stops automatically. Do not run it over an active local session; occupied-port rejection prevents duplicate startup.

The web variant tests the web/mobile subject; guard-body tests a different subject with the Steam Guard phrase split across HTML tags. local:verify checks both through the actual PHP receiver and also rejects a missing, false or string body-match flag.

## 5. Logs and isolation

The generated .local-demo directory is gitignored and contains:

| File | Purpose |
|---|---|
| scenario.log | Structured events including OAUTH_CONNECTED, TOKEN_REFRESHED, CODE_SAVED, SMTP_CAPTURED and FLOW_COMPLETE |
| last-run.json | Last complete account/message/row result and refresh/SMTP checks |
| server.log, worker.log, services.log | Output from the three child processes |
| app.log, error.log | Local Winston output |
| php-logs/steam_api_requests.log | The existing PHP receiver's request log |
| smtp/*.eml | Captured synthetic notifications |
| session.json | Local run/control identity; do not share while running |

[settings.js](../../../scripts/local-demo/settings.js) defines synthetic endpoints, databases and secrets. [bootstrap.js](../../../scripts/local-demo/bootstrap.js) applies them only in local child processes and prevents .env/.env.test loading. It changes Microsoft endpoints to127.0.0.1 before services load. An empty compose.env prevents Compose from automatically loading production .env. Startup uses the default local Docker context and rejects remote endpoints. Published ports bind127.0.0.1.

## 6. Failures and simulator limits

If Docker is unavailable, start Docker Desktop and wait for readiness. For an occupied port, stop the previous demo or its owner; the launcher does not kill another application to claim a port. It does not change credentials in existing volumes. Container data persists between runs. Scenario failure stops owned resources and preserves logs rather than reporting success.

The simulator covers OAuth, /me, message reads, subscriptions and Inbox; full delta and Microsoft security policy are not simulated. local:verify adds503 before persistence, a lost success response after persistence, six concurrent PHP requests and retained Redis job recovery. It checks one PHP row, one counter increment, two attempts and local developer mail. Results are saved to repairs-result.json. Fault injection exists only in the local router, never in the production receiver. These repairs require no schema changes.

## Further learning

**Topic name:** Docker Compose healthchecks and local integration testing

**Search for:** service_healthy isolated test databases simulated OAuth

**Recommended sources:** [Docker startup order](https://docs.docker.com/compose/how-tos/startup-order/)

[Previous](11-source-reference.md) · [Next](13-reliability-fixes.md) · [Overview](00-overview.md)
