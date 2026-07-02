/**
 * /api/council/deliberate — AI Advisory Council
 *
 * Multi-agent strategic deliberation. Fans out a single prompt to 5
 * specialized panelists IN PARALLEL, then chains a Chairman synthesis.
 *
 * Reuses the Lighthouse + Local context architecture from /api/ai/assist:
 *   - Lighthouse (global anchor) → v_lighthouse_latest
 *   - Local (reservation_id → reservation + tx + computed balance_due)
 *
 * POST body:
 *   {
 *     "prompt": string,
 *     "scope_mode"?: 'hotel' | 'general',           // default 'hotel'
 *     "reservation_id"?: uuid,                       // hotel-mode context
 *     "tenant_id"?: uuid,                            // defaults env
 *     "user_id"?: uuid
 *   }
 */

import { NextResponse } from 'next/server';
import { logEvent } from '@/lib/audit';
import { requireSession } from '@/lib/session';
import { checkAiBudget, recordAiUsage } from '@/lib/aiBudget';

export const runtime     = 'nodejs';
export const maxDuration = 60;

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

// Anthropic published rate (USD) → BDT cost calc. Sonnet 4.6:
// $3 / 1M in,  $15 / 1M out. USD→BDT ≈ 110.
const COST_IN_PER_MTOK_USD  = 3;
const COST_OUT_PER_MTOK_USD = 15;
const USD_TO_BDT            = 110;

function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function dbGet<T = unknown>(table: string, query: string): Promise<T[]> {
  const r = await fetch(`${BASE}/${table}?${query}`, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`GET ${table}: ${await r.text()}`);
  return r.json();
}

async function dbPost<T = unknown>(table: string, row: unknown): Promise<T[]> {
  const r = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`POST ${table}: ${await r.text()}`);
  return r.json();
}

