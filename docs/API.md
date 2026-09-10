# CyberLab API

Base URL: `/api` (proxied from the Vite app) or `http://127.0.0.1:4000/api`.

Cookies: `cyberlab.sid` (HttpOnly session), `cyberlab.csrf` (readable CSRF token).

Mutating requests require header `X-CSRF-Token` matching the CSRF cookie.

Envelope:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid request." } }
```

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/csrf` | No |
| GET | `/health` | No |
| POST | `/auth/register` | No |
| POST | `/auth/login` | No |
| POST | `/auth/logout` | Cookie |
| GET | `/auth/session` | Yes |
| POST | `/auth/session/refresh` | Yes |
| GET | `/auth/sessions` | Yes |
| DELETE | `/auth/sessions/:id` | Yes |
| POST | `/auth/logout-all` | Yes |
| POST | `/scanner/ports` | User+ |
| POST | `/scanner/ip-range` | User+ |
| POST | `/subdomains/enumerate` | User+ |
| GET | `/operations/:id` | Yes |
| POST | `/operations/:id/cancel` | Yes |
| POST | `/security/validate-input` | User+ |
| GET | `/security/checks` | Yes |
| GET | `/security/recommendations` | Yes |
| GET | `/security/rbac` | Yes |
| GET | `/security/admin` | Admin |
| GET | `/activity` | Yes |
| GET | `/dashboard` | Yes |
| GET | `/settings/public` | Yes |
