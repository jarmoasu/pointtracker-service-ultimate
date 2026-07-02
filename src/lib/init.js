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

  // 1️⃣ Ensure the default court's StreamState exists
  await prisma.streamState.upsert({
    where: { streamId },
    update: {},
    create: {
      streamId,
      label: streamId,
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

  // 2️⃣ Ensure the default court's StreamAuth exists
  const existingStreamAuth = await prisma.streamAuth.findUnique({
    where: { streamId },
  });

  if (!existingStreamAuth) {
    const claimCodeHash = await argon2.hash(claimCode);

    await prisma.streamAuth.create({
      data: {
        streamId,
        claimCodeHash,
        claimCodePlaintext: claimCode,
        activeWriteTokenHash: null,
        activeWriterName: null,
        claimedAt: null,
        lastRequestId: null,
      },
    });
  } else if (!existingStreamAuth.claimCodePlaintext) {
    // Backfill for older rows where plaintext is missing.
    // We cannot recover from hash, so seed from current env value.
    await prisma.streamAuth.update({
      where: { streamId },
      data: { claimCodePlaintext: claimCode },
    });
  }

  // 3️⃣ Ensure the global AdminAuth singleton exists
  const existingAdminAuth = await prisma.adminAuth.findUnique({
    where: { id: 1 },
  });

  if (!existingAdminAuth) {
    const adminPasswordHash = await argon2.hash(adminPassword);

    await prisma.adminAuth.create({
      data: {
        id: 1,
        adminPasswordHash,
      },
    });
  }

  return { streamId };
}

module.exports = { ensureInitialized };