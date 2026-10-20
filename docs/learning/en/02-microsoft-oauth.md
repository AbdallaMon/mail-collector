---
title: "Microsoft OAuth and token lifecycle"
category: "Mail Collector"
overview: "The dashboard JWT is issued by POST /api/auth/login after bcrypt.compare. It contains userId, email and role, and expires according to JWT_EXPIRES_IN. Authentication verifies its signature and an active AdminUser on each request. There is no dashboard JWT refresh mechanism; expiry returns the browser to dashboard login."
---

# Microsoft OAuth and token lifecycle

[العربية](../ar/02-microsoft-oauth.md)

> Source review: 2026-10-20. Includes the locally implemented reliability fixes; no production deployment is claimed. Examples are synthetic.

## 1. Dashboard sessions and mailbox authorization are separate

The dashboard JWT is issued by POST /api/auth/login after bcrypt.compare. It contains userId, email and role, and expires according to JWT_EXPIRES_IN. Authentication verifies its signature and an active AdminUser on each request. There is no dashboard JWT refresh mechanism; expiry returns the browser to dashboard login.

Microsoft tokens are stored separately for each MailAccount in MailToken: accessToken authorizes Graph calls and refreshToken obtains replacements. Changing JWT_SECRET does not refresh Microsoft authorization. The Microsoft client secret belongs to the app registration, not to a mailbox password.

## 2. Connect to database flow

1. [accounts.js](../../../public/js/accounts.js) requests GET /api/accounts/oauth/url and navigates to the returned URL.
2. generateAuthUrl encodes accountId, nonce and timestamp as base64url JSON state; it sends response_type=code, response_mode=query, prompt=consent and configured scopes.
3. Microsoft redirects to MICROSOFT_REDIRECT_URI, a backend callback.
4. [auth.controller](../../../src/controllers/auth.controller.js) handles provider errors or missing code/state. On success it redirects to /oauth/callback?success=true with account email and ID.
5. completeOAuthFlow decodes state, exchanges the code at the token endpoint and calls /me. Email comes from profile.mail or userPrincipalName.
6. An accountId in state triggers an update; otherwise the account is upserted by email. The service sets CONNECTED, clears lastError/errorCount, saves tokens and syncState, and attempts subscription creation.

The last subscription failure is logged without failing OAuth. Therefore success=true does not establish a healthy subscription or a code saved in PHP. These writes are not one database transaction.

## 3. Refresh and encryption

[getValidAccessToken](../../../src/services/microsoftAuth.service.js) reads the token record. With more than five minutes remaining it decrypts and returns the access token; otherwise it decrypts the refresh token and requests a replacement. expires_in sets the new expiry. A replacement refresh token is saved when provided; an update retains the previous refresh token when the replacement is absent.

[encryption.js](../../../src/utils/encryption.js) uses CryptoJS.AES with ENCRYPTION_KEY as a passphrase. This is neither Transaction-app's GCM service nor a fixed-length raw hex-key implementation. Preserve the key for an existing encrypted database unless migrating its ciphertext. Empty/decryption failures are handled. Refresh requests are not serialized per account.

## 4. Current boundaries and deferred repairs

Refresh errors now retain a safe classification through [upstreamErrorPolicy](../../../src/utils/upstreamErrorPolicy.js): network failures, 429 and 5xx keep the connection status; missing tokens or a genuine invalid_grant/interaction_required can require reauthentication. Invalid application credentials, including AADSTS7000222, are application-configuration failures and do not mark every mailbox disconnected. The wrapper keeps status, OAuth/AAD codes and Retry-After without retaining Axios request/config containing secrets. Decryption/storage failures do not themselves imply revoked consent. Graph message reads force one refresh after 401; a second rejection is reported rather than looping.

completeOAuthFlow parses state JSON without comparing a stored session nonce or validating timestamp age. It should not be described as complete CSRF protection. reauth/:id is public for email links. These are existing boundaries, not changes introduced or fixed by the refactor.

Default scopes remain offline_access, User.Read, Mail.Read and Mail.Send. The current delivery path no longer calls Graph forward, but changing app registration/consent scopes is separate work. Read [deferred issues](10-known-issues.md) before interpreting every background failure as an expired refresh token.

## Further learning

**Topic name:** OAuth authorization code and refresh tokens

**Search for:** OAuth authorization code and refresh tokens official documentation

**Recommended sources:** [Official reference](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)

[Previous](01-architecture.md) · [Next](03-webhooks-queues.md) · [Overview](00-overview.md)
