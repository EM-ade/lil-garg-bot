const crypto = require('crypto');
const { getSupabaseClient } = require('../supabaseClient');

function getClient() {
  return getSupabaseClient();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession({
  discordId,
  guildId,
  walletAddress,
  expiresAt,
  message,
  token,
  username,
}) {
  const client = getClient();
  const tokenHash = hashToken(token);

  const response = await client
    .from('verification_sessions')
    .insert({
      discord_id: discordId,
      guild_id: guildId,
      wallet_address: walletAddress,
      token_hash: tokenHash,
      status: 'pending',
      signature_payload: message,
      expires_at: expiresAt,
      username,
    })
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return {
    ...response.data,
    token,
  };
}

async function findByToken(token) {
  const client = getClient();
  const tokenHash = hashToken(token);

  const response = await client
    .from('verification_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function updateSession(id, updates) {
  const client = getClient();
  const response = await client
    .from('verification_sessions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function markVerified(sessionId, { walletAddress, signature }) {
  const client = getClient();
  const response = await client
    .from('verification_sessions')
    .update({
      status: 'verified',
      wallet_address: walletAddress,
      signature,
      verified_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function expireSession(sessionId) {
  return updateSession(sessionId, {
    status: 'expired',
  });
}

async function recordAttempt({ sessionId, resultCode, ipHash, userAgent }) {
  const client = getClient();
  const response = await client
    .from('verification_attempts')
    .insert({
      session_id: sessionId,
      result_code: resultCode,
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

module.exports = {
  hashToken,
  createSession,
  findByToken,
  updateSession,
  markVerified,
  expireSession,
  recordAttempt,
};
