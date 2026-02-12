'use strict';

async function requireAdmin(request, reply) {
  try {
    if (!request.session) {
      reply.code(500);
      return reply.send({ error: 'session not initialized' });
    }

    const isAdmin = request.session.get('admin');

    if (isAdmin !== true) {
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

module.exports = { requireAdmin };