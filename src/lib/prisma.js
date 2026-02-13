'use strict';

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const globalForPrisma = globalThis;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });

const prisma = globalForPrisma.__prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;