// ─────────────────────────────────────────────────────────────────────────────
// CEOAuditor Agent  —  /api/agents/ceo-auditor
// Called by reply-intake (POST) or manually (GET with ?log_id=)
//
// Uses Claude claude-haiku-4-5 to score deal readiness 1–10.
// Score >= 7  →  triggers DealAlert → emails Shan immediately.
// Score <  7  →  logs result, updates lead status to 'audited'.
//
// Auth: all DB ops via SECURITY DEFINER RPCs (anon key — no sb_secret_* needed)
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

import { assertCron } from '@/lib/workflow-trigger';
// TENANT sourced per-request via getTenantFromHeaders() — no module-level constant needed
const DEAL_THRESHOLD = 7;

interface AuditPayload {
  log_id:          string;
  lead_id:         string;
  company_name:    string;
  contact_name?:   string;
  contact_email?:  string;   // sender email, threaded from reply-intake
  reply_text:      string;
  reply_subject?:  string;
}

interface ClaudeAuditResult {
  score:         number;
  reasoning:     string;
  signals:       string[];
  objections:    string[];
  next_action:   string;
  is_deal_ready: boolean;
}

// ── Supabase RPC helper ───────────────────────────────────────────────────────
function sbRpc(rpcName: string, params: Record<string, unknown>) {
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return fetch(`${SB_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
}

// ── Deterministic heuristic fallback (mirrors public.fn_heuristic_audit) ──────
// Used when Claude is unreachable: no Anthropic credits, invalid key, network
// error, or malformed JSON response. Guarantees the audit pipeline always
// completes — no more silent NULLs in outreach_log audit columns.
function runHeuristicAudit(payload: AuditPayload): ClaudeAuditResult {
  const txt = `${payload.reply_text ?? ''} ${payload.reply_subject ?? ''}`.toLowerCase();
  const bodyOnly = (payload.reply_text ?? '').toLowerCase().trim();
  const subj = (payload.reply_subject ?? '').toLowerCase();

  // Test / debug noise
  const testBodies = ['test', 'test body', 'testing', 'testing new key'];
  if (subj.startsWith('test') || testBodies.includes(bodyOnly)) {
    return {
      score: 1,
      reasoning: 'Body matches test/debug pattern, not a genuine reply.',
      signals: [],
      objections: ['test/debug data'],
      next_action: 'Skip — flag for cleanup; do not treat as a real lead reply.',
      is_deal_ready: false,
    };
  }

  // Hard rejection / auto-reply
  if (/(unsubscribe|remove (me|from)|stop emailing|do not (email|contact)|not interested|out of office|auto.?reply|automatic reply)/.test(txt)) {
    return {
      score: 1,
      reasoning: 'Hard rejection, unsubscribe, or auto-reply.',
      signals: [],
      objections: ['Explicit unsubscribe / not interested / auto-reply'],
      next_action: 'Mark as unsubscribed; remove from outreach list.',
      is_deal_ready: false,
    };
  }

  // Hot — booking/meeting/quote intent
  if (/(meeting|schedule|book |booking|invoice|quote|pricing|send (the )?details|let'?s (talk|discuss|meet)|next week|this week|tour|visit|come over|come by|how much|what.*cost|available on|set up a (call|meeting))/.test(txt)) {
    return {
      score: 9,
      reasoning: 'Reply contains explicit booking, meeting, or pricing intent.',
      signals: ['Specific booking/meeting/pricing intent'],
      objections: [],
      next_action: 'Reply within 1 hour with calendar slots + pricing.',
      is_deal_ready: true,
    };
  }

  // Warm — positive interest
  if (/(interested|demo|tell me more|would like to (know|see)|send (info|brochure)|follow up|sounds (good|interesting|great)|please share|more information)/.test(txt)) {
    return {
      score: 7,
      reasoning: 'Reply shows positive interest, asks for more info.',
      signals: ['Positive interest expressed'],
      objections: [],
      next_action: 'Send pitch deck + a calendar link for a 20-min call.',
      is_deal_ready: true,
    };
  }

  // Lukewarm
  if (/(consider|maybe later|not (right )?now|perhaps|future|circle back|keep us posted|in (a )?few months)/.test(txt)) {
    return {
      score: 5,
      reasoning: 'Reply is non-committal — needs nurturing.',
      signals: [],
      objections: ['Non-committal / not buying now'],
      next_action: 'Move to nurture sequence; check back in 30 days.',
      is_deal_ready: false,
    };
  }

  // Polite rejection / incumbent
  if (/(already (have|use|using)|currently have|all set|no need|not looking|we are good|content with|happy with our current)/.test(txt)) {
    return {
      score: 3,
      reasoning: 'Polite rejection — has existing provider.',
      signals: [],
      objections: ['Has incumbent solution'],
      next_action: 'Quarterly long-tail touch; do not push.',
      is_deal_ready: false,
    };
  }

  // Default neutral
  return {
    score: 5,
    reasoning: 'Neutral reply — no clear buying signal or rejection.',
    signals: [],
    objections: [],
    next_action: 'Send a polite follow-up in 3 days.',
    is_deal_ready: false,
  };
}

// ── Claude AI audit (with heuristic fallback) ────────────────────────────────
async function runCEOAudit(payload: AuditPayload): Promise<ClaudeAuditResult & { source: 'claude' | 'heuristic'; fallback_reason?: string }> {
  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!anthropicKey) {
    return { ...runHeuristicAudit(payload), source: 'heuristic', fallback_reason: 'ANTHROPIC_API_KEY missing' };
  }

  const hotelDesc = process.env.HOTEL_DESCRIPTION || 'Hotel Fountain BD, a boutique 24-room hotel in Nikunja 2, Dhaka';
  const prompt = `You are the CEO of ${hotelDesc}. Review this reply from a corporate lead.

COMPANY: ${payload.company_name}
CONTACT: ${payload.contact_name ?? 'Unknown'}
EMAIL SUBJECT: ${payload.reply_subject ?? '(no subject)'}
REPLY TEXT:
"""
${payload.reply_text}
"""

Score deal readiness 1–10. SCORING GUIDE:
- 9–10: Asked for meeting/visit, gave availability, requested pricing
- 7–8:  Positive interest, asked follow-up question, mentioned real need
- 5–6:  Neutral — "will consider", "not now but maybe later"
- 3–4:  Polite rejection but left door open
- 1–2:  Clear rejection, unsubscribe, or auto-reply

Respond ONLY with valid JSON:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences>",
  "signals": ["<buying signal>"],
  "objections": ["<objection>"],
  "next_action": "<single recommended next step>",
  "is_deal_ready": <true if score >= 7>
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[ceo-auditor] Claude API non-ok', response.status, errBody);
      let reason = `Claude HTTP ${response.status}`;
      try {
        const j = JSON.parse(errBody);
        if (j?.error?.message) reason = String(j.error.message).slice(0, 160);
      } catch { /* ignore JSON parse failure — keep generic reason */ }
      return { ...runHeuristicAudit(payload), source: 'heuristic', fallback_reason: reason };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[ceo-auditor] No JSON in Claude response');
      return { ...runHeuristicAudit(payload), source: 'heuristic', fallback_reason: 'Claude returned no JSON' };
    }

    const result = JSON.parse(jsonMatch[0]) as ClaudeAuditResult;
    result.is_deal_ready = result.score >= DEAL_THRESHOLD;
    return { ...result, source: 'claude' };
  } catch (e) {
    console.error('[ceo-auditor] Claude fetch error', e);
    return { ...runHeuristicAudit(payload), source: 'heuristic', fallback_reason: String(e).slice(0, 160) };
  }
}

