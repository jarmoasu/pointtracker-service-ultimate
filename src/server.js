const { ensureInitialized } = require('./lib/init');
const publicRoutes = require('./routes/public');
const writerRoutes = require('./routes/writer');
const cookie = require('@fastify/cookie');
const secureSession = require('@fastify/secure-session');
const adminRoutes = require('./routes/admin');
  
'use strict';

require('dotenv').config();

const fastify = require('fastify')({
  logger: true,
});

fastify.register(cookie);
fastify.register(secureSession, {
  secret: Buffer.from(process.env.SESSION_SECRET, 'utf8'),
  cookie: {
    path: '/',
    httpOnly: true,
    secure: true,   // Render uses HTTPS
    sameSite: 'lax',
  },
});

fastify.register(publicRoutes);
fastify.register(writerRoutes);
fastify.register(adminRoutes);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

fastify.get('/health', async () => {
  return { ok: true };
});

async function start() {
    try {
      const { streamId } = await ensureInitialized();
      fastify.log.info({ streamId }, 'stream initialized');
  
      await fastify.listen({ port: PORT, host: HOST });
      fastify.log.info({ port: PORT, host: HOST }, 'server started');
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  }

start();