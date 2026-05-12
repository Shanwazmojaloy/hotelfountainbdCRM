// ─────────────────────────────────────────────────────────────────────────────
// ReplyIntakePoll  —  /api/agents/reply-intake-poll
// Cron: every 30 min  "*/30 * * * *"
//
// Polls hotellfountainbd@gmail.com via IMAP for unread emails from
// corporate_leads contacts. On match: logs to outreach_log (inbound),
// updates lead status → 'replied', triggers CEOAuditor.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

async function runReplyPoll() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Load all lead emails for matching
  const { data: leads, error: leadsErr } = await supabase
    .from('corporate_leads')
    .select('id, company_name, contact_name, contact_email, status')
    .eq('tenant_id', TENANT)
    .not('contact_email', 'is', null);

  if (leadsErr) return { ok: false, error: leadsErr.message };

  const emailToLead = new Map(
    (leads ?? []).map(l => [l.contact_email.toLowerCase(), l])
  );

  // Dynamic import — imapflow is a CJS module
  const { ImapFlow } = await import('imapflow');

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  const processed: Array<Record<string, unknown>> = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Fetch all unread messages
      const messages = client.fetch({ seen: false }, {
        envelope: true,
        bodyStructure: true,
        bodyParts: ['text'],
        uid: true,
      });

      const toMark: number[] = [];

      for await (const msg of messages) {
        const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? '';
        const subject  = msg.envelope?.subject ?? '(no subject)';
        const lead     = emailToLead.get(fromAddr);

        if (!lead) continue; // Not a tracked lead — leave unread, skip

        // Extract plain-text body
        let body = '';
        for (const [, part] of msg.bodyParts ?? []) {
          body += part.toString();
        }

        // 1 — Log inbound message
        await supabase.from('outreach_log').insert({
          tenant_id: TENANT,
          lead_id:   lead.id,
          direction: 'inbound',
          channel:   'email',
          subject,
          body:      body.slice(0, 4000),
          sent_at:   msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        });

        // 2 — Advance lead status to 'replied' (only if not already further)
        if (['pending', 'contacted'].includes(lead.status)) {
          await supabase
            .from('corporate_leads')
            .update({ status: 'replied', updated_at: new Date().toISOString() })
            .eq('id', lead.id);
        }

        // 3 — Trigger CEOAuditor to review and draft a follow-up
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fountainbd.com';
        fetch(`${appUrl}/api/agents/ceo-auditor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger: 'reply_received',
            lead_id: lead.id,
            company: lead.company_name,
            subject,
            snippet: body.slice(0, 500),
          }),
        }).catch(() => {}); // fire-and-forget

        toMark.push(msg.uid);
        processed.push({
          lead: lead.company_name,
          from: fromAddr,
          subject,
          status_was: lead.status,
        });
      }

      // Mark matched emails as read
      if (toMark.length > 0) {
        await client.messageFlagsAdd({ uid: toMark }, ['\\Seen']);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return {
    ok: true,
    agent: 'reply-intake-poll',
    checked: 'hotellfountainbd@gmail.com',
    replies_processed: processed.length,
    timestamp: new Date().toISOString(),
    results: processed,
  };
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runReplyPoll();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runReplyPoll();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
