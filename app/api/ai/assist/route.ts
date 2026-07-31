/**
 * /api/ai/assist — Lumea AI Operations Assistant
 *
 * Two-layer context architecture:
 *   1. Lighthouse  → v_lighthouse_latest (global anchor, refreshed nightly)
 *   2. Local       → rows scoped to { reservation_id | guest_id | room_number }
 *
 * Reservation-centric: balance due is reduced from raw `transactions`
 * filtered by reservation_id. No cached totals.
 *
 * POST body:
 *   {
 *     "scope": { "reservation_id"?: uuid, "guest_id"?: uuid, "room_number"?: string },
 *     "user_request": string,
 *     "tenant_id"?: uuid              // defaults to NEXT_PUBLIC_TENANT_ID
 *   }
 */

import { NextResponse } from 'next/server';
import { logEvent } from '@/lib/audit';
import { requireSession } from '@/lib/session';
import { checkAiBudget, recordAiUsage } from '@/lib/aiBudget';

export const runtime  = 'nodejs';
export const maxDuration = 30;

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function dbGet<T = unknown>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${BASE}/${table}?${query}`, { headers: svcHeaders() });
  if (!res.ok) throw new Error(`GET ${table}: ${await res.text()}`);
  return res.json();
}

// Mirror of `_isRealPayment` from crm-src.jsx (module-scope helper).
// POSITIVE-MATCH ONLY — exclusion-only filters let charge types (Stay
// Extension, Room Service, Food & Bev) pass through as revenue. See the
// 2026-05-15 TALHA JUBAYER incident in MEMORY_LOG.
function _isRealPayment(t: { type?: string | null }): boolean {
  const v = t?.type ?? '';
  if (!v) return false;
  if (/balance\s*carried\s*forward/i.test(v)) return false;
  return /payment|settlement|advance|deposit|bkash|bank\s*transfer/i.test(v);
}

// ── Lighthouse (global anchor) ─────────────────────────────────────────────
async function fetchLighthouse(tenant_id: string) {
  const rows = await dbGet<Record<string, unknown>>(
    'v_lighthouse_latest',
    `tenant_id=eq.${tenant_id}&select=*`,
  );
  return rows[0] ?? null;
}

// ── Local context (immediate focus) ────────────────────────────────────────
interface Scope {
  reservation_id?: string;
  guest_id?: string;
  room_number?: string;
}

async function fetchLocal(tenant_id: string, scope: Scope) {
  const out: Record<string, unknown> = {};

  if (scope.reservation_id) {
    const [resv] = await dbGet(
      'reservations',
      `id=eq.${scope.reservation_id}&tenant_id=eq.${tenant_id}&select=*`,
    );
    out.reservation = resv ?? null;

    // Reduce balance from raw transactions filtered by reservation_id.
    // _isRealPayment is POSITIVE-match (mirrors module-scope helper in
    // crm-src.jsx) — charges (Stay Extension, Room Service, F&B) are NOT
    // counted as paid. See coding_conventions.md L137–151.
    const tx = await dbGet<{ amount: number; type: string }>(
      'transactions',
      `reservation_id=eq.${scope.reservation_id}&tenant_id=eq.${tenant_id}&select=id,type,amount,method,created_at,note&order=created_at.asc`,
    );
    out.transactions = tx;

    const paid = tx
      .filter(_isRealPayment)
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const total = Number((resv as { total_amount?: number })?.total_amount ?? 0);
    out.balance_due_bdt   = Math.max(0, total - paid);
    out.paid_to_date_bdt  = paid;
    out.total_booked_bdt  = total;
  }

  if (scope.guest_id) {
    const [guest] = await dbGet(
      'guests',
      `id=eq.${scope.guest_id}&tenant_id=eq.${tenant_id}&select=*`,
    );
    out.guest = guest ?? null;

    out.guest_stay_history = await dbGet(
      'reservations',
      `guest_ids=cs.{${scope.guest_id}}&tenant_id=eq.${tenant_id}&select=id,check_in,check_out,status,total_amount&order=check_in.desc&limit=10`,
    );
  }

  if (scope.room_number) {
    const [room] = await dbGet(
      'rooms',
      `room_number=eq.${scope.room_number}&tenant_id=eq.${tenant_id}&select=*`,
    );
    out.room = room ?? null;
  }

  return out;
}

// ── Payload assembly ───────────────────────────────────────────────────────
function buildPrompt(args: {
  hotel_name: string;
  lighthouse: Record<string, unknown> | null;
  local: Record<string, unknown>;
  user_request: string;
}) {
  const { hotel_name, lighthouse, local, user_request } = args;

  const anchorBlock = lighthouse
    ? `## LIGHTHOUSE CONTEXT (Global Anchor — snapshot ${lighthouse.snapshot_date})

