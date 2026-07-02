'use strict';

const prisma = require('../lib/prisma');

async function publicRoutes(fastify) {

  // Health DB check
  fastify.get('/ready', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true };
  });

  // Public live endpoint for a single court
  fastify.get('/streams/:streamId/live', async (request, reply) => {
    const { streamId } = request.params;

    const state = await prisma.streamState.findUnique({
      where: { streamId },
      select: {
        homeTeamName: true,
        awayTeamName: true,
        homeScore: true,
        awayScore: true,
        gameClockSeconds: true,
        clockRunning: true,
        clockStartedAt: true,
        lastScoreTeam: true,
        lastScorer: true,
        lastAssist: true,
        lastScoreClockSeconds: true,
        updatedAt: true,
      },
    });

    reply.header('Cache-Control', 'no-store');

    // Courts are only created explicitly via the admin panel now, so an
    // unknown streamId means a bad link/typo rather than "not started yet".
    if (!state) {
      return reply.code(404).send({ error: 'unknown stream' });
    }

    // Server clock timestamp on every response so clients (e.g. the
    // scoreboard) can correct for their own clock drift when interpolating
    // gameClockSeconds between polls.
    const serverNow = new Date().toISOString();

    return {
      homeTeamName: state.homeTeamName,
      awayTeamName: state.awayTeamName,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      gameClockSeconds: state.gameClockSeconds,
      clockRunning: state.clockRunning,
      clockStartedAt: state.clockStartedAt,
      lastScore: state.lastScoreTeam
        ? {
            team: state.lastScoreTeam,
            scorer: state.lastScorer,
            assist: state.lastAssist,
            gameClockSeconds: state.lastScoreClockSeconds,
          }
        : null,
      updatedAt: state.updatedAt,
      serverNow,
    };
  });
}

module.exports = publicRoutes;
