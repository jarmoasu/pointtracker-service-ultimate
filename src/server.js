const { ensureInitialized } = require('./lib/init');
const publicRoutes = require('./routes/public');
const writerRoutes = require('./routes/writer');
const cookie = require('@fastify/cookie');
const secureSession = require('@fastify/secure-session');
const adminRoutes = require('./routes/admin');
const path = require('path');
const fastifyStatic = require('@fastify/static');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
  
'use strict';

require('dotenv').config();

const fastify = require('fastify')({
  logger: true,
});

fastify.register(cookie);

// Secure session
fastify.register(secureSession, {
    secret: Buffer.from(process.env.SESSION_SECRET_HEX, 'hex'),
    cookie: {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    },
  });

  // CORS
const allowedOrigins = (process.env.CORS_ORIGINS || '')
.split(',')
.map(s => s.trim())
.filter(Boolean);

// If you don't set CORS_ORIGINS, default to allowing none (safer).
await fastify.register(cors, {
origin: (origin, cb) => {
  // No Origin header = curl/native apps/server-to-server -> allow
  if (!origin) return cb(null, true);

  // Allow if configured
  if (allowedOrigins.includes(origin)) return cb(null, true);

  // Otherwise block
  return cb(new Error('Not allowed by CORS'), false);
},
credentials: true, // admin session cookie
});

// Rate limiting
await fastify.register(rateLimit, {
    global: false, // käytetään per-route
  });

fastify.register(publicRoutes);
fastify.register(writerRoutes);
fastify.register(adminRoutes);

fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/', 
  });

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

fastify.get('/health', async () => {
  return { ok: true };
});

//fastify.get('/__routes', async () => {
//    return fastify.printRoutes();
//  });

  fastify.get('/admin', (request, reply) => {
    reply.sendFile('admin.html');
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