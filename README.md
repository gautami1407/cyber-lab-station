# CyberLab Security Toolkit

CyberLab is a local-only security toolkit that runs directly on the host machine with Node.js, npm, PostgreSQL, Prisma, Express, React, and TypeScript.

This project is intended for authorized lab use only. Scanning and enumeration must stay within explicitly configured local or lab ranges. No Docker dependency is required.

## Requirements

- Node.js 20+
- npm
- PostgreSQL installed locally

## Native PostgreSQL installation

### Windows

1. Install PostgreSQL from the official PostgreSQL installer or a trusted package manager.
2. Start the PostgreSQL service.
3. Create a database named `cyberlab`.
4. Create a database named `cyberlab_test` for integration tests.

Example PowerShell:

```powershell
createdb -U postgres cyberlab
createdb -U postgres cyberlab_test
```

If `createdb` is not on your PATH, use the PostgreSQL bin directory or the pgAdmin tooling that came with your installation.

### macOS

Use Homebrew if needed:

```bash
brew install postgresql
brew services start postgresql
createdb cyberlab
createdb cyberlab_test
```

### Linux

On Debian/Ubuntu-based systems:

```bash
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
sudo -u postgres createdb cyberlab
sudo -u postgres createdb cyberlab_test
```

## Database creation

Create the primary local database:

```sql
CREATE DATABASE cyberlab;
```

For tests:

```sql
CREATE DATABASE cyberlab_test;
```

## Environment configuration

Create the backend environment file:

```bash
cd server
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Set the following values in `server/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/cyberlab
SESSION_SECRET=replace-with-a-long-random-secret
PORT=4000
FRONTEND_URL=http://localhost:8080
NODE_ENV=development

ALLOWED_SCAN_TARGETS=127.0.0.1,localhost
ALLOWED_ENUMERATION_DOMAINS=localhost

MAX_PORTS_PER_SCAN=1024
MAX_HOSTS_PER_SCAN=256
SCAN_TIMEOUT_MS=1000
SCAN_CONCURRENCY=20

AUTH_RATE_LIMIT=5
SCANNER_RATE_LIMIT=10
ENUMERATION_RATE_LIMIT=10
```

For test runs:

```env
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/cyberlab_test
```

Do not commit `server/.env`.

## Backend

Install dependencies and prepare Prisma:

```bash
cd server
npm install
npx prisma generate
npx prisma migrate deploy
```

If you are creating a fresh local database, this is the standard flow. If Prisma migration state is not set yet, use:

```bash
npx prisma db push
```

Start the API:

```bash
npm run dev
```

The server listens on:

```text
http://localhost:4000
```

## Frontend

From the project root:

```bash
cd ..
npm install
npm run dev
```

The frontend is expected to run at the origin configured in `FRONTEND_URL` (for example `http://localhost:8080` if you run the app that way). If you are using the default Vite port, update `FRONTEND_URL` to match it.

## Verification

Check the backend status:

```bash
curl http://localhost:4000/health
```

Expected success when PostgreSQL is reachable:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected"
  }
}
```

When PostgreSQL is unavailable, the endpoint returns:

```json
{
  "success": false,
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "Database unavailable."
  }
}
```

## First login

1. Open the frontend.
2. Register a new account.
3. Log in with the same credentials.
4. Confirm that a new `User` row exists in PostgreSQL and that a `Session` row is created.

## Lab scan

Use only local or explicitly authorized targets. Safe local lab examples:

- `127.0.0.1`
- `localhost`

The backend will reject targets outside the configured allowlist.

## Testing

Run the unit suite:

```bash
cd server
npm test
```

Run the integration test file when PostgreSQL is available:

```bash
cd server
npm run test:integration
```

## Troubleshooting

- PostgreSQL not running: start the local PostgreSQL service and confirm `DATABASE_URL` points to the local instance.
- Wrong password: verify the PostgreSQL username/password in `DATABASE_URL`.
- Database does not exist: create the `cyberlab` and `cyberlab_test` databases.
- Port already in use: stop the process listening on `4000` or change `PORT` in `server/.env`.
- Frontend cannot connect: ensure the frontend origin matches `FRONTEND_URL` and the backend is running.
- CSRF failure: refresh the page and retry after loading `/api/csrf` from the UI.
- Session failure: verify cookie settings and that `SESSION_SECRET` is set correctly.

No Docker commands are required for local development.

## Local lab configuration

The default safe configuration is:

```env
ALLOWED_SCAN_TARGETS=127.0.0.1,localhost
ALLOWED_ENUMERATION_DOMAINS=localhost
```

This keeps scanning within the local lab environment and prevents arbitrary external scanning by default.
