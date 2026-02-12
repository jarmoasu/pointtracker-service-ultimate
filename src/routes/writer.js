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

  // 1) Claim: claimCode -> writeToken
  fastify.post('/claim', async (request, reply) => {
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
}

module.exports = writerRoutes;