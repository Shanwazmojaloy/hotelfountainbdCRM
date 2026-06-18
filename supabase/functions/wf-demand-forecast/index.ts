// ─────────────────────────────────────────────────────────────────────────────
// Hotel Fountain — Demand Forecast API (read-only)
// Returns a deterministic 14-day occupancy forecast + a prospecting plan derived
// from current reservations. No writes. Used by automation and reporting.
//   GET/POST  ?days=14   → { ok, forecast, plan }
// ─────────────────────────────────────────────────────────────────────────────
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeForecast, planProspecting, dhakaToday } from './forecast.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const start = Date.now();
  try {
    const url = new URL(req.url);
    let days = parseInt(url.searchParams.get('days') || '14', 10);
    if (!Number.isFinite(days) || days < 1) days = 14;
    days = Math.min(days, 60); // hard cap

    const sb = createClient(SB_URL, SB_KEY);

    // Live room count (don't hardcode — property may add rooms).
    const { count: roomCount } = await sb
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT);
    const totalRooms = roomCount ?? 0;

    // Only pull occupancy-relevant reservations whose window can intersect the horizon.
    const today = dhakaToday();
    const horizonEnd = new Date(new Date(today + 'T00:00:00Z').getTime() + days * 86400000)
      .toISOString().slice(0, 10);
    const { data: reservations, error } = await sb
      .from('reservations')
      .select('check_in,check_out,room_ids,status')
      .eq('tenant_id', TENANT)
      .in('status', ['RESERVED', 'CHECKED_IN', 'CONFIRMED', 'PENDING'])
      .lt('check_in', horizonEnd)   // starts before horizon ends
      .gt('check_out', today);      // ends after today
    if (error) throw new Error(error.message);

    const forecast = computeForecast(reservations || [], totalRooms, days, today);
    const plan = planProspecting(forecast);

    return new Response(JSON.stringify({
      ok: true,
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      forecast,
      plan,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
