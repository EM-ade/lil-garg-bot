const { getSupabaseClient } = require('../supabaseClient')

function mapRow(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    guildId: row.guild_id,
    contractAddress: row.contract_address,
    requiredNftCount: row.required_nft_count,
    roleId: row.role_id,
    roleName: row.role_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getClient() {
  return getSupabaseClient()
}

async function listByGuild(guildId) {
  const client = getClient()
  const response = await client
    .from('guild_verification_contracts')
    .select('*')
    .eq('guild_id', guildId)
    .order('required_nft_count', { ascending: true })

  if (response.error) {
    throw response.error
  }

  return (response.data || []).map(mapRow)
}

async function upsertRule({ guildId, contractAddress, requiredNftCount, roleId, roleName }) {
  const client = getClient()
  const payload = {
    guild_id: guildId,
    contract_address: contractAddress,
    required_nft_count: requiredNftCount,
    role_id: roleId,
    role_name: roleName,
  }

  const response = await client
    .from('guild_verification_contracts')
    .upsert(payload, { onConflict: 'guild_id,contract_address,required_nft_count' })
    .select('*')
    .maybeSingle()

  if (response.error) {
    throw response.error
  }

  return mapRow(response.data)
}

async function deleteRule({ guildId, contractAddress, requiredNftCount = null }) {
  const client = getClient()
  const query = client
    .from('guild_verification_contracts')
    .delete()
    .eq('guild_id', guildId)
    .eq('contract_address', contractAddress)

  if (requiredNftCount !== null && requiredNftCount !== undefined) {
    query.eq('required_nft_count', requiredNftCount)
  }

  const response = await query

  if (response.error) {
    throw response.error
  }

  return response.data
}

module.exports = {
  listByGuild,
  upsertRule,
  deleteRule,
}
