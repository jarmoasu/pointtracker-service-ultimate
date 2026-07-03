'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const prisma = require('../lib/prisma');
const { requireWriter } = require('../lib/writerAuth');

function randomToken() {
  // 32 bytes => 64 hex chars
  return crypto.randomBytes(32).toString('hex');
}

async function writerRoutes(fastify) {
  // Parse JSON bodies
  // (Fastify parses JSON by default when content-type is application/json)

  // 1) Claim: claimCode -> writeToken + streamId (rate limited)
  // Not scoped under /streams/:streamId because the client doesn't know
  // which court it's claiming until the claim code resolves one.
  fastify.post('/claim', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const body = request.body || {};
    const claimCode = typeof body.claimCode === 'string' ? body.claimCode.trim() : '';
    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim() : '';

    if (!claimCode) {
      return reply.code(400).send({ error: 'claimCode required' });
    }

    // Claim codes are looked up by their stored plaintext (already how the
    // admin claim-code display works) since each court's code must be
    // resolvable without knowing the streamId up front.
    const auth = await prisma.streamAuth.findFirst({
      where: { claimCodePlaintext: claimCode },
    });
    if (!auth) {
      return reply.code(401).send({ error: 'invalid claim code' });
    }

    // latest claim wins: overwrite this court's active write token
    const writeToken = randomToken();
    const writeTokenHash = await argon2.hash(writeToken);

    await prisma.streamAuth.update({
      where: { streamId: auth.streamId },
      data: {
        activeWriteTokenHash: writeTokenHash,
        activeWriterName: deviceName || null,
        claimedAt: new Date(),
      },
    });

    return { writeToken, streamId: auth.streamId };
  });

  // 2) Writer test endpoint (protected)
  fastify.get('/streams/:streamId/writer-test', { preHandler: requireWriter }, async (request) => {
    return { ok: true, writer: request.writer || null };
  });

  // Update team names (rate limited)
  fastify.put('/streams/:streamId/teams', {
    preHandler: requireWriter,
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { homeTeamName, awayTeamName } = request.body || {};

    if (typeof homeTeamName !== 'string' || typeof awayTeamName !== 'string') {
      return reply.code(400).send({ error: 'homeTeamName and awayTeamName required' });
    }

    const { streamId } = request.params;
    const home = homeTeamName.trim();
    const away = awayTeamName.trim();

    const current = await prisma.streamState.findUnique({
      where: { streamId },
      select: { homeTeamName: true, awayTeamName: true },
    });

    const namesChanged = !current || current.homeTeamName !== home || current.awayTeamName !== away;

    const updateData = { homeTeamName: home, awayTeamName: away };

    if (namesChanged) {
      updateData.homeScore = 0;
      updateData.awayScore = 0;
      updateData.lastScoreTeam = null;
      updateData.lastScorer = null;
      updateData.lastAssist = null;
      updateData.lastScoreClockSeconds = null;
    }

    await prisma.streamState.update({ where: { streamId }, data: updateData });

    return { ok: true };
  });

  // Update game clock (rate limited)
  fastify.put('/streams/:streamId/clock', {
    preHandler: requireWriter,
    config: {
      rateLimit: {
        max: 240,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { gameClockSeconds, running } = request.body || {};

    if (typeof gameClockSeconds !== 'number' || gameClockSeconds < 0) {
      return reply.code(400).send({ error: 'valid gameClockSeconds required' });
    }

    if (running !== undefined && typeof running !== 'boolean') {
      return reply.code(400).send({ error: 'running must be a boolean' });
    }

    const { streamId } = request.params;

    const updateData = {
      gameClockSeconds: Math.floor(gameClockSeconds),
    };

    // `running` marks whether the game clock is live-ticking. The clock only
    // starts once (game start) and stops once (game end), so `clockStartedAt`
    // is simply the server timestamp of the most recent start — clients
    // interpolate elapsed time from it while running, and freeze on
    // `gameClockSeconds` once stopped.
    if (running !== undefined) {
      updateData.clockRunning = running;
      updateData.clockStartedAt = running ? new Date() : null;
    }

    await prisma.streamState.update({
      where: { streamId },
      data: updateData,
    });

    return { ok: true };
  });

  // Start/stop a timeout or halftime break (rate limited)
  // Count-up only: the client never sends a duration or which team, just
  // "this kind of break started" / "it ended". The main game clock is
  // untouched by this — it keeps running the whole time.
  fastify.put('/streams/:streamId/break', {
    preHandler: requireWriter,
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { type, active } = request.body || {};

    if (type !== 'timeout' && type !== 'halftime') {
      return reply.code(400).send({ error: 'type must be "timeout" or "halftime"' });
    }

    if (typeof active !== 'boolean') {
      return reply.code(400).send({ error: 'active must be a boolean' });
    }

    const { streamId } = request.params;

    await prisma.streamState.update({
      where: { streamId },
      data: active
        ? { breakActive: true, breakType: type, breakStartedAt: new Date() }
        : { breakActive: false, breakType: null, breakStartedAt: null },
    });

    return { ok: true };
  });

  // Update result (rate limited)
  // POST /streams/:streamId/update_result
  // Body:
  // {
  //   "homeTeamName": "Team A",
  //   "awayTeamName": "Team B",
  //   "HomeScore": "12",
  //   "awayScore": "7",
  //   "lastScore": "teamName" | "home" | "away",
  //   "lastScorer": "PlayerName",
  //   "lastAssist": "PlayerName"
  // }
  fastify.post('/streams/:streamId/update_result', {
    preHandler: requireWriter,
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const body = request.body || {};

    const { streamId } = request.params;

    const updateData = {};

    // All fields optional. Only apply fields that are present.
    if (typeof body.homeTeamName === 'string') {
      const v = body.homeTeamName.trim();
      if (v) updateData.homeTeamName = v;
    }
    if (typeof body.awayTeamName === 'string') {
      const v = body.awayTeamName.trim();
      if (v) updateData.awayTeamName = v;
    }

    const hasHomeScore = body.homeScore !== undefined || body.HomeScore !== undefined;
    if (hasHomeScore) {
      const homeScoreRaw = body.homeScore ?? body.HomeScore;
      const homeScore = Number.parseInt(String(homeScoreRaw ?? ''), 10);
      if (!Number.isFinite(homeScore) || homeScore < 0) {
        return reply.code(400).send({ error: 'valid homeScore/HomeScore required' });
      }
      updateData.homeScore = homeScore;
    }

    const hasAwayScore = body.awayScore !== undefined || body.AwayScore !== undefined;
    if (hasAwayScore) {
      const awayScoreRaw = body.awayScore ?? body.AwayScore;
      const awayScore = Number.parseInt(String(awayScoreRaw ?? ''), 10);
      if (!Number.isFinite(awayScore) || awayScore < 0) {
        return reply.code(400).send({ error: 'valid awayScore required' });
      }
      updateData.awayScore = awayScore;
    }

    if (body.lastScorer !== undefined) {
      const v = typeof body.lastScorer === 'string' ? body.lastScorer.trim() : '';
      updateData.lastScorer = v ? v : null;
    }
    if (body.lastAssist !== undefined) {
      const v = typeof body.lastAssist === 'string' ? body.lastAssist.trim() : '';
      updateData.lastAssist = v ? v : null;
    }

    if (body.lastScore !== undefined) {
      const lastScoreRaw = typeof body.lastScore === 'string' ? body.lastScore.trim() : '';

      // Allow clearing if passed as empty string / null-ish
      if (!lastScoreRaw) {
        updateData.lastScoreTeam = null;
      } else {
        const ls = lastScoreRaw.toLowerCase();
        if (ls === 'home' || ls === 'away') {
          updateData.lastScoreTeam = ls;
        } else {
          // Map team name string -> "home"/"away". Use provided names if present,
          // otherwise fall back to current stored team names.
          let homeName = updateData.homeTeamName;
          let awayName = updateData.awayTeamName;

          if (!homeName || !awayName) {
            const current = await prisma.streamState.findUnique({ where: { streamId } });
            homeName = homeName || current?.homeTeamName || '';
            awayName = awayName || current?.awayTeamName || '';
          }

          if (lastScoreRaw === homeName) {
            updateData.lastScoreTeam = 'home';
          } else if (lastScoreRaw === awayName) {
            updateData.lastScoreTeam = 'away';
          } else {
            return reply.code(400).send({ error: 'lastScore must be "home", "away", homeTeamName, or awayTeamName' });
          }
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { ok: true, noop: true };
    }

    await prisma.streamState.update({
      where: { streamId },
      data: updateData,
    });

    return { ok: true };
  });

  // Record score (rate limited)
  fastify.post('/streams/:streamId/score', {
    preHandler: requireWriter,
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { team, gameClockSeconds, scorer, assist, requestId } = request.body || {};

    if (team !== 'home' && team !== 'away') {
      return reply.code(400).send({ error: 'team must be "home" or "away"' });
    }

    if (typeof gameClockSeconds !== 'number' || gameClockSeconds < 0) {
      return reply.code(400).send({ error: 'valid gameClockSeconds required' });
    }

    if (!requestId || typeof requestId !== 'string') {
      return reply.code(400).send({ error: 'requestId required' });
    }

    const { streamId } = request.params;

    // Idempotency check (scoped to this court's StreamAuth row)
    const auth = await prisma.streamAuth.findUnique({ where: { streamId } });
    if (auth.lastRequestId === requestId) {
      return { ok: true, duplicate: true };
    }

    const updateData = {
      gameClockSeconds: Math.floor(gameClockSeconds),
      lastScoreTeam: team,
      lastScorer: scorer || null,
      lastAssist: assist || null,
      lastScoreClockSeconds: Math.floor(gameClockSeconds),
    };

    if (team === 'home') {
      updateData.homeScore = { increment: 1 };
    } else {
      updateData.awayScore = { increment: 1 };
    }

    await prisma.$transaction([
      prisma.streamState.update({
        where: { streamId },
        data: updateData,
      }),
      prisma.streamAuth.update({
        where: { streamId },
        data: { lastRequestId: requestId },
      }),
    ]);

    return { ok: true };
  });

}

module.exports = writerRoutes;
