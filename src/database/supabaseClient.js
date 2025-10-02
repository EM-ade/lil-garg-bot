const { createClient } = require('@supabase/supabase-js');
const config = require('../config/environment');

let cachedClient = null;

function ensureConfig() {
  if (!config.supabase?.url || !config.supabase?.serviceRoleKey) {
    throw new Error(
      'Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}

function createSupabaseClient(options = {}) {
  ensureConfig();
  const client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...options,
  });
  return client;
}

function getSupabaseClient(options = {}) {
  if (!cachedClient) {
    cachedClient = createSupabaseClient(options);
  }
  return cachedClient;
}

module.exports = {
  getSupabaseClient,
  createSupabaseClient,
};
