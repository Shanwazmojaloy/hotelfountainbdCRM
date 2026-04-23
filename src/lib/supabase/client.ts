// =============================================================================
// LUMEA — Supabase Browser Client (singleton)
// Use this client in all billing hooks — it maintains a single WebSocket
// connection for Realtime subscriptions across the entire app.
// =============================================================================

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Add them to .env.local'
  );
}

// Singleton — one client per browser session, one WebSocket for all Realtime channels.
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    _client = createBrowserClient(supabaseUrl, supabaseKey);
  }
  return _client;
}

export const supabase = getSupabaseClient();
