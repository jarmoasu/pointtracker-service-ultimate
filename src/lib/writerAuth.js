'use strict';

const crypto = require('crypto');
const prisma = require('./prisma');
const { isAdminSession } = require('./adminAuth');

// Write tokens are 256-bit random values, so a plain SHA-256 digest is enough;
// a slow password hash (argon2) here would let junk tokens exhaust memory.
function hashWriteToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyWriteToken(storedHash, token) {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = crypto.createHash('sha256').update(token).digest();
  // Legacy argon2 hashes don't decode to 32 bytes and never match; the
  // writer must re-claim to get a token stored in the new format.
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function getBearerToken(request) {
  const authHeader = request.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Writer auth rules (MVP):
 * - Scoped to the court identified by the `streamId` route param.
 * - If admin session is present, allow write endpoints (admin can operate UI without a writer token).
 * - Otherwise require Authorization: Bearer <writeToken> and verify against that
 *   court's StreamAuth.activeWriteTokenHash.
 */
async function requireWriter(request, reply) {
  try {
    const { streamId } = request.params || {};
    if (!streamId) {
      reply.code(400);
      return reply.send({ error: 'streamId required' });
    }

    const auth = await prisma.streamAuth.findUnique({ where: { streamId } });
    if (!auth) {
      reply.code(404);
      return reply.send({ error: 'unknown stream' });
    }

    // Allow admin session to act as writer (for admin UI convenience)
    if (isAdminSession(request.session)) {
      request.writer = { streamId, name: auth.activeWriterName || null, claimedAt: auth.claimedAt || null };
      return;
    }

    const token = getBearerToken(request);
    if (!token) {
      reply.code(401);
      return reply.send({ error: 'missing bearer token' });
    }

    if (!auth.activeWriteTokenHash) {
      reply.code(401);
      return reply.send({ error: 'no active writer token set' });
    }

    const ok = verifyWriteToken(auth.activeWriteTokenHash, token);
    if (!ok) {
      reply.code(401);
      return reply.send({ error: 'invalid bearer token' });
    }

    // Optional: attach writer info for handlers/logging
    request.writer = {
      streamId,
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

module.exports = { requireWriter, hashWriteToken };