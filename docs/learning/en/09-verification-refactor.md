---
title: "Organization verification and documentation maintenance"
category: "Mail Collector"
overview: "Route handlers moved into controller/usecase classes and Prisma calls into repositories. Webhooks were split into controller, policy, usecase and queue. ForwarderService was separated into delivery orchestration, SteamApiService and NotificationService. App assembly and server startup were separated, and maintenance moved into its own class. The organization pass retained URLs, responses, payloads and token encryption. The subsequent reliability repair changes retry, error classification and job-retention behavior."
---

# Organization verification and documentation maintenance

[العربية](../ar/09-verification-refactor.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Code organization changes

Route handlers moved into controller/usecase classes and Prisma calls into repositories. Webhooks were split into controller, policy, usecase and queue. ForwarderService was separated into delivery orchestration, SteamApiService and NotificationService. App assembly and server startup were separated, and maintenance moved into its own class. The organization pass retained URLs, responses, payloads and token encryption. The subsequent reliability repair changes retry, error classification and job-retention behavior.

Unused Graph methods getMessagePreview/getMessageAttachments/forwardMessage, adminOnly, an old stylesheet, an unbound sync-button handler and old standalone setup/rate-limit scripts were removed. Exposed manual endpoints, schema and historical migrations remain. Native crypto replaces the direct crypto package, and direct UUID use became randomUUID. Unneeded mailparser, direct ioredis and cookie-parser dependencies were removed; Bull still depends on its internal Redis client. node --watch replaces nodemon.

## 2. Previous dependency update

The previous pass updated matching Prisma/client to 6.19.3, Axios 1.20.0, bcryptjs 3.0.3, Express 4.22.3, Helmet 8.3.0 and Nodemailer 10.1.7 with a lockfile. Express 5 and Prisma 7 were not introduced. Overrides pin uuid 11.1.1 under Bull and deepmerge-ts 8 under Prisma config; UUID is not a direct application dependency. Minimum Node is 22.12 and the target is 24.

The 20 October reliability repair does not upgrade runtime packages again. The previous audit on 19 October reported zero known vulnerabilities; that is a dated result, not a perpetual guarantee. [package.json](../../../package.json) and [package-lock.json](../../../package-lock.json) are the version references.

## 3. What verification covers

[mail-flow.test.js](../../../test/mail-flow.test.js) covers PHP HMAC/body-free payload, parsing/filtering, inactive-account handling, invalid clientState rejection, refresh/encryption, preserved failure behavior, maintenance scheduling and bcrypt/JWT/Nodemailer/UUID compatibility. [http.test.js](../../../test/http.test.js) exercises local Express pages, 401, validationToken, login, account lists and log details.

[load-app.js](../../../test/support/load-app.js) loads modules in a VM and replaces config/database/Bull/Axios/SMTP; external fetch is denied by default. [reliability.test.js](../../../test/reliability.test.js) checks classification, retained-job recovery, one forced refresh on401, response outcomes, durable success deduplication and preserved developer notifications even when error storage fails. Temporary refresh errors now explicitly retain connection status. The Docker-backed local:verify command exercises real PHP/MySQL/Redis, synthetic outages before/after persistence, concurrent receiver requests and retained failed Redis jobs. All email is captured locally.

The earlier local baseline comparison matched 31 endpoint responses and query sequences on specific fixtures, not every input. check resolves syntax/imports without starting services. Prisma validate/generate applies no migrations. No deployment or live Microsoft end-to-end test is claimed.

## 4. Maintaining these documents

Sources live under docs/learning/ar and docs/learning/en with matching filenames, language-switch links and code references. Each chapter includes a topic, search terms and a further-learning source. JavaScript/JSON/Prisma examples match across languages and use synthetic data. The HTML generator and CSS come from Transaction-app, with the project name and local serving endpoint adapted.

Run docs:check after edits. It checks language pairs, links, examples and endpoint/env/model/source coverage. docs:build regenerates docs/html; docs:serve displays it. Generated HTML is gitignored. File moves require fixing links in both languages; endpoint/env/model changes require updating the relevant chapter and source reference. Coverage checks establish presence, not semantic correctness of the explanation.

```sh
npm run check
npm test
npm run docs:check
npm run docs:build
```

## Further learning

**Topic name:** Node test runner and behavior-preserving refactoring

**Search for:** Node test runner and behavior-preserving refactoring official documentation

**Recommended sources:** [Official reference](https://nodejs.org/api/test.html)

[Previous](08-configuration-operations.md) · [Next](10-known-issues.md) · [Overview](00-overview.md)
