// =============================================================================
// LUMEA — process-checkout Edge Function
// Runtime: Deno (Supabase Edge Functions)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://hotelfountainbd-crm.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Max-Age':       '86400',
  };
}

interface CheckoutRequest {
  reservation_id:   string;
  actual_checkout?: string;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  // 1. Authenticate the caller
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid Authorization header' }),
      { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
  const callerJwt = authHeader.replace('Bearer ', '');

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(callerJwt);
  if (authErr || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized — invalid session token' }),
      { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Parse and validate request body
  let body: CheckoutRequest;
  try {
    body = await req.json() as CheckoutRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  const { reservation_id, actual_checkout } = body;

  if (!reservation_id || typeof reservation_id !== 'string') {
    return new Response(
      JSON.stringify({ error: 'reservation_id is required (UUID string)' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(reservation_id)) {
    return new Response(
      JSON.stringify({ error: 'reservation_id must be a valid UUID' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  let checkoutTimestamp: string | null = null;
  if (actual_checkout) {
    const ts = new Date(actual_checkout);
    if (isNaN(ts.getTime())) {
      return new Response(
        JSON.stringify({ error: 'actual_checkout must be a valid ISO 8601 timestamp' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }
    checkoutTimestamp = ts.toISOString();
  }

  // 3. Call process_checkout() via the service-role client
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const rpcParams: Record<string, string> = {
    p_reservation_id:  reservation_id,
    p_checked_out_by:  user.id,
  };
  if (checkoutTimestamp) {
    rpcParams['p_actual_checkout'] = checkoutTimestamp;
  }

  const { data: result, error: rpcErr } = await serviceClient
    .rpc('process_checkout', rpcParams);

  if (rpcErr) {
    const status = rpcErr.message?.includes('not found') ? 404
                 : rpcErr.message?.includes('must be CHECKED_IN') ? 409
                 : 500;

    console.error('[process-checkout] RPC error:', rpcErr.message);
    return new Response(
      JSON.stringify({ error: rpcErr.message }),
      { status, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Return the checkout summary
  console.info(
    `[process-checkout] ✓ ${reservation_id} checked out by ${user.id}`,
    `invoice=${result?.invoice_number}`,
    `balance_due=${result?.balance_due_bdt}`
  );

  return new Response(
    JSON.stringify(result),
    {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    }
  );
});
