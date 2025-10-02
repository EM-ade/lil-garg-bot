const { getSupabaseClient } = require('../supabaseClient');

function getClient() {
  return getSupabaseClient();
}

async function upsertBotConfig(data) {
  const client = getClient();
  const response = await client
    .from('bot_configs')
    .upsert(data, { onConflict: 'guild_id' })
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function getBotConfigByGuildId(guildId) {
  const client = getClient();
  const response = await client
    .from('bot_configs')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function updateBotConfigStats(guildId, stats) {
  const client = getClient();
  const response = await client
    .from('bot_configs')
    .update({ stats })
    .eq('guild_id', guildId)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

module.exports = {
  upsertBotConfig,
  getBotConfigByGuildId,
  updateBotConfigStats,
};
