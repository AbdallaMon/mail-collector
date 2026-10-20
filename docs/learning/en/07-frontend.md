---
title: "Frontend screens and their actual behavior"
category: "Mail Collector"
overview: "public contains plain HTML, CSS and JavaScript, not React, Next or MUI. Express serves it from the same origin. Pages load shared Api, Auth, Modal and UI helpers. styles.css is the active stylesheet; the unreferenced old style.css was removed."
---

# Frontend screens and their actual behavior

[العربية](../ar/07-frontend.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Static frontend

public contains plain HTML, CSS and JavaScript, not React, Next or MUI. Express serves it from the same origin. Pages load shared Api, Auth, Modal and UI helpers. styles.css is the active stylesheet; the unreferenced old style.css was removed.

| Page | JavaScript | Current responsibility |
|---|---|---|
| / | [login.js](../../../public/js/login.js) | Submit email/password, store token/user and enter dashboard |
| /dashboard | [dashboard.js](../../../public/js/dashboard.js) | Account/counter statistics and five recent logs |
| /accounts | [accounts.js](../../../public/js/accounts.js) | Search/filter/pagination, Connect, toggle and delete |
| /logs | [logs.js](../../../public/js/logs.js) | Fetch /logs using page/limit and switch table presentation |
| /settings | [settings.js](../../../public/js/settings.js) | Notification address, Graph connection test and administrator password |
| /oauth/callback and /oauth-callback | [oauth-callback.js](../../../public/js/oauth-callback.js) | Loading/success/error states after redirect |

## 2. Session and requests

[Auth](../../../public/js/auth.js) treats local token/user presence as a login hint; signature verification occurs on the server. [Api](../../../public/js/api.js) attaches Bearer and parses JSON. HTTP 401 clears storage and navigates to /. Requests do not carry Microsoft tokens.

Connect obtains an authorization URL and changes window.location.href. The success page reads success/email query parameters. A legacy code branch still attempts POST /accounts/oauth/callback, but that endpoint is not registered. The supported path is the backend callback followed by a result redirect. No legacy endpoint was introduced during organization.

## 3. What UI labels do not establish

CONNECTED is not a subscription or PHP-delivery check. List summaries depend on displayed results. Toggle updates isEnabled without cancelling Graph subscriptions. Deletion removes the account and cascade-linked records, not its subscription without a foreign key.

The logs page calls /logs in both messages/system modes and changes columns; the current response is MailMessageLog data, not a separate SystemLog feed. Settings labels its connection check as forward, but it only checks Graph Inbox access. loadWorkerStatus exists but its DOMContentLoaded call is commented out. forwardToEmail is the SMTP notification destination, not the receiving API URL.

## 4. Loading and failures

Pages open Modal.loading and close it on success/failure. Accounts display empty and load-failure states. Frontend password validation accepts six characters while the backend requires eight; this discrepancy remains. Certain settings catch branches reference older display elements, and Api expects message while error middleware returns error. These are compatibility notes, not fixes implemented by documentation.

For later UI changes, trace the element, event handler, endpoint and response together. Removing an unbound frontend function does not authorize removal of an exposed endpoint used by another client.

## Further learning

**Topic name:** Browser fetch and application sessions

**Search for:** Browser fetch and application sessions official documentation

**Recommended sources:** [Official reference](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

[Previous](06-api-reference.md) · [Next](08-configuration-operations.md) · [Overview](00-overview.md)