// ── Shared audit + persist logic ──────────────────────────────────────────────
async function auditAndPersist(payload: AuditPayload) {
  const audit = await runCEOAudit(payload);
  const sourceTag = audit.source === 'heuristic'
    ? ` [heuristic${audit.fallback_reason ? `: ${audit.fallback_reason}` : ''}]`
    : '';

  await sbRpc('ceo_update_log', {
    p_log_id:            payload.log_id,
    p_deal_score:        audit.score,
    p_deal_score_reason: `${audit.reasoning} | Signals: ${audit.signals.join('; ')} | Objections: ${audit.objections.join('; ')}${sourceTag}`,
    p_ceo_next_action:   audit.next_action,
    p_is_deal_ready:     audit.is_deal_ready,
    p_audited_at:        new Date().toISOString(),
  });

  await sbRpc('ceo_update_lead', {
    p_lead_id:    payload.lead_id,
    p_status:     audit.is_deal_ready ? 'deal_ready' : 'audited',
    p_deal_score: audit.score,
    p_updated_at: new Date().toISOString(),
  });

  if (audit.is_deal_ready) {
    try {
      const alertUrl = new URL('/api/agents/deal-alert', process.env.NEXT_PUBLIC_APP_URL ?? 'https://fountainbd.com');
      await fetch(alertUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({
          log_id:        payload.log_id,
          lead_id:       payload.lead_id,
          company_name:  payload.company_name,
          contact_name:  payload.contact_name,
          contact_email: payload.contact_email,   // pass through for payment-send
          reply_text:    payload.reply_text,
          score:         audit.score,
          reasoning:     audit.reasoning,
          signals:       audit.signals,
          next_action:   audit.next_action,
        }),
      });
    } catch (e) {
      console.error('[ceo-auditor] Failed to trigger deal-alert:', e);
    }
  }

  return audit;
}