async function dbPatch(table: string, query: string, patch: unknown): Promise<void> {
  const r = await fetch(`${BASE}/${table}?${query}`, {
    method: 'PATCH',
    headers: svcHeaders(),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`PATCH ${table}: ${await r.text()}`);
}

// Mirror of `_isRealPayment` (see /api/ai/assist + crm-src.jsx).
function _isRealPayment(t: { type?: string | null }): boolean {
  const v = t?.type ?? '';
  if (!v) return false;
  if (/balance\s*carried\s*forward/i.test(v)) return false;
  return /payment|settlement|advance|deposit|bkash|bank\s*transfer/i.test(v);
}

// ── Context fetch ──────────────────────────────────────────────────────
async function fetchHotelContext(tenant_id: string, reservation_id?: string) {
  const [lighthouseRows, tenants] = await Promise.all([
    dbGet<Record<string, unknown>>('v_lighthouse_latest', `tenant_id=eq.${tenant_id}&select=*`),
    dbGet<{ hotel_name: string }>('tenants', `id=eq.${tenant_id}&select=hotel_name`),
  ]);
  const lighthouse = lighthouseRows[0] ?? null;
  const hotel_name = tenants[0]?.hotel_name ?? 'this hotel';

  let local: Record<string, unknown> = {};
  if (reservation_id) {
    const [resv] = await dbGet(
      'reservations',
      `id=eq.${reservation_id}&tenant_id=eq.${tenant_id}&select=*`,
    );
    const tx = await dbGet<{ amount: number; type: string }>(
      'transactions',
      `reservation_id=eq.${reservation_id}&tenant_id=eq.${tenant_id}&select=type,amount,method,created_at`,
    );
    const paid  = tx.filter(_isRealPayment).reduce((s, t) => s + Number(t.amount || 0), 0);
    const total = Number((resv as { total_amount?: number })?.total_amount ?? 0);
    local = {
      reservation: resv ?? null,
      transactions: tx,
      total_booked_bdt: total,
      paid_to_date_bdt: paid,
      balance_due_bdt: Math.max(0, total - paid),
    };
  }
  return { hotel_name, lighthouse, local };
}

// ── Panelist definitions ──────────────────────────────────────────────
type Role =
  | 'devils_advocate'
  | 'first_principles'
  | 'optimist'
  | 'rationalist'
  | 'executor';

const PANELISTS: Record<Role, { label: string; system: string }> = {
  devils_advocate: {
    label: "Devil's Advocate",
    system:
`You are the DEVIL'S ADVOCATE on a strategic advisory council. Your sole job is to attack the user's plan. Identify structural weaknesses, hidden assumptions, failure modes, regulatory landmines, and second-order consequences. Cite the hotel context if it sharpens the critique. Be specific, not generic — name what breaks and when. Output: 5–8 numbered weaknesses, each with one supporting sentence. No preamble.`,
  },
  first_principles: {
    label: 'First-Principles Thinker',
    system:
`You are the FIRST-PRINCIPLES thinker. Strip the user's question to its foundational physics: what is the actual goal, what are the irreducible constraints, what assumptions are inherited (not derived)? Rebuild the proposition from those primitives. Output: (a) Goal restated in one line, (b) 3–5 primitives, (c) reconstructed proposition. No preamble.`,
  },
  optimist: {
    label: 'The Optimist',
    system:
`You are the OPTIMIST on the council. Focus exclusively on upside, scaling vectors, hidden compounding effects, and asymmetric wins the user has not yet named. You are not naive — you find real, defensible upside. Output: 4–6 upside vectors, each with a concrete trigger that activates it. No preamble.`,
  },
  rationalist: {
    label: 'The Rationalist',
    system:
`You are the RATIONALIST. Remove emotion, sunk-cost bias, status-seeking, and identity attachment from the evaluation. Score the proposition on (1) expected value, (2) variance, (3) ruin risk, (4) optionality preserved. Use plain numbers and ranges where the context supports them. Output: 4 scores with one-line justifications, then a single line: BIAS_FLAGS the user is likely exhibiting. No preamble.`,
  },
  executor: {
    label: 'The Executor',
    system:
`You are the EXECUTOR. Translate the abstract proposition into a step-by-step execution plan. Output a numbered list of 6–10 steps, each with: owner role, time estimate, success signal, and the single blocking dependency. Currency is BDT (৳). No preamble.`,
  },
};

const CHAIRMAN_SYSTEM =
`You are the CHAIRMAN of the AI Advisory Council. Five panelists — Devil's Advocate, First-Principles Thinker, Optimist, Rationalist, and Executor — have each delivered a verdict on the user's question. Synthesize their inputs into a single hardened final verdict.

Required structure:
1. VERDICT: one of GO / GO-WITH-CONDITIONS / DEFER / KILL.
2. RATIONALE: 3–5 lines tying the verdict to the strongest signals from the panel.
3. CONDITIONS (if any): bullet list of preconditions that must hold for GO.
4. KILL-SWITCH: the single observable that would invalidate this verdict later.
5. FIRST 72 HOURS: 3 concrete actions, owner role + deadline.

No preamble. Currency BDT (৳). Be terse and decisive — your job is to end the debate.`;

// ── Anthropic call wrapper ────────────────────────────────────────────
interface AnthropicResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  cost_bdt: number;
  latency_ms: number;
}

