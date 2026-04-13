const { createClient } = require('@supabase/supabase-js');
const config = require('../config/environment');

let cachedClient = null;
let supabaseAvailable = true;

function ensureConfig() {
  if (!config.supabase?.url || !config.supabase?.serviceRoleKey) {
    supabaseAvailable = false;
    return false;
  }
  return true;
}

function createSupabaseClient(options = {}) {
  if (!ensureConfig()) {
    return null;
  }
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

function isSupabaseAvailable() {
  return supabaseAvailable && cachedClient !== null;
}

module.exports = {
  getSupabaseClient,
  createSupabaseClient,
  isSupabaseAvailable,
};
