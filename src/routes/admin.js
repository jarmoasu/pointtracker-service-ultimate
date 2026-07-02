'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../lib/adminAuth');

function randomClaimCode() {
  // 8 chars, uppercase-friendly
  return crypto.randomBytes(4).toString('hex'); // e.g. "a1b2c3d4"
}

function normalizeClaimCode(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidClaimCode(value) {
  // 8 hex chars to match the generated format from randomClaimCode()
  return /^[a-f0-9]{8}$/.test(value);
}

function normalizeStreamId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidStreamId(value) {
  // Short, URL-friendly slug, e.g. "kentta-1"
  return /^[a-z0-9][a-z0-9-]{1,31}$/.test(value);
}

async function adminRoutes(fastify) {

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

    const auth = await prisma.adminAuth.findUnique({ where: { id: 1 } });
    if (!auth) return reply.code(500).send({ error: 'admin auth state missing' });

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

  // Create a new court (admin only, rate limited)
  fastify.post('/admin/streams', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const body = request.body || {};
    const streamId = normalizeStreamId(body.streamId);
    const label = typeof body.label === 'string' ? body.label.trim() : '';

    if (!isValidStreamId(streamId)) {
      return reply.code(400).send({
        error: 'streamId must be 2-32 chars: lowercase letters, numbers, and dashes, starting with a letter or number',
      });
    }

    const existing = await prisma.streamState.findUnique({ where: { streamId } });
    if (existing) {
      return reply.code(409).send({ error: 'streamId already exists' });
    }

    const claimCode = randomClaimCode();
    const claimCodeHash = await argon2.hash(claimCode);

    await prisma.$transaction([
      prisma.streamState.create({
        data: {
          streamId,
          label: label || streamId,
          homeTeamName: '',
          awayTeamName: '',
          homeScore: 0,
          awayScore: 0,
          gameClockSeconds: 0,
        },
      }),
      prisma.streamAuth.create({
        data: {
          streamId,
          claimCodeHash,
          claimCodePlaintext: claimCode,
        },
      }),
    ]);

    return { streamId, label: label || streamId, claimCode };
  });

  // List all courts (admin only)
  fastify.get('/admin/streams', { preHandler: requireAdmin }, async () => {
    const [states, auths] = await Promise.all([
      prisma.streamState.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.streamAuth.findMany(),
    ]);

    const authByStreamId = new Map(auths.map((a) => [a.streamId, a]));

    return {
      streams: states.map((state) => {
        const auth = authByStreamId.get(state.streamId);
        return {
          streamId: state.streamId,
          label: state.label || state.streamId,
          state,
          writer: auth
            ? {
                activeWriterName: auth.activeWriterName,
                claimedAt: auth.claimedAt,
                hasActiveWriteToken: Boolean(auth.activeWriteTokenHash),
              }
            : null,
        };
      }),
    };
  });

  // Single court detail (admin only)
  fastify.get('/admin/streams/:streamId', { preHandler: requireAdmin }, async (request, reply) => {
    const { streamId } = request.params;

    const [state, auth] = await Promise.all([
      prisma.streamState.findUnique({ where: { streamId } }),
      prisma.streamAuth.findUnique({ where: { streamId } }),
    ]);

    if (!state) {
      return reply.code(404).send({ error: 'unknown stream' });
    }

    return {
      streamId,
      label: state.label || streamId,
      state,
      writer: auth
        ? {
            activeWriterName: auth.activeWriterName,
            claimedAt: auth.claimedAt,
            hasActiveWriteToken: Boolean(auth.activeWriteTokenHash),
          }
        : null,
    };
  });

  // Delete a court (admin only)
  fastify.delete('/admin/streams/:streamId', { preHandler: requireAdmin }, async (request, reply) => {
    const { streamId } = request.params;

    const existing = await prisma.streamState.findUnique({ where: { streamId } });
    if (!existing) {
      return reply.code(404).send({ error: 'unknown stream' });
    }

    await prisma.$transaction([
      prisma.streamState.delete({ where: { streamId } }),
      prisma.streamAuth.deleteMany({ where: { streamId } }),
    ]);

    return { ok: true };
  });

  // Current claim code for a court (admin only)
  fastify.get('/admin/streams/:streamId/claim-code', { preHandler: requireAdmin }, async (request, reply) => {
    const { streamId } = request.params;
    const auth = await prisma.streamAuth.findUnique({ where: { streamId } });
    if (!auth) return reply.code(404).send({ error: 'unknown stream' });
    return { claimCode: auth.claimCodePlaintext || null };
  });

  // Set a court's claim code manually (admin only)
  fastify.post('/admin/streams/:streamId/set-claim', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const { streamId } = request.params;
    const raw = request.body?.claimCode;
    const claimCode = normalizeClaimCode(raw);
    if (!isValidClaimCode(claimCode)) {
      return reply.code(400).send({ error: 'claimCode must be exactly 8 hex characters (0-9, a-f)' });
    }

    const existing = await prisma.streamAuth.findUnique({ where: { streamId } });
    if (!existing) return reply.code(404).send({ error: 'unknown stream' });

    const claimCodeHash = await argon2.hash(claimCode);
    await prisma.streamAuth.update({
      where: { streamId },
      data: { claimCodeHash, claimCodePlaintext: claimCode },
    });

    return { ok: true, claimCode };
  });

  // Rotate a court's claim code (admin only, rate limited)
  fastify.post('/admin/streams/:streamId/rotate-claim', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const { streamId } = request.params;
    const existing = await prisma.streamAuth.findUnique({ where: { streamId } });
    if (!existing) return reply.code(404).send({ error: 'unknown stream' });

    const newCode = randomClaimCode();
    const newHash = await argon2.hash(newCode);

    await prisma.streamAuth.update({
      where: { streamId },
      data: { claimCodeHash: newHash, claimCodePlaintext: newCode },
    });

    return { claimCode: newCode };
  });

  // Reset a court's game state (new game) — admin only, rate limited
  fastify.post('/admin/streams/:streamId/reset', {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const { streamId } = request.params;

    const existing = await prisma.streamState.findUnique({ where: { streamId } });
    if (!existing) return reply.code(404).send({ error: 'unknown stream' });

    await prisma.streamState.update({
      where: { streamId },
      data: {
        homeTeamName: '',
        awayTeamName: '',
        homeScore: 0,
        awayScore: 0,
        gameClockSeconds: 0,
        clockRunning: false,
        clockStartedAt: null,
        lastScoreTeam: null,
        lastScorer: null,
        lastAssist: null,
        lastScoreClockSeconds: null,
      },
    });

    // Also clear idempotency + writer token for a clean start:
    await prisma.streamAuth.update({
      where: { streamId },
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
