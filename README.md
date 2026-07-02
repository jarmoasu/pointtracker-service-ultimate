# PointTracker Service – Ultimate

Backend service for real-time score tracking in Ultimate Frisbee.

> **Note:** This project was built with iterative AI assistance. Code prioritises rapid development over architectural perfection and should be treated as a solid MVP foundation.

---

## Purpose

- Secure write interface for a single active scorekeeper device
- Public read-only live endpoint for stream overlays (OBS, etc.)
- Minimal admin control panel

---

## Architecture

| Layer | Choice |
|---|---|
| Runtime | Node.js ≥ 20 |
| Framework | Fastify |
| Database | PostgreSQL via Prisma (local: Prisma Postgres dev server) |
| ORM | Prisma |
| Hosting | Render |

**Authentication:**
- Writer: Bearer token (claim-based, latest claim wins)
- Admin: Secure session cookie (`@fastify/secure-session`)

A single persistent stream channel is identified by `STREAM_ID`.

---

## API Reference

### Public endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ "ok": true }` |
| `GET` | `/ready` | DB connectivity check — returns `{ "ready": true }` |
| `GET` | `/live` | Live feed for overlays: teams, scores, clock, last goal |

**`GET /live` response:**
```json
{
  "homeTeamName": "Team A",
  "awayTeamName": "Team B",
  "homeScore": 5,
  "awayScore": 3,
  "gameClockSeconds": 610,
  "lastScore": {
    "team": "home",
    "scorer": "12",
    "assist": "7",
    "gameClockSeconds": 605
  },
  "updatedAt": "2025-06-25T12:00:00.000Z"
}
```

---

### Writer endpoints (Bearer token required)

Obtain a write token by claiming with the claim code:

```
POST /claim
{ "claimCode": "a1b2c3d4", "deviceName": "scorekeeper-iphone" }
→ { "writeToken": "<64-char hex token>" }
```

Then pass it as `Authorization: Bearer <writeToken>` on all writer requests.

| Method | Path | Body | Description |
|---|---|---|---|
| `PUT` | `/teams` | `{ "homeTeamName": "...", "awayTeamName": "..." }` | Set team names (resets scores if names change) |
| `PUT` | `/clock` | `{ "gameClockSeconds": 615 }` | Update game clock |
| `POST` | `/score` | `{ "team": "home"\|"away", "gameClockSeconds": 610, "scorer": "12", "assist": "7", "requestId": "goal-001" }` | Record a goal (idempotent via `requestId`) |
| `POST` | `/update_result` | All fields optional — see below | Bulk update state |

**`POST /update_result` body** (all fields optional):
```json
{
  "homeTeamName": "Team A",
  "awayTeamName": "Team B",
  "homeScore": 12,
  "awayScore": 7,
  "lastScore": "home",
  "lastScorer": "PlayerName",
  "lastAssist": "PlayerName"
}
```
`lastScore` accepts `"home"`, `"away"`, or either team name string.

---

### Admin endpoints (Session cookie required)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/admin/login` | — | `{ "password": "..." }` → sets session cookie |
| `POST` | `/admin/logout` | Session | Clears session |
| `GET` | `/admin/state` | Public (rate limited) | Full stream + auth state |
| `GET` | `/admin/claim-code` | Session | Returns current claim code |
| `POST` | `/admin/set-claim` | Session | `{ "claimCode": "a1b2c3d4" }` (8 hex chars) |
| `POST` | `/admin/rotate-claim` | Session | Generates and returns a new random claim code |
| `POST` | `/admin/reset` | Session | Resets stream state and clears active writer |

---

## Admin UI

Navigate to `/admin` in a browser. Features: login, view state, update teams, add goals, rotate claim code, reset game.

---

## Security

- Argon2id hashing for all secrets (admin password, claim code, write tokens)
- `@fastify/secure-session` signed cookies (HTTPS only, `httpOnly`, `SameSite: lax`)
- Rate limiting on all sensitive endpoints
- CORS allowlist — blocks browser origins unless `CORS_ORIGINS` is set
- Idempotent scoring via `requestId`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma Postgres or standard PostgreSQL URL |
| `ADMIN_PASSWORD` | Yes | Admin panel password (hashed on first boot) |
| `CLAIM_CODE` | Yes | Code scorekeeper devices use to claim a write token |
| `SESSION_SECRET_HEX` | Yes | 64-char hex string for signing session cookies |
| `STREAM_ID` | No | Logical stream name (default: `main`) |
| `PORT` | No | Port to listen on (Render sets this automatically) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins to restrict to, e.g. `https://yourdomain.com`. If unset, all origins are allowed (safe — write/admin endpoints are protected by tokens and session cookies). |

Generate a session secret:
```bash
openssl rand -hex 32
```

---

## Local Development

```bash
npm install

# Start local Prisma Postgres dev server (generates DATABASE_URL)
npx prisma dev

# Copy the generated DATABASE_URL into .env, then:
npm start
```

---

## Deployment (Render)

### Option 1 — One-click via blueprint

The repo includes a [`render.yaml`](render.yaml) blueprint. Fork this repo, connect it to Render, and Render will configure the service automatically. You must supply `DATABASE_URL`, `ADMIN_PASSWORD`, and `CLAIM_CODE` in the Render dashboard; `SESSION_SECRET_HEX` is auto-generated.

### Option 2 — Manual

1. Create a **Web Service** pointing to this repo.
2. Set **Build Command:** `npm install && npm run build`
3. Set **Start Command:** `npm start`
4. Add environment variables from the table above.
5. Deploy. On first boot, Prisma runs migrations and seeds initial state.

---

## Future Improvements

- WebSocket live push
- Event feed / goal history
- Timeout & halftime endpoints
