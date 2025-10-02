const { getSupabaseClient } = require('../supabaseClient');

function getClient() {
  return getSupabaseClient();
}

async function createTicket(data) {
  const client = getClient();
  const response = await client
    .from('tickets')
    .insert(data)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function updateTicket(ticketId, updates) {
  const client = getClient();
  const response = await client
    .from('tickets')
    .update(updates)
    .eq('id', ticketId)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function getTicketById(ticketId) {
  const client = getClient();
  const response = await client
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function listTicketsByGuild(guildId, filters = {}) {
  const client = getClient();
  let query = client.from('tickets').select('*').eq('guild_id', guildId);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  const response = await query.order('created_at', { ascending: false });

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function addTicketMessage(data) {
  const client = getClient();
  const response = await client
    .from('ticket_messages')
    .insert(data)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function listTicketMessages(ticketId) {
  const client = getClient();
  const response = await client
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

module.exports = {
  createTicket,
  updateTicket,
  getTicketById,
  listTicketsByGuild,
  addTicketMessage,
  listTicketMessages,
};
