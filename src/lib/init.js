'use strict';

const argon2 = require('argon2');
const prisma = require('./prisma');

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function ensureInitialized() {
  const streamId = process.env.STREAM_ID || 'main';
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const claimCode = requireEnv('CLAIM_CODE');

  // 1️⃣ Ensure StreamState exists
  await prisma.streamState.upsert({
    where: { streamId },
    update: {},
    create: {
      streamId,
      homeTeamName: '',
      awayTeamName: '',
      homeScore: 0,
      awayScore: 0,
      gameClockSeconds: 0,
      lastScoreTeam: null,
      lastScorer: null,
      lastAssist: null,
      lastScoreClockSeconds: null,
    },
  });

  // 2️⃣ Ensure AuthState exists
  const existing = await prisma.authState.findUnique({
    where: { id: 1 },
  });

  if (!existing) {
    const adminPasswordHash = await argon2.hash(adminPassword);
    const claimCodeHash = await argon2.hash(claimCode);

    await prisma.authState.create({
      data: {
        id: 1,
        adminPasswordHash,
        claimCodeHash,
        activeWriteTokenHash: null,
        activeWriterName: null,
        claimedAt: null,
        lastRequestId: null,
      },
    });
  }

  return { streamId };
}

module.exports = { ensureInitialized };