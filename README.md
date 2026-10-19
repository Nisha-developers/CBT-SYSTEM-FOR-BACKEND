# CBT Backend

Node.js + Express 5 + MySQL API for the CBT school system.

## Setup
1. `npm install`
2. Create the database: `mysql -u root -p < database/mysql.sql`
3. Copy `.env.example` → `.env`, fill it in. **`ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` are required** (two different random strings, 32+ chars):
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. `npm run dev` (or `npm start`) → `http://localhost:5000`. The server refuses to start on a bad config.

## Architecture (strict layers — each file only talks to the layer below)
```
routes/       URL → middleware chain → controller       (no logic)
controllers/  read req.valid.*, call ONE service, send the response   (only place with req / res)
services/     business rules, transactions, orchestration            (no SQL, no req/res)
models/       ALL SQL lives here; explicit columns, never SELECT *   (no business rules)
validations/  strict zod schemas (unknown fields rejected, trimmed, length/pattern/range checked)
middleware/   auth, validate, rate limits, origin check, upload, errors
utils/        jwt, hash, cookies, transaction, errors, response, dates
config/       env (validated at boot), db pool
constants/    roles, exam types, limits
database/     mysql.sql
tests/        e2e.js (141 checks)
```
Request path: `route → [rate limit] → [auth] → validate → controller → service → model → MySQL`.
Every editable/deletable record is addressed by its **uid** (UUID); integer ids never leave the database.

## Authentication (access token + rotating refresh token)
- **Access token** — JWT, 15 min, signed with `ACCESS_TOKEN_SECRET`, sent as `Authorization: Bearer …`, kept **in memory** by the frontend (never localStorage).
- **Refresh token** — JWT, 7 days, signed with a *different* secret, delivered as an **httpOnly + SameSite cookie scoped to `/api/auth`** (JavaScript can't read it). Only its SHA-256 hash is stored (`refresh_tokens`).
- **Silent renewal** — on a 401 the frontend calls `POST /api/auth/refresh`; the cookie is traded for a new access token **and a new refresh token** (rotation), then the failed request is replayed.
- **Theft detection** — presenting an already-used refresh token (outside a 10 s duplicate-request window) revokes the whole session family.
- **Instant revocation** — `authenticate` re-checks the account in the DB on every request, so deactivated/deleted/demoted users lose access immediately; their refresh tokens are revoked too. Changing a student's password signs out their other devices.
- **Logout** revokes the session server-side and clears the cookie. `POST /auth/logout-all` signs out everywhere.

## Security measures
- helmet headers, `x-powered-by` off, strict CORS allow-list with credentials, body size limits (100 kb; 3 MB only for school routes carrying a logo), upload limits (10 MB, real PDF/DOCX magic bytes checked).
- Rate limiting: login = 5 wrong attempts / 15 min **per account + IP** (a shared school IP can't lock everyone out) plus a broad per-IP backstop; signup/setup, refresh and uploads are limited too.
- Origin check on the cookie endpoints (`/auth/refresh`, `/auth/logout`) against `CLIENT_ORIGIN` (CSRF).
- bcrypt (native, non-blocking; 12 rounds) with timing-equalised failed logins and one generic error message.
- Password policy for admins/students-who-change-it: 8–72 chars, letter + number.
- Validation on **every** route: `params`, `query` and `body`; unknown keys, wrong types (arrays/objects instead of strings), control characters, impossible dates, out-of-range numbers and oversized strings are rejected with 422 before any service runs. SQL is always parameterised.
- Central error handler: no stack traces or SQL in responses.

## Deployment notes
- Frontend and API on the **same site** (e.g. `app.school.com` + `api.school.com`): keep `COOKIE_SAMESITE=strict`.
- **Different sites** (e.g. `*.vercel.app` + `*.onrender.com`): `COOKIE_SAMESITE=none` and HTTPS (`COOKIE_SECURE=true`).
- Behind nginx / a host proxy: `TRUST_PROXY=1` so rate limits use real client IPs.
- Set `CLIENT_ORIGIN` to your real frontend URL(s).

## Other behaviour
- Student default password = last name (any case) until changed. OBJ exams auto-marked on submit; theory marked by a teacher.
- Answers saved on every click; the timer is server-side. Each student gets a random subset of the question pool.
- Students only see results after the admin releases them for that class arm + term.
- PDF/Word import extracts to a preview; nothing is saved until confirmed. `ANTHROPIC_API_KEY` enables AI extraction.

## Tests
`npm test` — 141 end-to-end checks (auth, rotation/theft, rate limiting, validation, exams, results). **Run on a fresh database**; it ends by deleting the school.
