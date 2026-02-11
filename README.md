# PointTracker Service – Ultimate

Backend service for real-time Ultimate Frisbee scoring.

## Tech
- Node.js
- Fastify
- Prisma + SQLite

## Purpose
- Public read-only live state for stream overlays
- Write-protected updates from a single approved mobile app
- Simple admin UI in the same deployment

## Development
```bash
cp .env.example .env
npm install
npm run dev