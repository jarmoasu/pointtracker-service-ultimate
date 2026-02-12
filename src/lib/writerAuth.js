'use strict';

const argon2 = require('argon2');
const prisma = require('./prisma');

function getBearerToken(request) {
  const authHeader = request.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Writer auth rules (MVP):
 * - If admin session is present, allow write endpoints (admin can operate UI without a writer token).
 * - Otherwise require Authorization: Bearer <writeToken> and verify against AuthState.activeWriteTokenHash.
 */
async function requireWriter(request, reply) {
  try {
    // Allow admin session to act as writer (for admin UI convenience)
    if (request.session && request.session.get('admin') === true) {
      return;
    }

    const token = getBearerToken(request);
    if (!token) {
      reply.code(401);
      return reply.send({ error: 'missing bearer token' });
    }

    const auth = await prisma.authState.findUnique({ where: { id: 1 } });

    if (!auth || !auth.activeWriteTokenHash) {
      reply.code(401);
      return reply.send({ error: 'no active writer token set' });
    }

    const ok = await argon2.verify(auth.activeWriteTokenHash, token);
    if (!ok) {
      reply.code(401);
      return reply.send({ error: 'invalid bearer token' });
    }

    // Optional: attach writer info for handlers/logging
    request.writer = {
      name: auth.activeWriterName || null,
      claimedAt: auth.claimedAt || null,
    };

    return;
  } catch (err) {
    request.log?.error(err, 'requireWriter failed');
    reply.code(500);
    return reply.send({ error: 'writer auth error' });
  }
}

module.exports = { requireWriter };