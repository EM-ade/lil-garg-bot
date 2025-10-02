const { getSupabaseClient } = require('../supabaseClient');

function getClient() {
  return getSupabaseClient();
}

async function createBattle(data) {
  const client = getClient();
  const response = await client
    .from('battles')
    .insert(data)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function updateBattle(battleId, updates) {
  const client = getClient();
  const response = await client
    .from('battles')
    .update(updates)
    .eq('id', battleId)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function getBattleById(battleId) {
  const client = getClient();
  const response = await client
    .from('battles')
    .select('*')
    .eq('id', battleId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function listActiveBattlesByGuild(guildId) {
  const client = getClient();
  const response = await client
    .from('battles')
    .select('*')
    .eq('guild_id', guildId)
    .neq('status', 'completed')
    .order('created_at', { ascending: false });

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function addBattleLogEntry(entry) {
  const client = getClient();
  const response = await client
    .from('battle_log_entries')
    .insert(entry)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function getBattleLog(battleId) {
  const client = getClient();
  const response = await client
    .from('battle_log_entries')
    .select('*')
    .eq('battle_id', battleId)
    .order('turn', { ascending: true });

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

module.exports = {
  createBattle,
  updateBattle,
  getBattleById,
  listActiveBattlesByGuild,
  addBattleLogEntry,
  getBattleLog,
};
