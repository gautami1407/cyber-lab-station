# CyberLab security

## Implemented controls

- Argon2id password hashing
- HttpOnly session cookies (`SameSite=Lax`, `Secure` in production)
- Idle and absolute session expiry
- Login rate limiting and account lockout
- RBAC (`guest`, `user`, `moderator`, `admin`) with middleware
- Zod validation; unexpected fields rejected on auth bodies
- Double-submit CSRF (`cyberlab.csrf` + `X-CSRF-Token`)
- Origin check against `FRONTEND_URL`
- Helmet (CSP for API, nosniff, referrer-policy, HSTS in production)
- CORS credentials limited to `FRONTEND_URL`
- Scanner/enumeration allowlists (fail closed for unlisted targets)
- MAX_PORTS_PER_SCAN / MAX_HOSTS_PER_SCAN, timeouts, concurrency
- Audit log for auth and scan lifecycle events
- Generic API errors (no stacks, SQL, or secrets)

## CSRF

1. `GET /api/csrf` sets `cyberlab.csrf` and returns `{ csrfToken }`.
2. Browser sends `X-CSRF-Token` on POST/PUT/PATCH/DELETE.
3. Missing or mismatched tokens return `403 CSRF_REJECTED`.

## Lab mode

Lab mode still enforces allowlists. It does not disable authentication, CSRF, or range limits.

## Not implemented

- MFA / WebAuthn
- SYN/UDP/stealth scanning
- Exploitation or credential attacks
- Wildcard Internet scanning
