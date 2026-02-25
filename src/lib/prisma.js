'use strict';

const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const globalForPrisma = globalThis;

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const adapter = new PrismaBetterSqlite3({ url });

const prisma = globalForPrisma.__prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;