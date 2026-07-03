// ─────────────────────────────────────────────────────────────────────────────
// Lumea — GET /api/agents/churn-score
//
// Nightly cron (vercel.json: "0 18 * * *" = midnight Asia/Dhaka) that scores
// each B2B partner's churn risk and upserts public.account_churn_profile.
//
// v1 scores from engagement signals already in b2b_partners (status, recency,
// booking volume, notes) — no Gmail dependency. Claude returns a structured
// assessment (risk_status, churn_score, reasons, recommended_action). When the
// email pipeline (ingest.py) populates email_chunks, sentiment can layer in.
//
// Auth: Vercel cron `Authorization: Bearer <CRON_SECRET>`.
// Reads/writes via service-role Supabase REST. Anthropic via fetch (no SDK).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { logEvent } from '@/lib/audit';
import { checkAiBudget, recordAiUsage } from '@/lib/aiBudget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const MAX_PARTNERS = 25;
const CONCURRENCY = 5;
// Sequential processing of up to MAX_PARTNERS partners (each up to a 25s AI
// call + 15s DB upsert) could exceed the 60s function budget by 10x — this is
// what caused the recurring "Task timed out after 60 seconds" errors. Bound
// concurrency and stop starting new work once the deadline is close.
const DEADLINE_MS = 48_000;

type Partner = {
  id: string;
  agency_name: string | null;
  email: string | null;
  status: string | null;
  total_bookings: number | null;
  total_revenue: number | null;
  last_booking_at: string | null;
  last_contacted_at: string | null;
  joined_at: string | null;
  follow_up_count: number | null;
  notes: string | null;
  tenant_id: string | null;
};

type Assessment = {
  risk_status: 'Low' | 'Medium' | 'High';
  churn_score: number;
  reasons: { factor: string; severity: string; evidence: string }[];
  recommended_action: string;
};

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function signalSummary(p: Partner): string {
  const lb = daysAgo(p.last_booking_at);
  const lc = daysAgo(p.last_contacted_at);
  const jn = daysAgo(p.joined_at);
  return [
    `Agency: ${p.agency_name ?? 'Unknown'}.`,
    `Pipeline status: ${p.status ?? 'n/a'}.`,
    `Total bookings: ${p.total_bookings ?? 0}; revenue BDT ${p.total_revenue ?? 0}.`,
    jn != null ? `Partner for ${jn} days.` : '',
    lb != null ? `Last booking ${lb} days ago.` : 'No bookings on record.',
    lc != null ? `Last contacted ${lc} days ago.` : 'Never logged a contact.',
    `Follow-ups sent: ${p.follow_up_count ?? 0}.`,
    p.notes ? `Notes: ${p.notes}` : '',
  ].filter(Boolean).join(' ');
}

// Coarse engagement-trend proxy (negative = cooling) until email sentiment exists.
function engagementSlope(p: Partner): number {
  const lc = daysAgo(p.last_contacted_at);
  const lb = daysAgo(p.last_booking_at);
  let s = 0;
  if (lc != null && lc > 30) s -= 0.2;
  if (lb != null && lb > 60) s -= 0.2;
  if ((p.total_bookings ?? 0) === 0 && (p.status ?? '').toUpperCase() === 'COLD') s -= 0.1;
  return Math.max(-0.5, s);
}

const CHURN_TOOL = {
  name: 'report_churn',
  description: 'Return a structured churn-risk assessment for one B2B partner.',
  input_schema: {
    type: 'object',
    properties: {
      risk_status: { type: 'string', enum: ['Low', 'Medium', 'High'] },
      churn_score: { type: 'number', minimum: 0, maximum: 1 },
      reasons: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            factor: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            evidence: { type: 'string' },
          },
          required: ['factor', 'severity', 'evidence'],
        },
      },
      recommended_action: { type: 'string' },
    },
    required: ['risk_status', 'churn_score', 'reasons'],
  },
};

