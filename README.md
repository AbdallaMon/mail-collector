Mail Collector

Complete documentation: [العربية](docs/learning/ar/00-overview.md) · [English](docs/learning/en/00-overview.md) · [All chapters](docs/README.md). Run `npm run docs:serve` for the local HTML reader, or `npm run docs:check` to verify bilingual coverage and links.

For a complete isolated local simulation, start Docker Desktop and run `npm run local`. It opens the real application at `http://127.0.0.1:5560` with administrator `admin@local.test` / `LocalDemo123!`, simulates Microsoft connection, injects a synthetic Steam message, and verifies the real PHP/MySQL save and local SMTP capture. It does not load production `.env` or `.env.test`. See [التشغيل المحلي](docs/learning/ar/12-local-demo.md) / [Local demo](docs/learning/en/12-local-demo.md). Use `npm run local:steam` for another message, `npm run local:stop` to stop, or `npm run local:smoke` for one run that stops automatically. Logs are written under `.local-demo/`.

Microsoft Graph notifications feed a Bull queue. Matching Steam messages are parsed in Node and sent as a signed JSON payload to the PHP receiver. SMTP delivers account/security/developer notifications. The maintenance worker renews Microsoft webhook subscriptions every hour.

Use Node 24 (see `.nvmrc`), MySQL and Redis. The minimum supported Node version is 22.12. Copy `.env.example` to `.env` for a new environment and fill its credentials. The local `.env` prepared during the 2026-10-19 review contains the deployed configuration; `localhost` database and Redis addresses refer to whichever machine runs the process. Preserve `ENCRYPTION_KEY` when using an existing token database, and match `STEAM_API_SECRET` with the PHP receiver.

```sh
npm ci
npm run check
npm test
npm run db:generate
```

For an explicitly selected database, apply existing migrations with `npx prisma migrate deploy` before starting. `npm start` runs the HTTP server and forwarding queue consumer; `npm run worker` runs subscription maintenance. Both processes are required. `npm run dev` starts both with Node's built-in file watcher. Starting the server preserves the existing default-admin creation behavior; set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for a fresh installation. The separate legacy `db:seed` command retains its original credentials and is not needed merely to check the code.

The source is organized as follows:

```text
src/
  app.js                    Express assembly and existing middleware order
  server.js                 Server startup and shutdown
  worker.js                 Maintenance worker entrypoint
  routes/                   URLs and authentication middleware
  controllers/              HTTP request and response adapters
  modules/                  Account, auth, dashboard, logs and webhook usecases
  repositories/             Prisma model queries
  services/                 Microsoft, Graph, Steam API, SMTP, sync and admin classes
  queues/                   Forwarding queue registration
  workers/                  Subscription maintenance class
test/                       Isolated behavior and HTTP checks
steam_inbound.php           PHP receiver with serialized duplicate checking
```

The PHP file depends on the shared hosting site's existing `includes/functions.php`, secret file and `IncomingCodes` table. The 20 October repair adds a MySQL named lock around its existing duplicate check and insert. It requires no new columns, indexes, tables or migrations. Its signing contract and existing success/duplicate responses are preserved.

The tests use synthetic data and local HTTP listeners. They do not connect to production MySQL/Redis/Microsoft or send external email. `npm run check` parses source and resolves imports without executing the services.

Reliability fixes are implemented locally: retained renewal jobs are recycled, transient errors preserve mailbox connection, delivery retries respect Retry-After, and confirmed deliveries use existing message logs to avoid repeat counting. Developer notification recipients/templates remain unchanged. Run `npm run local:verify` for isolated PHP/MySQL/Redis failure tests; it stops after verification. Read [الإصلاحات والنشر](docs/learning/ar/13-reliability-fixes.md) / [repairs and deployment](docs/learning/en/13-reliability-fixes.md). Deploy the receiver before enabling Node retries; this repair needs no database migration. No production deployment was performed. Manual sync/retry endpoints remain present with their documented older limitations.

Dependency compatibility decisions: Express stays on the current 4.x API, Prisma stays on the CommonJS-compatible 6.x client, and Bull remains 4.x. The pinned transitive overrides update Bull's UUID implementation and Prisma config's deep merge library; Prisma generation and the used UUID API were checked after the override. Revisit these pins when upgrading their parents.