**Structured anchors**
- Occupancy: ${lighthouse.occupancy_pct}% (${lighthouse.rooms_occupied}/${lighthouse.rooms_total})
- In-house: ${lighthouse.in_house_guests} (${lighthouse.vip_in_house} VIP)
- Today: ${lighthouse.arrivals_today} arrivals · ${lighthouse.departures_today} departures
- Revenue today: ৳${Number(lighthouse.revenue_today_bdt).toLocaleString()}
- Revenue MTD: ৳${Number(lighthouse.revenue_mtd_bdt).toLocaleString()}
- ADR: ৳${Number(lighthouse.adr_bdt).toLocaleString()}
- Open unpaid balance: ৳${Number(lighthouse.unpaid_balance_bdt).toLocaleString()}
- Orphan transactions: ${lighthouse.orphan_folios_count}
- Blocked rooms: ${lighthouse.blocked_rooms}
- Pending B2B leads: ${lighthouse.pending_leads}

**Narrative**
${lighthouse.narrative_md || '(none)'}`
    : '## LIGHTHOUSE CONTEXT\n(no snapshot available — first run pending)';

  return `You are the AI operations assistant for Lumea — the CRM for ${hotel_name}. Currency is BDT (৳). Be terse, technical, no greeting.

${anchorBlock}

## LOCAL CONTEXT (Immediate Focus)
${JSON.stringify(local, null, 2)}

## USER REQUEST
${user_request}

Respond with the smallest correct answer. If the local context lacks a field needed to answer, say so — do not fabricate.`;
}

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const t0 = Date.now();
  const requestId = req.headers.get('x-request-id');
  let tenant_id_for_audit: string | null = null;
  try {
    // C2 fix: require authenticated session; tenant from env, not body
            const sess = requireSession(req);
            if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
            // Daily token budget (G5) — hard-stop at the cap.
            const budget = await checkAiBudget();
            if (!budget.allowed) {
              return NextResponse.json({ error: `Daily AI budget exhausted (${budget.used}/${budget.cap} tokens). Resets at midnight Dhaka time.` }, { status: 429 });
            }
            const tenant_id: string = process.env.NEXT_PUBLIC_TENANT_ID!;
            tenant_id_for_audit = tenant_id;
            const body = await req.json();
            const scope: Scope = body.scope ?? {};
            // Validate UUID fields to prevent PostgREST injection
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (scope.reservation_id && !UUID_RE.test(scope.reservation_id)) return NextResponse.json({ error: 'Invalid reservation_id' }, { status: 400 });
            if (scope.guest_id && !UUID_RE.test(scope.guest_id)) return NextResponse.json({ error: 'Invalid guest_id' }, { status: 400 });
            if (scope.room_number) scope.room_number = encodeURIComponent(scope.room_number.slice(0, 20));
    const user_request: string = String(body.user_request ?? '').slice(0, 4000);

    if (!user_request) {
      return NextResponse.json({ error: 'user_request required' }, { status: 400 });
    }

    const [lighthouse, local, tenants] = await Promise.all([
      fetchLighthouse(tenant_id),
      fetchLocal(tenant_id, scope),
      dbGet<{ hotel_name: string }>('tenants', `id=eq.${tenant_id}&select=hotel_name`),
    ]);

    const hotel_name = tenants[0]?.hotel_name ?? 'this hotel';
    const prompt = buildPrompt({ hotel_name, lighthouse, local, user_request });

    const aRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aRes.ok) {
      const txt = await aRes.text();
      void logEvent({
        event_type:    'llm_execution',
        action_target: 'POST /api/ai/assist',
        status_code:   502,
        result:        'failure',
        duration_ms:   Date.now() - t0,
        tenant_id:     tenant_id_for_audit,
        request_id:    requestId,
        role:          'system',
        payload_summary: { model: 'claude-sonnet-5', scope, user_request_len: user_request.length },
        error:         txt.slice(0, 500),
      });
      return NextResponse.json({ error: 'anthropic_error', detail: txt }, { status: 502 });
    }
    const j = await aRes.json();
    recordAiUsage(undefined, j?.usage); // fire-and-forget daily token accounting (G5)
    const answer = j?.content?.[0]?.text ?? '';

    void logEvent({
      event_type:    'llm_execution',
      action_target: 'POST /api/ai/assist',
      status_code:   200,
      result:        'success',
      duration_ms:   Date.now() - t0,
      tenant_id:     tenant_id_for_audit,
      request_id:    requestId,
      role:          'system',
      payload_summary: {
        model: 'claude-sonnet-5',
        scope,
        user_request_len: user_request.length,
        answer_len: answer.length,
        input_tokens:  j?.usage?.input_tokens ?? null,
        output_tokens: j?.usage?.output_tokens ?? null,
      },
    });

    return NextResponse.json({
      answer,
      meta: {
        lighthouse_date: lighthouse?.snapshot_date ?? null,
        local_keys: Object.keys(local),
        model: 'claude-sonnet-5',
      },
    });
  } catch (e) {
    void logEvent({
      event_type:    'llm_execution',
      action_target: 'POST /api/ai/assist',
      status_code:   500,
      result:        'failure',
      duration_ms:   Date.now() - t0,
      tenant_id:     tenant_id_for_audit,
      request_id:    requestId,
      role:          'system',
      error:         String(e).slice(0, 500),
    });
    return NextResponse.json({ error: 'internal', detail: String(e) }, { status: 500 });
  }
}
