// =============================================================================
// LUMEA — Supabase Browser Client (singleton)
// Use this client in all billing hooks — it maintains a single WebSocket
// connection for Realtime subscriptions across the entire app.
// =============================================================================

import { createBrowserClient } from '@supabase/ssr';

// NEXT_PUBLIC_* vars are empty strings at build-time (static prerendering).
// Placeholder URL keeps createBrowserClient from throwing at module evaluation.
// Real values are injected at runtime via Vercel env vars.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Singleton — one client per browser session, one WebSocket for all Realtime channels.
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  // Throw at runtime in the browser if env vars are genuinely missing
  if (typeof window !== 'undefined') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        '[Lumea] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Set them in .env.local or Vercel dashboard.'
      );
    }
  }
  if (!_client) {
    _client = createBrowserClient(supabaseUrl, supabaseKey);
  }
  return _client;
}

export const supabase = getSupabaseClient();
