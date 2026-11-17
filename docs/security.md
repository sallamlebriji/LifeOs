# Security

## Implemented (Phase 1)

| Concern | Measure |
| --- | --- |
| Passwords | Argon2id (m = 19 MiB, t = 2, p = 1). Policy: 10–128 chars with a letter and a digit. A dummy hash equalises login timing for unknown emails. |
| Sessions | 15-min HS256 access JWT bound to a session id (issuer/audience checked), plus an opaque 256-bit refresh token stored as SHA-256. Every refresh rotates the token; replaying a rotated token revokes the whole family. Absolute 30-day session lifetime. |
| Revocation | The auth guard checks the session row on each request, so logout, password reset and account deletion take effect immediately. |
| Cookies | `httpOnly`, `SameSite=Lax`, `Secure` (required in production), refresh cookie scoped to `/api/v1/auth`. |
| CSRF | Cookie-authenticated mutations need the `X-LifeOS-Client` header; CORS allows only `WEB_ORIGIN`. The web app proxies the API so cookies stay first-party. |
| Data isolation / IDOR | User id comes only from the verified token. Every query filters by `userId`; other users' ids return 404 (covered by e2e tests). |
| Input validation | Shared Zod schemas on every body and query; unknown fields stripped; control characters removed from names; `avatarUrl` must be https. 256 KB body limit. |
| Rate limiting | Global 300 req/min/IP; credential endpoints 10 per 15 min; forgot-password 5 per 15 min; resend-verification 3 per 15 min. |
| Account enumeration | Login and forgot-password respond identically for unknown emails. |
| Email tokens | Single-use (conditional update), hashed, short-lived; issuing a new one invalidates the old. Password reset revokes every session. |
| Headers | Helmet on the API; `nosniff`, `DENY` framing, strict referrer and permissions policies on the web app. |
| Logging & audit | `AuditLog` records register, login, failed login, logout, refresh-token reuse, email verification, password reset/change, export and deletion — no secrets or tokens. Prisma errors are mapped without leaking SQL. |
| Privacy | Full JSON export and password-confirmed account deletion (cascading). |
| Secrets | Only via environment variables, validated at boot (the API refuses to start with a short JWT secret or insecure cookies in production). `.env` is git-ignored. |

## Planned

- Phase 2: role-based admin endpoints (the `Roles` guard is in place), per-route ownership helpers as modules grow.
- Phase 5: AES-256-GCM encryption for integration credentials (key from a KMS/secret store), real email delivery (SPF/DKIM), BullMQ jobs.
- Phase 6: dependency and container scanning in CI, CSP with nonces, external security review.

## Known limitations

- Email delivery uses a **log transport**: verification and reset links are printed to the API console. Do not deploy publicly until a real transport exists.
- Rate limiting is in memory per API instance; use Redis storage before scaling horizontally.
- Access tokens are HS256 with one shared secret; rotate by redeploying (all sessions must refresh). Asymmetric keys with `kid` rotation are a future improvement.
