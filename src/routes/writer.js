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

  // 1) Claim: claimCode -> writeToken (rate limited)
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

    const auth = await prisma.authState.findUnique({ where: { id: 1 } });
    if (!auth) {
      // This should not happen if Sprint 5 init ran
      return reply.code(500).send({ error: 'auth state missing' });
    }

    const ok = await argon2.verify(auth.claimCodeHash, claimCode);
    if (!ok) {
      return reply.code(401).send({ error: 'invalid claim code' });
    }

    // latest claim wins: overwrite active write token
    const writeToken = randomToken();
    const writeTokenHash = await argon2.hash(writeToken);

    await prisma.authState.update({
      where: { id: 1 },
      data: {
        activeWriteTokenHash: writeTokenHash,
        activeWriterName: deviceName || null,
        claimedAt: new Date(),
      },
    });

    return { writeToken };
  });

  // 2) Writer test endpoint (protected)
  fastify.get('/writer-test', { preHandler: requireWriter }, async (request) => {
    return { ok: true, writer: request.writer || null };
  });

  // Update team names (rate limited)
  fastify.put('/teams', {
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

    const streamId = process.env.STREAM_ID || 'main';

    await prisma.streamState.update({
      where: { streamId },
      data: {
        homeTeamName: homeTeamName.trim(),
        awayTeamName: awayTeamName.trim(),
      },
    });

    return { ok: true };
  });

  // Update game clock (rate limited)
  fastify.put('/clock', {
    preHandler: requireWriter,
    config: {
      rateLimit: {
        max: 240,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { gameClockSeconds } = request.body || {};

    if (typeof gameClockSeconds !== 'number' || gameClockSeconds < 0) {
      return reply.code(400).send({ error: 'valid gameClockSeconds required' });
    }

    const streamId = process.env.STREAM_ID || 'main';

    await prisma.streamState.update({
      where: { streamId },
      data: {
        gameClockSeconds: Math.floor(gameClockSeconds),
      },
    });

    return { ok: true };
  });

  // Update result (rate limited)
  // POST /update_result
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
  fastify.post('/update_result', {
    preHandler: requireWriter,
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const body = request.body || {};

    const homeTeamName = typeof body.homeTeamName === 'string' ? body.homeTeamName.trim() : '';
    const awayTeamName = typeof body.awayTeamName === 'string' ? body.awayTeamName.trim() : '';
    const homeScoreRaw = body.homeScore ?? body.HomeScore; // accept both
    const awayScoreRaw = body.awayScore ?? body.AwayScore; // accept both
    const lastScoreRaw = typeof body.lastScore === 'string' ? body.lastScore.trim() : '';
    const lastScorer = typeof body.lastScorer === 'string' ? body.lastScorer.trim() : null;
    const lastAssist = typeof body.lastAssist === 'string' ? body.lastAssist.trim() : null;

    if (!homeTeamName || !awayTeamName) {
      return reply.code(400).send({ error: 'homeTeamName and awayTeamName required' });
    }

    const homeScore = Number.parseInt(String(homeScoreRaw ?? ''), 10);
    const awayScore = Number.parseInt(String(awayScoreRaw ?? ''), 10);
    if (!Number.isFinite(homeScore) || homeScore < 0 || !Number.isFinite(awayScore) || awayScore < 0) {
      return reply.code(400).send({ error: 'valid homeScore/HomeScore and awayScore required' });
    }

    let lastScoreTeam = null;
    if (lastScoreRaw) {
      const ls = lastScoreRaw.toLowerCase();
      if (ls === 'home' || ls === 'away') {
        lastScoreTeam = ls;
      } else if (lastScoreRaw === homeTeamName) {
        lastScoreTeam = 'home';
      } else if (lastScoreRaw === awayTeamName) {
        lastScoreTeam = 'away';
      } else {
        return reply.code(400).send({ error: 'lastScore must be "home", "away", homeTeamName, or awayTeamName' });
      }
    }

    const streamId = process.env.STREAM_ID || 'main';

    await prisma.streamState.update({
      where: { streamId },
      data: {
        homeTeamName,
        awayTeamName,
        homeScore,
        awayScore,
        lastScoreTeam,
        lastScorer,
        lastAssist,
      },
    });

    return { ok: true };
  });

  // Record score (rate limited)
  fastify.post('/score', {
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

    const streamId = process.env.STREAM_ID || 'main';

    // Idempotency check
    const auth = await prisma.authState.findUnique({ where: { id: 1 } });
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
      prisma.authState.update({
        where: { id: 1 },
        data: { lastRequestId: requestId },
      }),
    ]);

    return { ok: true };
  });

}

module.exports = writerRoutes;