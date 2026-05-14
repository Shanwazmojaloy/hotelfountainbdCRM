// ─────────────────────────────────────────────────────────────────────────────
// ReplyIntake Agent  —  /api/agents/reply-intake
// Brevo Inbound Email Parsing Webhook (no auth header — verified by Brevo sig)
//
// Brevo sends POST with JSON array when an inbound email arrives.
// Flow: parse sender → match lead → store in outreach_log →
//       call CEOAuditor inline for scoring.
//
// Configure in Brevo: Settings → Inbound Parsing → Webhook URL:
//   https://fountainbd.com/api/agents/reply-intake
//
// Auth: all DB ops via SECURITY DEFINER RPCs (anon key — no sb_secret_* needed)
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

// Brevo inbound email schema (simplified)
interface BrevoInboundEmail {
  Uuid?:        string;
  MessageId?:   string;
  Subject?:     string;
  From?:        { Name?: string; Address?: string } | string;
  To?:          Array<{ Name?: string; Address?: string }> | string;
  Date?:        string;
  TextContent?: string;
  HtmlContent?: string;
}

interface LeadRow {
  id:            string;
  company_name:  string;
  contact_name?: string;
  contact_email?: string;
  status?:       string;
}

// ── Supabase RPC helper ───────────────────────────────────────────────────────
function sbRpc(rpcName: string, params: Record<string, unknown>) {
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  const SB_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
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

function extractAddress(from: BrevoInboundEmail['From']): string {
  if (!from) return '';
  if (typeof from === 'string') return from;
  return from.Address ?? '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Brevo sends an array of messages
  const messages: BrevoInboundEmail[] = Array.isArray(body) ? body : [body as BrevoInboundEmail];

  const processed: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const senderEmail = extractAddress(msg.From).toLowerCase().trim();
    const subject     = msg.Subject ?? '(no subject)';
    const replyText   = msg.TextContent ?? (msg.HtmlContent ? stripHtml(msg.HtmlContent) : '');

    if (!senderEmail || !replyText) continue;

    // ── Match sender to a known lead by email ─────────────────────────────
    let matchedLead: LeadRow | null = null;

    const emailRes = await sbRpc('intake_find_lead_by_email', {
      p_tenant_id: TENANT,
      p_email:     senderEmail,
    });
    if (emailRes.ok) {
      const rows = await emailRes.json() as LeadRow[];
      matchedLead = rows?.[0] ?? null;
    }

    // ── Fallback: domain match ────────────────────────────────────────────
    if (!matchedLead) {
      const domain = senderEmail.split('@')[1];
      if (domain) {
        const domainRes = await sbRpc('intake_find_lead_by_domain', {
          p_tenant_id: TENANT,
          p_domain:    domain,
        });
        if (domainRes.ok) {
          const rows = await domainRes.json() as LeadRow[];
          matchedLead = rows?.[0] ?? null;
        }
      }
    }

    // ── Log inbound reply via SECURITY DEFINER RPC ────────────────────────
    let logId: string | null = null;
    const logRes = await sbRpc('intake_log_inbound', {
      p_tenant_id: TENANT,
      p_lead_id:   matchedLead?.id ?? null,
      p_direction: 'inbound',
      p_channel:   'email',
      p_subject:   subject,
      p_body:      replyText.slice(0, 4000),
      p_sent_at:   msg.Date ?? new Date().toISOString(),
    });
    if (logRes.ok) {
      const logData = await logRes.json().catch(() => null);
      // RPC returns UUID scalar
      logId = typeof logData === 'string' ? logData : (logData as Record<string, string>)?.id ?? null;
    }

    // ── Update lead status to 'replied' ───────────────────────────────────
    if (matchedLead) {
      await sbRpc('intake_mark_lead_replied', {
        p_lead_id: matchedLead.id,
      });
    }

    // ── Trigger CEO Auditor ────────────────────────────────────────────────
    if (logId && matchedLead) {
      try {
        const auditorUrl = new URL('/api/agents/ceo-auditor', process.env.NEXT_PUBLIC_APP_URL ?? 'https://fountainbd.com');
        await fetch(auditorUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            log_id:        logId,
            lead_id:       matchedLead.id,
            company_name:  matchedLead.company_name,
            contact_name:  matchedLead.contact_name,
            reply_text:    replyText,
            reply_subject: subject,
          }),
        });
      } catch (e) {
        console.error('[reply-intake] Failed to trigger ceo-auditor:', e);
      }
    }

    processed.push({
      sender:       senderEmail,
      subject,
      matched_lead: matchedLead?.company_name ?? 'unknown',
      log_id:       logId,
    });
  }

  return NextResponse.json({ ok: true, agent: 'reply-intake', processed });
}
