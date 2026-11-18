# Security audit (Phase 6)

Scope: the API, web app, mobile app and their dependencies as of 2026-11-18. Method: review against the OWASP ASVS L2 areas below, the automated test suite, and `pnpm audit --prod`.

## Results

| Area | Status | Evidence |
| --- | --- | --- |
| Authentication | ✅ | Argon2id; generic login errors with a dummy hash for unknown emails; rate limits on auth routes; e2e `auth.e2e-spec.ts` |
| Sessions | ✅ | 15-min JWT; opaque refresh tokens stored as SHA-256, rotated on use, family revoked on reuse; httpOnly SameSite=Lax cookies; mobile tokens in the device keychain (expo-secure-store) |
| CSRF | ✅ | Cookie-authenticated mutations require `X-LifeOS-Client`; e2e test asserts 403 |
| Access control | ✅ | Every query scoped by the token's user id; foreign ids → 404 (or 400 for references); e2e isolation tests in every module suite |
| Input validation | ✅ | Shared Zod schemas on every body/query; unknown fields stripped; RRULE whitelist; size caps on lists and ranges |
| AI safety | ✅ | The model only returns a validated intent; the deterministic engine places; nothing is written without explicit approval; stale-state fingerprint; locked events never moved; prompts carry task titles only |
| Secrets at rest | ✅ | OAuth credentials AES-256-GCM with per-user AAD; tokens never logged; `.env*` git-ignored |
| OAuth | ✅ | Authorization code + PKCE (S256); HMAC-signed, user-bound, 10-minute state cookie; token revocation on disconnect |
| Transport & headers | ✅ | Helmet on the API; HSTS, nosniff, frame-deny, referrer and permissions policies on the web; `COOKIE_SECURE` required in production |
| Audit trail | ✅ | Logins, failures, token reuse, password changes, exports, deletions, proposal decisions |
| Privacy | ✅ | Full data export; account deletion cascades; device calendar import is read-only |
| Rate limiting across instances | ⚠️ | In-memory per instance. Use a Redis-backed throttler storage before running more than one API instance publicly |
| Content Security Policy | ⚠️ | Not set on the web app yet (Next.js inline runtime needs nonces). Add a nonce-based CSP |
| Dependencies | ⚠️ | After upgrading nodemailer and pinning postcss/deepmerge-ts: 1 moderate left — `minimatch` inside `@expo/fingerprint` (build-time Expo tooling, not shipped to servers or devices). Re-check on the next Expo SDK |

## Fixed during the audit

- nodemailer 7 → 10.6 (7 high/moderate advisories, including SMTP command injection).
- `postcss` (via Next.js) and `deepmerge-ts` (via Prisma) pinned to patched versions with pnpm overrides.
- Sign-in/sign-up forms validated on blur, shifting layout under a pointer mid-click (found by Playwright) — now validated on submit.

## Not covered

No penetration test or third-party review. Google OAuth, Expo push and the OpenAI provider are tested against HTTP test doubles only.
