'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../lib/adminAuth');

function randomClaimCode() {
  // 8 chars, uppercase-friendly
  return crypto.randomBytes(4).toString('hex'); // e.g. "a1b2c3d4"
}

async function adminRoutes(fastify) {
  // Small cache for public state endpoint to reduce DB load under bursts
  let publicStateCache = null;
  let publicStateCacheAt = 0;
  const PUBLIC_STATE_CACHE_TTL_MS = 1000;

  // Login (no session required)
  fastify.post('/admin/login', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const { password } = request.body || {};
    if (typeof password !== 'string' || !password.trim()) {
      return reply.code(400).send({ error: 'password required' });
    }

    const auth = await prisma.authState.findUnique({ where: { id: 1 } });
    if (!auth) return reply.code(500).send({ error: 'auth state missing' });

    // Compare to stored hash (created in Sprint 5 init)
    const ok = await argon2.verify(auth.adminPasswordHash, password);
    if (!ok) return reply.code(401).send({ error: 'invalid password' });

    request.session.set('admin', true);
    return { ok: true };
  });

  // Ping endpoint (protected)
  fastify.get('/admin/ping', { preHandler: requireAdmin }, async () => {
    return { ok: true };
  });

  // Ping endpoint (open - just for testing)
  fastify.get('/admin/ping-open', async (request, reply) => {
    return reply.send({ ok: true });
  });

  // Logout
  fastify.post('/admin/logout', { preHandler: requireAdmin }, async (request) => {
    request.session.delete();
    return { ok: true };
  });

  // View state (public, rate limited)
  fastify.get('/admin/state', {
    config: {
      rateLimit: { max: 60, timeWindow: '1 minute' },
    },
  }, async () => {
    const now = Date.now();
    if (publicStateCache && (now - publicStateCacheAt) < PUBLIC_STATE_CACHE_TTL_MS) {
      return publicStateCache;
    }

    const streamId = process.env.STREAM_ID || 'main';

    const [state, auth] = await Promise.all([
      prisma.streamState.findUnique({ where: { streamId } }),
      prisma.authState.findUnique({ where: { id: 1 } }),
    ]);

    const payload = {
      streamId,
      state,
      writer: auth
        ? {
            activeWriterName: auth.activeWriterName,
            claimedAt: auth.claimedAt,
            hasActiveWriteToken: Boolean(auth.activeWriteTokenHash),
          }
        : null,
    };

    publicStateCache = payload;
    publicStateCacheAt = now;
    return payload;
  });

  // Rotate claim code (rate limited)
  fastify.post('/admin/rotate-claim', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async () => {
    const newCode = randomClaimCode();
    const newHash = await argon2.hash(newCode);

    await prisma.authState.update({
      where: { id: 1 },
      data: { claimCodeHash: newHash },
    });

    // Return the new code so admin can share it (or show QR in Sprint 9)
    return { claimCode: newCode };
  });

  // Reset stream state (new game)
  fastify.post('/admin/reset', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async () => {
    const streamId = process.env.STREAM_ID || 'main';

    await prisma.streamState.update({
      where: { streamId },
      data: {
        homeTeamName: '',
        awayTeamName: '',
        homeScore: 0,
        awayScore: 0,
        gameClockSeconds: 0,
        lastScoreTeam: null,
        lastScorer: null,
        lastAssist: null,
        lastScoreClockSeconds: null,
      },
    });

    // Also clear idempotency + writer token if you want clean start:
    await prisma.authState.update({
      where: { id: 1 },
      data: {
        lastRequestId: null,
        activeWriteTokenHash: null,
        activeWriterName: null,
        claimedAt: null,
      },
    });

    return { ok: true };
  });
}

module.exports = adminRoutes;