async function assess(summary: string, apiKey: string): Promise<Assessment | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      tools: [CHURN_TOOL],
      tool_choice: { type: 'tool', name: 'report_churn' },
      messages: [{
        role: 'user',
        content:
          'You assess B2B partner churn risk for a Dhaka hotel. Given these ' +
          'engagement signals, return a structured assessment. Cite the signal ' +
          'as evidence.\n\n' + summary,
      }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return null;
  const data: { content?: Array<{ type: string; input?: Assessment }>; usage?: { input_tokens?: number; output_tokens?: number } } = await res.json();
  recordAiUsage(undefined, data.usage); // fire-and-forget daily token accounting (G5)
  const block = (data.content ?? []).find((b) => b.type === 'tool_use');
  return block?.input ?? null;
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const requestId = req.headers.get('x-request-id');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
  if (!SB_URL || !SB_KEY) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 });
  }
  if (!ANTHROPIC) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  // Daily token budget (G5) — cron agent loops over partners, so gate once up front.
  const budget = await checkAiBudget();
  if (!budget.allowed) {
    return NextResponse.json({ error: `Daily AI budget exhausted (${budget.used}/${budget.cap} tokens); churn scoring skipped this run.` }, { status: 429 });
  }

  const svc = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1) Pull partners (most recently active first).
    const cols = 'id,agency_name,email,status,total_bookings,total_revenue,' +
                 'last_booking_at,last_contacted_at,joined_at,follow_up_count,notes,tenant_id';
    const pr = await fetch(
      `${SB_URL}/rest/v1/b2b_partners?select=${cols}&order=joined_at.desc.nullslast&limit=${MAX_PARTNERS}`,
      { headers: svc, signal: AbortSignal.timeout(15_000) },
    );
    if (!pr.ok) {
      const detail = await pr.text();
      return NextResponse.json({ error: 'partners_fetch_failed', detail }, { status: 502 });
    }
    const partners: Partner[] = await pr.json();

    let scored = 0, high = 0, skipped = 0, deadlineSkipped = 0;

    async function scoreOne(p: Partner): Promise<void> {
      const a = await assess(signalSummary(p), ANTHROPIC!);
      if (!a || typeof a.churn_score !== 'number') { skipped++; return; }

      const slope = engagementSlope(p);
      const blended = Math.min(1, Math.round((a.churn_score + Math.max(0, -slope) * 0.4) * 1000) / 1000);
      const status = blended > 0.66 ? 'High' : blended >= 0.34 ? 'Medium' : 'Low';

      const row = {
        account_id: p.id,
        tenant_id: p.tenant_id,
        risk_status: status,
        churn_score: blended,
        sentiment_slope: slope,
        reasons: a.reasons ?? [],
        recommended_action: a.recommended_action ?? '',
        last_scored_at: new Date().toISOString(),
      };

      const up = await fetch(`${SB_URL}/rest/v1/account_churn_profile`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(15_000),
      });
      if (up.ok) { scored++; if (status === 'High') high++; }
      else { skipped++; }
    }

    // Bounded-concurrency worker pool: CONCURRENCY partners in flight at once,
    // and stop pulling new work once we're inside the deadline margin so
    // in-flight calls have room to finish before Vercel kills the function.
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < partners.length) {
        if (Date.now() - t0 > DEADLINE_MS) {
          deadlineSkipped += partners.length - cursor;
          return;
        }
        const p = partners[cursor++];
        await scoreOne(p);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, partners.length) }, worker));

    const summary = { scored, high, skipped, deadline_skipped: deadlineSkipped, partners: partners.length };
    void logEvent({
      event_type: 'cron_churn_score',
      action_target: 'GET /api/agents/churn-score',
      status_code: 200,
      result: 'success',
      duration_ms: Date.now() - t0,
      request_id: requestId,
      role: 'cron',
      payload_summary: summary,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    void logEvent({
      event_type: 'cron_churn_score',
      action_target: 'GET /api/agents/churn-score',
      status_code: 500,
      result: 'failure',
      duration_ms: Date.now() - t0,
      request_id: requestId,
      role: 'cron',
      error: detail.slice(0, 500),
    });
    return NextResponse.json({ error: 'churn_score_failed', detail }, { status: 500 });
  }
}
