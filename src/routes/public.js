'use strict';

const prisma = require('../lib/prisma');

async function publicRoutes(fastify) {

  // Health DB check
  fastify.get('/ready', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true };
  });

  // Public live endpoint
  fastify.get('/live', async (request, reply) => {
    const streamId = process.env.STREAM_ID || 'main';

    const state = await prisma.streamState.findUnique({
      where: { streamId },
      select: {
        homeTeamName: true,
        awayTeamName: true,
        homeScore: true,
        awayScore: true,
        gameClockSeconds: true,
        lastScoreTeam: true,
        lastScorer: true,
        lastAssist: true,
        lastScoreClockSeconds: true,
        updatedAt: true,
      },
    });

    reply.header('Cache-Control', 'no-store');

    if (!state) {
      return {
        homeTeamName: '',
        awayTeamName: '',
        homeScore: 0,
        awayScore: 0,
        gameClockSeconds: 0,
        lastScore: null,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      homeTeamName: state.homeTeamName,
      awayTeamName: state.awayTeamName,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      gameClockSeconds: state.gameClockSeconds,
      lastScore: state.lastScoreTeam
        ? {
            team: state.lastScoreTeam,
            scorer: state.lastScorer,
            assist: state.lastAssist,
            gameClockSeconds: state.lastScoreClockSeconds,
          }
        : null,
      updatedAt: state.updatedAt,
    };
  });
}

module.exports = publicRoutes;