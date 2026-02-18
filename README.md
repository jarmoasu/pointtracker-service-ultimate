PointTracker Service – Ultimate

Backend service for real-time score tracking in Ultimate (Frisbee).

IMPORTANT: Vibe-Coded Project This project has been vibe-coded using
ChatGPT 5.2. The implementation is iterative and AI-assisted. Code
prioritizes rapid development over architectural perfection.
It should be treated as a solid MVP foundation.

------------------------------------------------------------------------

PURPOSE

The system provides: - A secure write interface for a single active
scorekeeper device - A public read-only live endpoint for stream
overlays - A minimal admin control panel

------------------------------------------------------------------------

ARCHITECTURE

Runtime: Node.js (v20) Framework: Fastify Database: PostgreSQL ORM:
Prisma Hosting: Render

Authentication: - Writer: Bearer token (claim-based) - Admin:
secure-session cookie

Single persistent stream channel (STREAM_ID). Latest claim always wins.

------------------------------------------------------------------------

PUBLIC ENDPOINTS

GET /health Returns: { “ok”: true }

GET /ready Returns: { “ready”: true }

GET /live Public live feed for overlays. Returns current teams, score,
clock, and last goal.

------------------------------------------------------------------------

WRITER ENDPOINTS (Bearer token required)

POST /claim Request: { “claimCode”: “a1b2c3d4”, “deviceName”:
“scorekeeper-iphone” }

Response: { “writeToken”: “” }

PUT /teams { “homeTeamName”: “Team A”, “awayTeamName”: “Team B” }

PUT /clock { “gameClockSeconds”: 615 }

POST /score { “team”: “home”, “gameClockSeconds”: 610, “scorer”: “12”,
“assist”: “7”, “requestId”: “goal-001” }

Idempotent via requestId.

POST /update_result { “homeTeamName”: “Team A”, “awayTeamName”: “Team B”,
“HomeScore”: “12”, “awayScore”: “7”, “lastScore”: “teamName”,
“lastScorer”: “PlayerName”, “lastAssist”: “PlayerName” }

------------------------------------------------------------------------

ADMIN ENDPOINTS (Session-based)

POST /admin/login { “password”: “” }

GET /admin/state (public, rate limited)

GET /admin/claim-code (session required)

POST /admin/set-claim { "claimCode": "a1b2c3d4" } (session required, 8 hex chars)

POST /admin/rotate-claim Returns new claim code.

POST /admin/reset Resets stream state and clears writer.

------------------------------------------------------------------------

ADMIN UI

Accessible at: admin.html

Features: - Login - View state - Update teams - Add goal - Rotate
claim - Reset game

------------------------------------------------------------------------

SECURITY

-   Bearer token writer auth
-   Secure-session admin auth
-   Argon2 hashing
-   Rate limiting
-   Optional CORS restriction
-   Idempotent scoring

------------------------------------------------------------------------

ENVIRONMENT VARIABLES

DATABASE_URL=postgresql://… STREAM_ID=main ADMIN_PASSWORD=your-password
SESSION_SECRET_HEX=<64 hex chars> CORS_ORIGINS=https://yourdomain.com

Generate session secret: openssl rand -hex 32

------------------------------------------------------------------------

DEPLOYMENT (Render)


------------------------------------------------------------------------

FUTURE IMPROVEMENTS

-   WebSocket live push
-   Event feed history
-   Timeout & halftime endpoints

