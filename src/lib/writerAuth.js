'use strict';

const argon2 = require('argon2');
const prisma = require('./prisma');

function getBearerToken(request) {
  const authHeader = request.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function requireWriter(request, reply) {
  const token = getBearerToken(request);
  if (!token) {
    return reply.code(401).send({ error: 'missing bearer token' });
  }

  const auth = await prisma.authState.findUnique({ where: { id: 1 } });
  if (!auth || !auth.activeWriteTokenHash) {
    return reply.code(401).send({ error: 'no active writer token set' });
  }

  const ok = await argon2.verify(auth.activeWriteTokenHash, token);
  if (!ok) {
    return reply.code(401).send({ error: 'invalid bearer token' });
  }

  // optional: attach writer info for later use
  request.writer = {
    name: auth.activeWriterName || null,
    claimedAt: auth.claimedAt || null,
  };
}

module.exports = { requireWriter };