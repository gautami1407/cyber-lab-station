# NetLink API

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
| GET | `/networks/interfaces` | Yes |
| GET | `/networks` | Yes |
| POST | `/networks/authorize` | User+ |
| DELETE | `/networks/:id` | User+ |
| POST | `/networks/:id/discover` | User+ |
| GET | `/devices` | Yes |
| GET | `/devices/:id` | Yes |
| GET | `/topology` | Yes |
| POST | `/diagnostics/ping` | User+ |
| POST | `/diagnostics/dns` | User+ |
| POST | `/diagnostics/traceroute` | User+ |
| POST | `/diagnostics/latency` | User+ |
| GET | `/monitoring/status` | Yes |
| POST | `/monitoring/start` | User+ |
| POST | `/monitoring/stop` | User+ |
| GET | `/events` | Yes |
| GET | `/alerts` | Yes |
| PATCH | `/alerts/:id` | User+ |
| GET | `/pairing` | Yes |
| POST | `/pairing/request` | User+ |
| POST | `/pairing/:id/approve` | User+ |
| POST | `/pairing/:id/reject` | User+ |
| DELETE | `/pairing/:id` | User+ |
| POST | `/remote/session` | User+ |
| POST | `/remote/session/:id/end` | User+ |
| POST | `/remote/operation` | User+ |

## Network authorization

`GET /networks/interfaces` reports the current host's real IPv4 interfaces. The client must submit one of those
observations to `POST /networks/authorize`; the server validates the interface again before persisting authorization.
Discovery is unavailable until a user has explicitly authorized a network. `POST /networks/:id/discover` currently
records the local host observation and never fabricates remote devices or physical topology.
