const { ensureInitialized } = require('./lib/init');
const publicRoutes = require('./routes/public');

'use strict';

require('dotenv').config();

const fastify = require('fastify')({
  logger: true,
});

fastify.register(publicRoutes);

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