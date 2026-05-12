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
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

// Brevo inbound email schema (simplified)
interface BrevoInboundEmail {
  Uuid?: string;
  MessageId?: string;
  Subject?: string;
  From?: { Name?: string; Address?: string } | string;
  To?: Array<{ Name?: string; Address?: string }> | string;
  Date?: string;
  TextContent?: string;
  HtmlContent?: string;
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const processed: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const senderEmail = extractAddress(msg.From).toLowerCase().trim();
    const subject     = msg.Subject ?? '(no subject)';
    const replyText   = msg.TextContent ?? (msg.HtmlContent ? stripHtml(msg.HtmlContent) : '');

    if (!senderEmail || !replyText) continue;

    // Match sender to a known lead
    const { data: leads } = await supabase
      .from('corporate_leads')
      .select('*')
      .eq('tenant_id', TENANT)
      .ilike('contact_email', senderEmail)
      .limit(1);

    const lead = leads?.[0] ?? null;

    // If no exact match, try domain match (e.g. someone@desco.org.bd)
    let matchedLead = lead;
    if (!matchedLead) {
      const domain = senderEmail.split('@')[1];
      if (domain) {
        const { data: domainLeads } = await supabase
          .from('corporate_leads')
          .select('*')
          .eq('tenant_id', TENANT)
          .ilike('company_website', `%${domain}%`)
          .limit(1);
        matchedLead = domainLeads?.[0] ?? null;
      }
    }

    // Store inbound reply
    const { data: logRow } = await supabase
      .from('outreach_log')
      .insert({
        tenant_id: TENANT,
        lead_id: matchedLead?.id ?? null,
        direction: 'inbound',
        channel: 'email',
        subject,
        body: replyText,
        sent_at: msg.Date ?? new Date().toISOString(),
      })
      .select()
      .single();

    // Update lead status to 'replied'
    if (matchedLead) {
      await supabase
        .from('corporate_leads')
        .update({ status: 'replied', updated_at: new Date().toISOString() })
        .eq('id', matchedLead.id);
    }

    // ── Trigger CEO Auditor ────────────────────────────────────────────────
    if (logRow && matchedLead) {
      try {
        const auditorUrl = new URL('/api/agents/ceo-auditor', process.env.NEXT_PUBLIC_APP_URL ?? 'https://fountainbd.com');
        await fetch(auditorUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            log_id:       logRow.id,
            lead_id:      matchedLead.id,
            company_name: matchedLead.company_name,
            contact_name: matchedLead.contact_name,
            reply_text:   replyText,
            reply_subject: subject,
          }),
        });
      } catch (e) {
        console.error('[reply-intake] Failed to trigger ceo-auditor:', e);
      }
    }

    processed.push({
      sender: senderEmail,
      subject,
      matched_lead: matchedLead?.company_name ?? 'unknown',
      log_id: logRow?.id,
    });
  }

  return NextResponse.json({ ok: true, agent: 'reply-intake', processed });
}
