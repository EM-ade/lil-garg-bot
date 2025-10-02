const { getSupabaseClient } = require('../supabaseClient');

function getClient() {
  return getSupabaseClient();
}

async function createPet(data) {
  const client = getClient();
  const response = await client
    .from('pets')
    .insert(data)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function getPetsByUserId(userId) {
  const client = getClient();
  const response = await client
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function updatePet(petId, updates) {
  const client = getClient();
  const response = await client
    .from('pets')
    .update(updates)
    .eq('id', petId)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

async function deletePet(petId) {
  const client = getClient();
  const response = await client
    .from('pets')
    .delete({ returning: 'representation' })
    .eq('id', petId)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

module.exports = {
  createPet,
  getPetsByUserId,
  updatePet,
  deletePet,
};
