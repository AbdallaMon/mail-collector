---
title: "Configuration operations and logs"
category: "Mail Collector"
overview: "config/index.js loads dotenv from the working directory's .env, parses numbers/lists and exports one config object. The shareable template is .env.example, not private credential notes. Prisma reads DATABASE_URL through the schema. The following table covers all 37 variables. Fallbacks describe implementation, not recommended production settings."
---

# Configuration operations and logs

[العربية](../ar/08-configuration-operations.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Configuration sources

[config/index.js](../../../src/config/index.js) loads dotenv from the working directory's .env, parses numbers/lists and exports one config object. The shareable template is [.env.example](../../../.env.example), not private credential notes. Prisma reads DATABASE_URL through the schema. The following table covers all 37 variables. Fallbacks describe implementation, not recommended production settings.

| Variable | Fallback | Role |
|---|---|---|
| `NODE_ENV` | development | Logging and error-detail mode |
| `PORT` | 5000 | Express port |
| `API_URL` | http://localhost:5000 | Service address and reauthentication links |
| `FRONTEND_URL` | http://localhost:3000 | CORS and redirects; template uses same origin |
| `WEBHOOK_URL` | API_URL + /api/webhooks/mail | Microsoft notification endpoint |
| `DATABASE_URL` | required | Prisma MySQL connection |
| `REDIS_HOST` | localhost | Bull Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `REDIS_PASSWORD` | unset | Optional Redis password |
| `JWT_SECRET` | unsafe source fallback | Dashboard signing; configure a private value |
| `JWT_EXPIRES_IN` | 7d | Dashboard session lifetime |
| `ENCRYPTION_KEY` | required | Microsoft token encryption passphrase; stable with existing data |
| `ADMIN_EMAIL` | admin@example.com | Startup administrator identity; not seed |
| `ADMIN_PASSWORD` | unsafe source fallback | Password used only when creating the default user |
| `MICROSOFT_CLIENT_ID` | required | App registration identifier |
| `MICROSOFT_CLIENT_SECRET` | required | App registration secret |
| `MICROSOFT_REDIRECT_URI` | required | Registered backend callback |
| `MICROSOFT_SCOPES` | offline_access User.Read Mail.Read Mail.Send | Space-separated scopes |
| `STEAM_API_URL` | required for delivery | PHP POST destination |
| `STEAM_API_SECRET` | empty | Shared HMAC secret; PHP requires at least 16 characters |
| `STEAM_API_TIMEOUT_MS` | 5000 | Fetch timeout; parseInt |
| `STEAM_ONLY` | true | Apply allowlists before forwarder |
| `STEAM_ALLOWED_DOMAINS` | empty list | Comma-separated sender domains |
| `STEAM_ALLOWED_SENDERS` | empty list | Comma-separated exact sender addresses |
| `FORWARD_DELAY_MS` | 500 | Webhook delay after forwarder returns |
| `DEV_EMAIL` | null | Developer notification destination |
| `FORWARD_TO_EMAIL` | built-in address fallback | SMTP fallback address; SystemSetting takes precedence |
| `SMTP_HOST` | unset | SMTP server |
| `SMTP_PORT` | 465 | SMTP port |
| `SMTP_SECURE` | false unless literal true | TLS from connection start when literal true |
| `SMTP_USER` | unset | SMTP username |
| `SMTP_PASS` | unset | SMTP password |
| `SMTP_FROM` | SMTP_USER | Notification sender address/name |
| `MAX_RETRIES` | 1 | Manual retry threshold; not Bull attempts |
| `POLL_INTERVAL_MS` | 10000 | Legacy dashboard indicators only |
| `LOG_LEVEL` | info | Winston level |
| `LOG_FILE` | logs/app.log | Winston file path |

localhost refers to the machine running Node. Copying a VPS environment does not provision local MySQL/Redis or redirect their connections to the VPS. The webhook fallback directly uses process.env.API_URL; set WEBHOOK_URL explicitly. Encryption, JWT, Microsoft and Steam secrets have different purposes and are not interchangeable.

## 2. Commands and side effects

| Command | Effect |
|---|---|
| npm ci | Install the lockfile; postinstall generates Prisma Client |
| npm run check | Syntax/import resolution without executing services |
| npm test | Synthetic tests with local HTTP and external-service replacements |
| npm run db:generate | Generate the local client without migrations |
| npx prisma validate | Validate schema |
| npm start / npm run worker | Start HTTP/forwarding and maintenance processes; these can perform real writes/sends |
| npm run dev | Both processes through node --watch and concurrently |
| npm run prod | Both through concurrently; not a replacement for host process management |
| npm run db:migrate | prisma migrate dev; changes the selected development database |
| npx prisma migrate deploy | Apply existing migrations to the selected database |
| npm run db:push | Synchronize schema to the database; not a read-only check |
| npm run db:seed / npm run setup | Create data; setup includes db:push; neither is required for code review |
| npm run db:studio | Interface capable of reading/writing the configured database |
| npm run docs:check / docs:build / docs:serve | Check documentation, generate HTML or serve it locally |

Before a database-writing command, identify its intended DATABASE_URL without printing the password. New-environment setup is not automatically run against production during review. Startup uses AdminService/ADMIN_*, whereas seed has different fixed identity/role/bcrypt settings; running both can create separate administrators.

## 3. Locating a failure

Winston writes LOG_FILE and error.log with a 5MiB limit and five retained files each. OAuth/queue/SMTP console output goes to stdout/stderr and the process manager, not necessarily LOG_FILE. SystemLog is a separate audit table and MailMessageLog tracks message outcomes. No single channel contains all diagnostic evidence.

On the selected host, read pm2 list and pm2 logs --lines 100 --nostream for the named processes, then correlate time, account, subscription, job and graphMessageId. Do not print .env or token records when collecting evidence. GET /health establishes HTTP availability only; inspect subscription expiry, job state and API/PHP outcomes separately.

## 4. Documentation server

npm run docs:serve builds pages and serves docs/html at 127.0.0.1:5501 by default. DOCS_SITE_HOST and DOCS_SITE_PORT configure documentation tooling only and are separate from the 37 Collector variables. The script does not load the application .env. It does not serve .env or source files; source links work in Markdown and render as text in HTML. Edit Markdown and rebuild instead of editing generated HTML.

## Further learning

**Topic name:** Environment configuration and local verification

**Search for:** Environment configuration and local verification official documentation

**Recommended sources:** [Official reference](https://nodejs.org/api/cli.html)

[Previous](07-frontend.md) · [Next](09-verification-refactor.md) · [Overview](00-overview.md)