// ── POST: called by reply-intake ──────────────────────────────────────────────
export async function POST(req: Request) {
  const denied = assertCron(req); if (denied) return denied;

  let payload: AuditPayload;
  try {
    payload = await req.json() as AuditPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.log_id || !payload.lead_id || !payload.reply_text) {
    return NextResponse.json({ error: 'Missing required fields: log_id, lead_id, reply_text' }, { status: 400 });
  }

  try {
    const audit = await auditAndPersist(payload);
    return NextResponse.json({
      ok: true, agent: 'ceo-auditor',
      lead: payload.company_name, score: audit.score,
      is_deal_ready: audit.is_deal_ready, reasoning: audit.reasoning,
      next_action: audit.next_action,
      source: audit.source, fallback_reason: audit.fallback_reason ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: `Audit failed: ${String(e)}` }, { status: 500 });
  }
}

// ── GET: manually re-audit a specific log entry ───────────────────────────────
export async function GET(req: Request) {
  const denied = assertCron(req); if (denied) return denied;
  
  const { searchParams } = new URL(req.url);
  const logId = searchParams.get('log_id');
  if (!logId) return NextResponse.json({ error: 'log_id required' }, { status: 400 });

  const logRes = await sbRpc('ceo_get_log_with_lead', { p_log_id: logId });
  if (!logRes.ok) return NextResponse.json({ error: 'DB error fetching log' }, { status: 500 });

  const rows = await logRes.json() as Record<string, string>[];
  if (!rows?.length) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

  const row = rows[0];
  const payload: AuditPayload = {
    log_id:        row.log_id,
    lead_id:       row.log_lead_id,
    company_name:  row.lead_company_name ?? 'Unknown',
    contact_name:  row.lead_contact_name  ?? undefined,
    contact_email: row.lead_contact_email ?? undefined,
    reply_text:    row.log_body  ?? '',
    reply_subject: row.log_subject ?? undefined,
  };

  try {
    const audit = await auditAndPersist(payload);
    return NextResponse.json({
      ok: true, agent: 'ceo-auditor',
      lead: payload.company_name, score: audit.score,
      is_deal_ready: audit.is_deal_ready, reasoning: audit.reasoning,
      next_action: audit.next_action,
      source: audit.source, fallback_reason: audit.fallback_reason ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: `Audit failed: ${String(e)}` }, { status: 500 });
  }
}
