const crypto = require('crypto');
const { getSupabaseClient } = require('../supabaseClient');

function getClient() {
  return getSupabaseClient();
}

async function upsertUser(data) {
  const client = getClient();
  const response = await client
    .from('users')
    .upsert(data, { onConflict: 'discord_id,guild_id' })
    .select()
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function findUserByDiscordAndGuild(discordId, guildId) {
  const client = getClient();
  const response = await client
    .from('users')
    .select('*')
    .eq('discord_id', discordId)
    .eq('guild_id', guildId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function listVerifiedUsersByGuild(guildId) {
  const client = getClient();
  const response = await client
    .from('users')
    .select('*')
    .eq('guild_id', guildId)
    .eq('is_verified', true)
    .order('updated_at', { ascending: false });

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function listVerifiedUsers() {
  const client = getClient();
  const response = await client
    .from('users')
    .select('*')
    .eq('is_verified', true);

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function findUserByWalletAddress(guildId, walletAddress) {
  const client = getClient();
  const response = await client
    .from('users')
    .select('*')
    .eq('guild_id', guildId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function upsertVerificationStatus({
  discordId,
  guildId,
  username,
  walletAddress,
  isVerified,
  lastVerified,
}) {
  const client = getClient();
  const timestamp = lastVerified || new Date().toISOString();

  const payload = {
    discord_id: discordId,
    guild_id: guildId,
    username: username ?? null,
    wallet_address: walletAddress ?? null,
    is_verified: isVerified,
    last_verification_check: timestamp,
    updated_at: timestamp,
  };

  const response = await client
    .from('users')
    .upsert(payload, { onConflict: 'discord_id,guild_id' })
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function replaceUserTokensByUserId(userId, tokens = []) {
  const client = getClient();

  const deleteResponse = await client
    .from('user_nft_tokens')
    .delete()
    .eq('user_id', userId);

  if (deleteResponse.error) {
    throw deleteResponse.error;
  }

  if (!tokens || tokens.length === 0) {
    return;
  }

  const rows = tokens.map((token) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    mint: token.mint || null,
    name: token.name || null,
    image: token.image || null,
    verified_at: token.verifiedAt || token.verified_at || new Date().toISOString(),
  }));

  const insertResponse = await client.from('user_nft_tokens').insert(rows);
  if (insertResponse.error) {
    throw insertResponse.error;
  }
}

async function addVerificationHistoryByUserId(userId, entry) {
  const client = getClient();
  const payload = {
    id: crypto.randomUUID(),
    user_id: userId,
    wallet_address: entry.walletAddress || entry.wallet_address || null,
    nft_count: entry.nftCount ?? entry.nft_count ?? 0,
    status: entry.status || 'success',
    verified_at: entry.verifiedAt || entry.verified_at || new Date().toISOString(),
  };

  const response = await client
    .from('user_verification_history')
    .insert(payload);

  if (response.error) {
    throw response.error;
  }
}

async function addUserRole(userId, { roleId, roleName, assignedAt }) {
  const client = getClient();
  const payload = {
    id: crypto.randomUUID(),
    user_id: userId,
    role_id: roleId,
    role_name: roleName,
    assigned_at: assignedAt || new Date().toISOString(),
  };

  const response = await client
    .from('user_roles')
    .upsert(payload, { onConflict: 'user_id,role_id' })
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function removeUserRole(userId, roleId) {
  const client = getClient();
  const response = await client
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);

  if (response.error) {
    throw response.error;
  }
}

async function ensureUserRecord({ discordId, guildId, username = null }) {
  const existing = await findUserByDiscordAndGuild(discordId, guildId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const response = await upsertUser({
    id: crypto.randomUUID(),
    discord_id: discordId,
    guild_id: guildId,
    username,
    is_verified: false,
    created_at: now,
    updated_at: now,
  });

  return response;
}

async function fetchUserDetailsByDiscordAndGuild(discordId, guildId) {
  const client = getClient();
  const response = await client
    .from('users')
    .select('*, user_nft_tokens(*), user_verification_history(*), user_roles(*)')
    .eq('discord_id', discordId)
    .eq('guild_id', guildId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function listUsersByGuild(guildId) {
  const client = getClient();
  const response = await client
    .from('users')
    .select('*')
    .eq('guild_id', guildId);

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function countVerifiedUsers() {
  const client = getClient();
  const response = await client
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('is_verified', true);

  if (response.error) {
    throw response.error;
  }

  return response.count || 0;
}

module.exports = {
  upsertUser,
  findUserByDiscordAndGuild,
  listVerifiedUsersByGuild,
  listVerifiedUsers,
  findUserByWalletAddress,
  upsertVerificationStatus,
  replaceUserTokensByUserId,
  addVerificationHistoryByUserId,
  addUserRole,
  removeUserRole,
  ensureUserRecord,
  fetchUserDetailsByDiscordAndGuild,
  listUsersByGuild,
  countVerifiedUsers,
};
