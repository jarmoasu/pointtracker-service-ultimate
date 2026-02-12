'use strict';

function requireAdmin(request, reply) {
  const isAdmin = request.session.get('admin') === true;
  if (!isAdmin) {
    return reply.code(401).send({ error: 'admin auth required' });
  }
}

module.exports = { requireAdmin };