import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && (serviceKey || anonKey));
}

let client: SupabaseClient | null = null;

/** Server client. Prefers the service role so RLS does not block the API. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!url) {
    throw new Error('SUPABASE_URL is not set');
  }
  const key = serviceKey || anonKey;
  if (!key) {
    throw new Error('Set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY');
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  return client;
}
