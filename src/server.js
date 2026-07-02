'use strict';

require('dotenv').config();

const path = require('path');

const fastify = require('fastify')({ logger: true });

const cookie = require('@fastify/cookie');
const secureSession = require('@fastify/secure-session');
const fastifyStatic = require('@fastify/static');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');

const { ensureInitialized } = require('./lib/init');
const publicRoutes = require('./routes/public');
const writerRoutes = require('./routes/writer');
const adminRoutes = require('./routes/admin');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

function parseAllowedOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function start() {
  try {
    // --- CORS (async plugin) ---
    const allowedOrigins = parseAllowedOrigins();

    await fastify.register(cors, {
      origin: (origin, cb) => {
        // No Origin header (curl/native/server-to-server) => allow
        if (!origin) return cb(null, true);

        // No allowlist configured => allow all origins.
        // Public endpoints (/live, /health, /ready) are read-only and intentionally open.
        // Write and admin endpoints are protected by Bearer tokens and session cookies,
        // so CORS is not the security boundary for those.
        if (allowedOrigins.length === 0) return cb(null, true);

        // Allowlist configured => restrict to listed origins only
        if (allowedOrigins.includes(origin)) return cb(null, true);

        return cb(new Error('Not allowed by CORS'), false);
      },
      credentials: true, // needed for admin session cookie in browser
    });

    // --- Cookies + Admin session ---
    fastify.register(cookie);

    fastify.register(secureSession, {
      secret: Buffer.from(process.env.SESSION_SECRET_HEX || '', 'hex'),
      cookie: {
        path: '/',
        httpOnly: true,
        secure: true, // Render is HTTPS
        sameSite: 'lax',
      },
    });

    // --- Rate limiting (per-route) ---
    await fastify.register(rateLimit, { global: false });

    // --- Static files (admin UI) ---
    fastify.register(fastifyStatic, {
      root: path.join(__dirname, 'public'),
      prefix: '/',
    });

    // --- Basic endpoints ---
    fastify.get('/health', async () => ({ ok: true }));

    fastify.get('/admin', (request, reply) => {
      return reply.sendFile('admin.html');
    });

    // --- API routes ---
    fastify.register(publicRoutes);
    fastify.register(writerRoutes);
    fastify.register(adminRoutes);

    // --- DB init (creates StreamState/AuthState if missing) ---
    const { streamId } = await ensureInitialized();
    fastify.log.info({ streamId }, 'stream initialized');

    // --- Start server ---
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info({ port: PORT, host: HOST }, 'server started');
  } catch (err) {
    fastify.log.error(err, 'server failed to start');
    process.exit(1);
  }
}

start();