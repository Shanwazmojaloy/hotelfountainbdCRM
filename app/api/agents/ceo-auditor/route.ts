// ─────────────────────────────────────────────────────────────────────────────
// CEOAuditor Agent  —  /api/agents/ceo-auditor
// Called by reply-intake (POST) or manually (GET with ?log_id=)
//
// Uses Claude claude-haiku-4-5 to score deal readiness 1–10.
// Score >= 7  →  triggers DealAlert → emails Shan immediately.
// Score <  7  →  logs result, updates lead status to 'audited'.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TENANT       = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const DEAL_THRESHOLD = 7; // score >= 7 → deal alert

interface AuditPayload {
  log_id:        string;
  lead_id:       string;
  company_name:  string;
  contact_name?: string;
  reply_text:    string;
  reply_subject?: string;
}

interface ClaudeAuditResult {
  score: number;           // 1–10
  reasoning: string;       // 2–3 sentence explanation
  signals: string[];       // positive buying signals found
  objections: string[];    // objections / blockers mentioned
  next_action: string;     // recommended follow-up action
  is_deal_ready: boolean;  // true if score >= 7
}

async function runCEOAudit(payload: AuditPayload): Promise<ClaudeAuditResult> {
  const prompt = `You are the CEO of Hotel Fountain BD, a boutique 24-room hotel in Nikunja 2, Dhaka. You are reviewing a reply received from a corporate lead we reached out to for a tie-up partnership.

COMPANY: ${payload.company_name}
CONTACT: ${payload.contact_name ?? 'Unknown'}
EMAIL SUBJECT: ${payload.reply_subject ?? '(no subject)'}
REPLY TEXT:
"""
${payload.reply_text}
"""

Your task: Score this reply's deal readiness from 1 to 10 and extract key signals.

SCORING GUIDE:
- 9–10: Explicitly asked for a meeting/visit, gave availability, requested pricing or terms
- 7–8:  Positive interest expressed, asked a follow-up question, mentioned a real need
- 5–6:  Neutral but not dismissive — "will consider", "not now but maybe later"
- 3–4:  Polite rejection but left door open
- 1–2:  Clear rejection, unsubscribe request, or auto-reply

Respond ONLY with valid JSON in this exact structure:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences explaining the score>",
  "signals": ["<positive buying signal>", ...],
  "objections": ["<objection or blocker>", ...],
  "next_action": "<single recommended next step for Shan to take>",
  "is_deal_ready": <true if score >= 7, else false>
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
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
    throw new Error(`Claude API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '{}';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const result = JSON.parse(jsonMatch[0]) as ClaudeAuditResult;
  result.is_deal_ready = result.score >= DEAL_THRESHOLD;
  return result;
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: AuditPayload;
  try {
    payload = await req.json() as AuditPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.log_id || !payload.lead_id || !payload.reply_text) {
    return NextResponse.json({ error: 'Missing required fields: log_id, lead_id, reply_text' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Run CEO audit via Claude
  let audit: ClaudeAuditResult;
  try {
    audit = await runCEOAudit(payload);
  } catch (e) {
    return NextResponse.json({ error: `Claude API failed: ${String(e)}` }, { status: 500 });
  }

  // Update outreach_log with audit results
  await supabase
    .from('outreach_log')
    .update({
      deal_score:        audit.score,
      deal_score_reason: `${audit.reasoning} | Signals: ${audit.signals.join('; ')} | Objections: ${audit.objections.join('; ')}`,
      ceo_next_action:   audit.next_action,
      is_deal_ready:     audit.is_deal_ready,
      audited_at:        new Date().toISOString(),
    })
    .eq('id', payload.log_id);

  // Update lead status + deal score
  await supabase
    .from('corporate_leads')
    .update({
      status:      audit.is_deal_ready ? 'deal_ready' : 'audited',
      deal_score:  audit.score,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', payload.lead_id);

  // ── Trigger DealAlert if score >= threshold ────────────────────────────────
  if (audit.is_deal_ready) {
    try {
      const alertUrl = new URL('/api/agents/deal-alert', process.env.NEXT_PUBLIC_APP_URL ?? 'https://fountainbd.com');
      await fetch(alertUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          log_id:       payload.log_id,
          lead_id:      payload.lead_id,
          company_name: payload.company_name,
          contact_name: payload.contact_name,
          reply_text:   payload.reply_text,
          score:        audit.score,
          reasoning:    audit.reasoning,
          signals:      audit.signals,
          next_action:  audit.next_action,
        }),
      });
    } catch (e) {
      console.error('[ceo-auditor] Failed to trigger deal-alert:', e);
    }
  }

  return NextResponse.json({
    ok:            true,
    agent:         'ceo-auditor',
    lead:          payload.company_name,
    score:         audit.score,
    is_deal_ready: audit.is_deal_ready,
    reasoning:     audit.reasoning,
    next_action:   audit.next_action,
    timestamp:     new Date().toISOString(),
  });
}

// GET: manually re-audit a specific log entry
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const logId = searchParams.get('log_id');
  if (!logId) return NextResponse.json({ error: 'log_id required' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: log } = await supabase
    .from('outreach_log')
    .select('*, corporate_leads(*)')
    .eq('id', logId)
    .single();

  if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

  const lead = (log as Record<string, unknown>).corporate_leads as Record<string, string>;

  const auditPayload: AuditPayload = {
    log_id:        log.id as string,
    lead_id:       log.lead_id as string,
    company_name:  lead?.company_name ?? 'Unknown',
    contact_name:  lead?.contact_name ?? undefined,
    reply_text:    log.body as string,
    reply_subject: log.subject as string,
  };

  // Reuse POST logic by calling internally
  const internalReq = new Request(req.url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(auditPayload),
  });

  return POST(internalReq);
}
