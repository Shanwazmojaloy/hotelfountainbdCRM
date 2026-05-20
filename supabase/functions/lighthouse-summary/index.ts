/**
 * lighthouse-summary — Supabase Edge Function
 *
 * Aggregates yesterday's hotel state per tenant, calls Claude Haiku for a
 * compact narrative, and upserts into public.lighthouse_summaries.
 *
 * Trigger: Vercel cron → POST /api/agents/lighthouse-tick (which forwards
 * here with service auth) OR direct pg_cron via supabase.functions.invoke.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Reservation-centric: revenue is reduced from `transactions` filtered by
 * reservation_id; orphan transactions (NULL reservation_id) are counted
 * separately and surfaced as `orphan_folios_count`.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET   = Deno.env.get('CRON_SECRET')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Mirror of `_isRealPayment` from crm-src.jsx (module-scope helper).
// POSITIVE-MATCH ONLY — exclusion-only filters let charge types (Stay
// Extension, Room Service, Food & Bev) pass through as revenue. See the
// 2026-05-15 TALHA JUBAYER incident in MEMORY_LOG / coding_conventions.
// Known payment strings: Room Payment (Cash), Room Payment (Bank Transfer),
// Advance Payment, Final Settlement, Deposit, BKash. Any new payment label
// MUST contain one of: payment | settlement | advance | deposit | bkash | bank transfer.
function _isRealPayment(t: { type?: string | null }): boolean {
  const v = t?.type ?? '';
  if (!v) return false;
  if (/balance\s*carried\s*forward/i.test(v)) return false;
  return /payment|settlement|advance|deposit|bkash|bank\s*transfer/i.test(v);
}

// Dhaka = UTC+6. Returns the calendar day in Dhaka and its UTC window.
function dhakaToday() {
  const nowUtc = new Date();
  const dhakaMs = nowUtc.getTime() + 6 * 60 * 60 * 1000;
  const today   = new Date(dhakaMs).toISOString().split('T')[0];
  const startUtc = new Date(`${today}T00:00:00+06:00`).toISOString();
  const endUtc   = new Date(`${today}T23:59:59.999+06:00`).toISOString();
  const monthStartUtc = new Date(`${today.slice(0,7)}-01T00:00:00+06:00`).toISOString();
  return { today, startUtc, endUtc, monthStartUtc };
}

interface Anchor {
  occupancy_pct: number;
  rooms_occupied: number;
  rooms_total: number;
  arrivals_today: number;
  departures_today: number;
  in_house_guests: number;
  vip_in_house: number;
  revenue_today_bdt: number;
  revenue_mtd_bdt: number;
  adr_bdt: number;
  unpaid_balance_bdt: number;
  orphan_folios_count: number;
  blocked_rooms: number;
  pending_leads: number;
}

async function buildAnchor(tenant_id: string): Promise<Anchor> {
  const { today, startUtc, endUtc, monthStartUtc } = dhakaToday();

  // Rooms total + blocked
  const { data: rooms } = await supabase
    .from('rooms')
    .select('room_number, status')
    .eq('tenant_id', tenant_id);

  const rooms_total   = rooms?.length ?? 0;
  const blocked_rooms = rooms?.filter(r => r.status === 'BLOCKED').length ?? 0;

  // Today's reservations
  const { data: resvs } = await supabase
    .from('reservations')
    .select('id, status, check_in, check_out, vip, guest_id, total_amount')
    .eq('tenant_id', tenant_id)
    .or(`check_in.eq.${today},check_out.eq.${today},and(check_in.lte.${today},check_out.gt.${today})`);

  const arrivals_today   = resvs?.filter(r => r.check_in  === today).length ?? 0;
  const departures_today = resvs?.filter(r => r.check_out === today).length ?? 0;
  const inHouse          = resvs?.filter(r =>
    r.check_in <= today && r.check_out > today && r.status === 'CHECKED_IN'
  ) ?? [];
  const in_house_guests  = inHouse.length;
  const vip_in_house     = inHouse.filter(r => r.vip === true).length;
  const rooms_occupied   = in_house_guests;
  const occupancy_pct    = rooms_total > 0
    ? Math.round((rooms_occupied / rooms_total) * 10000) / 100
    : 0;

  // Revenue: reduce transactions filtered by reservation_id (never cached totals)
  const { data: txToday } = await supabase
    .from('transactions')
    .select('amount, reservation_id, type')
    .eq('tenant_id', tenant_id)
    .gte('created_at', startUtc)
    .lte('created_at', endUtc);

  const revenue_today_bdt = (txToday ?? [])
    .filter(t => t.reservation_id && _isRealPayment(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  // Orphan = real payment without a reservation_id link.
  // BCF / FS rows without a reservation_id are bookkeeping artefacts, not orphans.
  const orphan_folios_count = (txToday ?? [])
    .filter(t => !t.reservation_id && _isRealPayment(t)).length;

  const { data: txMtd } = await supabase
    .from('transactions')
    .select('amount, reservation_id, type')
    .eq('tenant_id', tenant_id)
    .gte('created_at', monthStartUtc)
    .lte('created_at', endUtc);

  const revenue_mtd_bdt = (txMtd ?? [])
    .filter(t => t.reservation_id && _isRealPayment(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  // ADR: revenue today / occupied rooms (guard divide-by-zero)
  const adr_bdt = rooms_occupied > 0
    ? Math.round((revenue_today_bdt / rooms_occupied) * 100) / 100
    : 0;

  // Unpaid balance across open folios — reduce by reservation_id
  const { data: openResvs } = await supabase
    .from('reservations')
    .select('id, total_amount')
    .eq('tenant_id', tenant_id)
    .in('status', ['CONFIRMED', 'CHECKED_IN']);

  let unpaid_balance_bdt = 0;
  if (openResvs && openResvs.length) {
    const ids = openResvs.map(r => r.id);
    const { data: paid } = await supabase
      .from('transactions')
      .select('reservation_id, amount, type')
      .eq('tenant_id', tenant_id)
      .in('reservation_id', ids);

    // Filter in JS using exclusion pattern, not SQL whitelist (handles any
    // new payment type without code changes).
    const paidMap = new Map<string, number>();
    (paid ?? []).forEach(p => {
      if (!p.reservation_id || !_isRealPayment(p)) return;
      paidMap.set(p.reservation_id, (paidMap.get(p.reservation_id) ?? 0) + Number(p.amount || 0));
    });
    unpaid_balance_bdt = openResvs.reduce(
      (s, r) => s + Math.max(0, Number(r.total_amount || 0) - (paidMap.get(r.id) ?? 0)),
      0,
    );
  }

  // Pending leads (B2B / corporate)
  const { count: pending_leads } = await supabase
    .from('corporate_leads')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('status', 'pending');

  return {
    occupancy_pct,
    rooms_occupied,
    rooms_total,
    arrivals_today,
    departures_today,
    in_house_guests,
    vip_in_house,
    revenue_today_bdt: Math.round(revenue_today_bdt * 100) / 100,
    revenue_mtd_bdt:   Math.round(revenue_mtd_bdt   * 100) / 100,
    adr_bdt,
    unpaid_balance_bdt: Math.round(unpaid_balance_bdt * 100) / 100,
    orphan_folios_count,
    blocked_rooms,
    pending_leads: pending_leads ?? 0,
  };
}

async function synthesise(a: Anchor, hotel_name: string): Promise<string> {
  const prompt = `You are Lumea's overnight ops analyst for ${hotel_name}. Convert these structured anchors into a 4–6 line markdown brief. Use ৳ for currency. No fluff, no greeting. Lead with the most operationally critical item (orphans, unpaid balance, blocked rooms) if present.

Anchors:
- Occupancy: ${a.occupancy_pct}% (${a.rooms_occupied}/${a.rooms_total} rooms)
- In-house guests: ${a.in_house_guests} (${a.vip_in_house} VIP)
- Today: ${a.arrivals_today} arrivals, ${a.departures_today} departures
- Revenue today: ৳${a.revenue_today_bdt.toLocaleString()}
- Revenue MTD: ৳${a.revenue_mtd_bdt.toLocaleString()}
- ADR: ৳${a.adr_bdt.toLocaleString()}
- Open unpaid balance: ৳${a.unpaid_balance_bdt.toLocaleString()}
- Orphan transactions today: ${a.orphan_folios_count}
- Blocked rooms: ${a.blocked_rooms}
- Pending B2B leads: ${a.pending_leads}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error('Haiku error', await res.text());
    return ''; // Non-fatal — structured anchors still get cached
  }
  const j = await res.json();
  return j?.content?.[0]?.text?.trim() ?? '';
}

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { today } = dhakaToday();

  const { data: tenants, error: tErr } = await supabase
    .from('tenants')
    .select('id, hotel_name')
    .eq('is_active', true);

  if (tErr) return new Response(JSON.stringify({ error: tErr.message }), { status: 500 });

  const results: Array<{ tenant_id: string; ok: boolean; error?: string }> = [];

  for (const t of tenants ?? []) {
    try {
      const anchor = await buildAnchor(t.id);
      const narrative = await synthesise(anchor, t.hotel_name);

      const { error: upErr } = await supabase
        .from('lighthouse_summaries')
        .upsert({
          tenant_id: t.id,
          snapshot_date: today,
          ...anchor,
          narrative_md: narrative,
          payload: { source: 'lighthouse-summary', version: 1 },
        }, { onConflict: 'tenant_id,snapshot_date' });

      if (upErr) throw upErr;
      results.push({ tenant_id: t.id, ok: true });
    } catch (e) {
      results.push({ tenant_id: t.id, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ date: today, results }), {
    headers: { 'content-type': 'application/json' },
  });
});
