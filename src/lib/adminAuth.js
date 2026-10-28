'use strict';

// secure-session is stateless: a copied cookie stays valid until the secret
// changes. Store the login time in the session and reject old ones here.
const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function isAdminSession(session) {
  if (!session || session.get('admin') !== true) return false;

  const adminAt = session.get('adminAt');
  if (typeof adminAt !== 'number') return false;

  const age = Date.now() - adminAt;
  return age >= 0 && age < ADMIN_SESSION_MAX_AGE_MS;
}

async function requireAdmin(request, reply) {
  try {
    if (!request.session) {
      reply.code(500);
      return reply.send({ error: 'session not initialized' });
    }

    if (!isAdminSession(request.session)) {
      reply.code(401);
      return reply.send({ error: 'admin auth required' });
    }

    // OK — allow handler to continue
    return;

  } catch (err) {
    request.log?.error(err);
    reply.code(500);
    return reply.send({ error: 'admin middleware failed' });
  }
}

module.exports = { requireAdmin, isAdminSession, ADMIN_SESSION_MAX_AGE_MS };
