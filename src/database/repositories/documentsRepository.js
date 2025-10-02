const { getSupabaseClient } = require('../supabaseClient');

function getClient() {
  return getSupabaseClient();
}

async function upsertDocument(data) {
  const client = getClient();
  const response = await client
    .from('documents')
    .upsert(data, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function getDocumentById(id) {
  const client = getClient();
  const response = await client
    .from('documents')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function listDocuments(filters = {}) {
  const client = getClient();
  let query = client.from('documents').select('*');

  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (typeof filters.isActive === 'boolean') {
    query = query.eq('is_active', filters.isActive);
  }

  const response = await query.order('updated_at', { ascending: false });
  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function deleteDocument(id) {
  const client = getClient();
  const response = await client
    .from('documents')
    .delete({ returning: 'representation' })
    .eq('id', id)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

module.exports = {
  upsertDocument,
  getDocumentById,
  listDocuments,
  deleteDocument,
};