async function callClaude(args: {
  system: string;
  user: string;
  max_tokens?: number;
}): Promise<AnthropicResult> {
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: args.max_tokens ?? 1024,
      system: args.system,
      messages: [{ role: 'user', content: args.user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic: ${await res.text()}`);
  const j = await res.json();
  recordAiUsage(undefined, j?.usage); // fire-and-forget daily token accounting (G5)
  const text = j?.content?.[0]?.text ?? '';
  const tokens_in  = j?.usage?.input_tokens  ?? 0;
  const tokens_out = j?.usage?.output_tokens ?? 0;
  const cost_usd =
    (tokens_in  / 1_000_000) * COST_IN_PER_MTOK_USD +
    (tokens_out / 1_000_000) * COST_OUT_PER_MTOK_USD;
  return {
    text,
    tokens_in,
    tokens_out,
    cost_bdt: +(cost_usd * USD_TO_BDT).toFixed(2),
    latency_ms: Date.now() - t0,
  };
}

// ── Prompt assembly ───────────────────────────────────────────────────
function buildContextBlock(ctx: {
  hotel_name: string;
  lighthouse: Record<string, unknown> | null;
  local: Record<string, unknown>;
  scope_mode: 'hotel' | 'general';
}): string {
  if (ctx.scope_mode === 'general') {
    return `## CONTEXT\nGeneral strategy mode. No hotel telemetry attached.`;
  }
  const lh = ctx.lighthouse;
  const anchor = lh
    ? `**Operating context — ${ctx.hotel_name}** (snapshot ${lh.snapshot_date})
- Occupancy: ${lh.occupancy_pct}% (${lh.rooms_occupied}/${lh.rooms_total})
- In-house: ${lh.in_house_guests} (${lh.vip_in_house} VIP) · Arrivals ${lh.arrivals_today} · Departures ${lh.departures_today}
- Revenue today: ৳${Number(lh.revenue_today_bdt).toLocaleString()} · MTD: ৳${Number(lh.revenue_mtd_bdt).toLocaleString()} · ADR: ৳${Number(lh.adr_bdt).toLocaleString()}
- Open unpaid balance: ৳${Number(lh.unpaid_balance_bdt).toLocaleString()} · Orphan tx: ${lh.orphan_folios_count}
- Pending B2B leads: ${lh.pending_leads} · Blocked rooms: ${lh.blocked_rooms}`
    : `**Operating context — ${ctx.hotel_name}** (no Lighthouse snapshot yet)`;

  const localBlock =
    Object.keys(ctx.local).length > 0
      ? `\n\n**Focused reservation**\n\`\`\`json\n${JSON.stringify(ctx.local, null, 2)}\n\`\`\``
      : '';

  return `## CONTEXT\n${anchor}${localBlock}`;
}

// ── Handler ───────────────────────────────────────────────────────────
export async function POST(req: Request) {
    // C2 fix: require authenticated session before any AI/LLM work
    const sess = requireSession(req);
    if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    // Daily token budget (G5) — the council is the most expensive AI route (N panelists
    // + chairman per deliberation), so it hard-stops at the cap instead of degrading.
    const budget = await checkAiBudget();
    if (!budget.allowed) {
      return NextResponse.json({ error: `Daily AI budget exhausted (${budget.used}/${budget.cap} tokens). Resets at midnight Dhaka time.` }, { status: 429 });
    }
  let sessionId: string | null = null;
  try {
    const body = await req.json();
    const prompt: string = String(body.prompt ?? '').slice(0, 6000);
    const scope_mode: 'hotel' | 'general' = body.scope_mode === 'general' ? 'general' : 'hotel';
    const reservation_id: string | undefined = body.reservation_id;
        const tenant_id: string = process.env.NEXT_PUBLIC_TENANT_ID!; // C2 fix: env only, not body
    // staff.id is integer in the live schema
    const user_id: number | null =
      body.user_id == null || body.user_id === '' ? null : Number(body.user_id) || null;

    if (!prompt) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    // 1. Persist session row (status=deliberating)
    const [session] = await dbPost<{ id: string }>('council_sessions', {
      tenant_id,
      user_id,
      reservation_id: reservation_id ?? null,
      scope_mode,
      prompt,
      status: 'deliberating',
    });
    sessionId = session.id;

    // 2. Fetch hotel context (skipped in general mode)
    const ctx =
      scope_mode === 'hotel'
        ? await fetchHotelContext(tenant_id, reservation_id)
        : { hotel_name: '', lighthouse: null, local: {} };
    const contextBlock = buildContextBlock({ ...ctx, scope_mode });

    // 3. PARALLEL fan-out to all 5 panelists
    const roles = Object.keys(PANELISTS) as Role[];
    const userMsg = `${contextBlock}\n\n## USER QUESTION\n${prompt}`;

    const panelResults = await Promise.all(
      roles.map(async (role) => {
        const panel = PANELISTS[role];
        const result = await callClaude({ system: panel.system, user: userMsg, max_tokens: 800 });
        await dbPost('council_panelists', {
          session_id: sessionId,
          tenant_id,
          role,
          verdict:   result.text,
          tokens_in: result.tokens_in,
          tokens_out: result.tokens_out,
          cost_bdt:  result.cost_bdt,
          latency_ms: result.latency_ms,
          model: 'claude-sonnet-4-6',
        });
        return { role, label: panel.label, ...result };
      }),
    );

    // 4. Chairman synthesis (sequential — needs all 5 verdicts)
    const debateBundle = panelResults
      .map((p) => `### ${p.label}\n${p.text}`)
      .join('\n\n');

    const chairmanResult = await callClaude({
      system: CHAIRMAN_SYSTEM,
      user: `${contextBlock}\n\n## USER QUESTION\n${prompt}\n\n## PANEL DEBATE\n${debateBundle}`,
      max_tokens: 1200,
    });

    await dbPost('council_panelists', {
      session_id: sessionId,
      tenant_id,
      role: 'chairman',
      verdict: chairmanResult.text,
      tokens_in: chairmanResult.tokens_in,
      tokens_out: chairmanResult.tokens_out,
      cost_bdt: chairmanResult.cost_bdt,
      latency_ms: chairmanResult.latency_ms,
      model: 'claude-sonnet-4-6',
    });

    // 5. Finalize session totals
    const total_tokens_in  = panelResults.reduce((s, r) => s + r.tokens_in,  0) + chairmanResult.tokens_in;
    const total_tokens_out = panelResults.reduce((s, r) => s + r.tokens_out, 0) + chairmanResult.tokens_out;
    const total_cost_bdt   = +(panelResults.reduce((s, r) => s + r.cost_bdt, 0) + chairmanResult.cost_bdt).toFixed(2);

    await dbPatch('council_sessions', `id=eq.${sessionId}`, {
      status: 'complete',
      chairman_verdict: chairmanResult.text,
      total_tokens_in,
      total_tokens_out,
      total_cost_bdt,
      completed_at: new Date().toISOString(),
    });

    void logEvent({
      event_type:    'llm_execution',
      action_target: `council_sessions:${sessionId}`,
      status_code:   200,
      result:        'success',
      tenant_id,
      request_id:    req.headers.get('x-request-id'),
      user_id:       user_id != null ? String(user_id) : null,
      role:          'staff',
      payload_summary: {
        scope_mode,
        reservation_id: reservation_id ?? null,
        prompt_len: prompt.length,
        panelist_count: panelResults.length + 1,
        total_tokens_in,
        total_tokens_out,
        total_cost_bdt,
      },
    });

    return NextResponse.json({
      session_id: sessionId,
      panelists: panelResults.map((p) => ({
        role: p.role,
        label: p.label,
        verdict: p.text,
        tokens_in: p.tokens_in,
        tokens_out: p.tokens_out,
        cost_bdt: p.cost_bdt,
        latency_ms: p.latency_ms,
      })),
      chairman: {
        role: 'chairman',
        label: 'The Chairman',
        verdict: chairmanResult.text,
        tokens_in: chairmanResult.tokens_in,
        tokens_out: chairmanResult.tokens_out,
        cost_bdt: chairmanResult.cost_bdt,
        latency_ms: chairmanResult.latency_ms,
      },
      totals: { total_tokens_in, total_tokens_out, total_cost_bdt },
      meta: {
        scope_mode,
        lighthouse_date: ctx.lighthouse?.snapshot_date ?? null,
        model: 'claude-sonnet-4-6',
      },
    });
  } catch (e) {
    if (sessionId) {
      await dbPatch('council_sessions', `id=eq.${sessionId}`, {
        status: 'failed',
        error: String(e).slice(0, 1000),
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    }
    void logEvent({
      event_type:    'llm_execution',
      action_target: sessionId ? `council_sessions:${sessionId}` : 'POST /api/council/deliberate',
      status_code:   500,
      result:        'failure',
      request_id:    req.headers.get('x-request-id'),
      role:          'system',
      error:         String(e).slice(0, 500),
    });
    return NextResponse.json({ error: 'internal', detail: String(e) }, { status: 500 });
  }
}

// ── GET: list recent sessions for a tenant (UI history pane) ──────────
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenant_id = url.searchParams.get('tenant_id') || process.env.NEXT_PUBLIC_TENANT_ID!;
    const limit     = Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10));
    const rows = await dbGet(
      'v_council_sessions_with_panel',
      `tenant_id=eq.${tenant_id}&order=created_at.desc&limit=${limit}`,
    );
    return NextResponse.json({ sessions: rows });
  } catch (e) {
    return NextResponse.json({ error: 'internal', detail: String(e) }, { status: 500 });
  }
}
