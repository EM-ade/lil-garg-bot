#!/usr/bin/env node

const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { getSupabaseClient } = require('../src/database/supabaseClient');

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    return undefined;
  }
  return value;
}

const batchSize = parseInt(getArgValue('--batch') || '100', 10);
const dryRun = process.argv.includes('--dry-run');
const noClear = process.argv.includes('--no-clear');

async function fetchExistingUserIds(client) {
  const response = await client.from('users').select('id,discord_id,guild_id');
  if (response.error) {
    throw new Error(`Failed to fetch existing users: ${response.error.message}`);
  }

  const map = new Map();
  for (const row of response.data || []) {
    map.set(`${row.discord_id}:${row.guild_id}`, row.id);
  }
  return map;
}

function toISODate(value, fallback = null) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function buildUserRows(mongoUsers, existingIdMap) {
  const userRows = [];
  const nftTokenRows = [];
  const verificationHistoryRows = [];
  const roleRows = [];
  const skipped = [];

  for (const doc of mongoUsers) {
    if (!doc.discordId || !doc.guildId) {
      skipped.push({
        discordId: doc.discordId,
        guildId: doc.guildId,
        reason: 'Missing discordId or guildId',
      });
      continue;
    }

    const key = `${doc.discordId}:${doc.guildId}`;
    const userId = existingIdMap.get(key) || crypto.randomUUID();
    existingIdMap.set(key, userId);

    userRows.push({
      id: userId,
      discord_id: doc.discordId,
      guild_id: doc.guildId,
      username: doc.username || 'Unknown User',
      wallet_address: doc.walletAddress || null,
      is_verified: Boolean(doc.isVerified),
      is_whitelisted: Boolean(doc.isWhitelisted),
      first_joined: toISODate(doc.firstJoined, toISODate(doc.createdAt)),
      last_active: toISODate(doc.lastActive, toISODate(doc.updatedAt)),
      last_verification_check: toISODate(doc.lastVerificationCheck),
      created_at: toISODate(doc.createdAt) || toISODate(new Date()),
      updated_at: toISODate(doc.updatedAt) || toISODate(new Date()),
    });

    if (Array.isArray(doc.nftTokens)) {
      for (const token of doc.nftTokens) {
        nftTokenRows.push({
          id: crypto.randomUUID(),
          user_id: userId,
          mint: token.mint,
          name: token.name,
          image: token.image,
          verified_at: toISODate(token.verifiedAt, toISODate(new Date())),
        });
      }
    }

    if (Array.isArray(doc.verificationHistory)) {
      for (const entry of doc.verificationHistory) {
        verificationHistoryRows.push({
          id: crypto.randomUUID(),
          user_id: userId,
          wallet_address: entry.walletAddress,
          verified_at: toISODate(entry.verifiedAt, toISODate(new Date())),
          nft_count: entry.nftCount ?? 0,
          status: entry.status || 'success',
        });
      }
    }

    if (Array.isArray(doc.roles)) {
      for (const role of doc.roles) {
        roleRows.push({
          id: crypto.randomUUID(),
          user_id: userId,
          role_id: role.roleId,
          role_name: role.roleName,
          assigned_at: toISODate(role.assignedAt, toISODate(new Date())),
        });
      }
    }
  }

  return { userRows, nftTokenRows, verificationHistoryRows, roleRows, skipped };
}

async function batchExecute(client, table, rows, options = {}) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const response = await client.from(table).upsert(chunk, options);
    if (response.error) {
      throw new Error(`Failed to upsert into ${table}: ${response.error.message}`);
    }
  }
}

async function batchDelete(client, table, userIds) {
  const chunkSize = 200;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const response = await client.from(table).delete().in('user_id', chunk);
    if (response.error) {
      throw new Error(`Failed to clear ${table}: ${response.error.message}`);
    }
  }
}

async function migrate() {
  if (!process.env.MONGO_URL) {
    throw new Error('MONGO_URL is not set in the environment.');
  }
  if (!process.env.DB_NAME) {
    throw new Error('DB_NAME is not set in the environment.');
  }

  console.log(`[INFO] Connecting to Supabase...`);
  const supabaseClient = getSupabaseClient();
  const existingIdMap = await fetchExistingUserIds(supabaseClient);

  console.log(`[INFO] Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGO_URL, {
    dbName: process.env.DB_NAME,
  });

  const UserModel = require('../src/database/models/User');
  console.log('[INFO] Fetching users from MongoDB...');
  const mongoUsers = await UserModel.find().lean();
  console.log(`[INFO] Retrieved ${mongoUsers.length} user documents from Mongo.`);

  const { userRows, nftTokenRows, verificationHistoryRows, roleRows } = buildUserRows(
    mongoUsers,
    existingIdMap
  );

  console.log(`[INFO] Prepared rows - users: ${userRows.length}, nft tokens: ${nftTokenRows.length}, verification history: ${verificationHistoryRows.length}, roles: ${roleRows.length}`);

  if (dryRun) {
    console.log('[DRY RUN] No changes have been written.');
    return;
  }

  if (userRows.length === 0) {
    console.log('[INFO] No users to migrate.');
    return;
  }

  console.log('[INFO] Upserting users into Supabase...');
  await batchExecute(supabaseClient, 'users', userRows, { onConflict: 'discord_id,guild_id' });

  const userIds = userRows.map((row) => row.id);

  if (!noClear) {
    console.log('[INFO] Clearing existing child records for migrated users...');
    await batchDelete(supabaseClient, 'user_nft_tokens', userIds);
    await batchDelete(supabaseClient, 'user_verification_history', userIds);
    await batchDelete(supabaseClient, 'user_roles', userIds);
  }

  if (nftTokenRows.length > 0) {
    console.log('[INFO] Inserting user NFT tokens...');
    await batchExecute(supabaseClient, 'user_nft_tokens', nftTokenRows, { onConflict: 'id' });
  }

  if (verificationHistoryRows.length > 0) {
    console.log('[INFO] Inserting user verification history...');
    await batchExecute(supabaseClient, 'user_verification_history', verificationHistoryRows, { onConflict: 'id' });
  }

  if (roleRows.length > 0) {
    console.log('[INFO] Inserting user roles...');
    await batchExecute(supabaseClient, 'user_roles', roleRows, { onConflict: 'id' });
  }

  console.log('[SUCCESS] User migration completed.');
}

migrate()
  .catch((error) => {
    console.error('[ERROR]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
