// ─────────────────────────────────────────────────────────────────────────────
// ReplyIntakePoll  —  /api/agents/reply-intake-poll
// Cron: every 30 min  "*/30 * * * *"
//
// Polls hotellfountainbd@gmail.com via IMAP for unread emails from
// corporate_leads contacts. On match: logs to outreach_log (inbound),
// updates lead status → 'replied', triggers CEOAuditor.
//
// Auth: all DB ops via SECURITY DEFINER RPCs (anon key — no sb_secret_* needed)
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

interface LeadRow {
  id:            string;
  company_name:  string;
  contact_name?: string;
  contact_email: string;
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

async function runReplyPoll() {
  // ── Load all contactable lead emails for matching ─────────────────────────
  const leadsRes = await sbRpc('poll_get_contactable_leads', { p_tenant_id: TENANT });
  if (!leadsRes.ok) {
    const txt = await leadsRes.text();
    return { ok: false, error: `Supabase ${leadsRes.status}: ${txt}` };
  }
  const leads = await leadsRes.json() as LeadRow[];

  const emailToLead = new Map(
    (leads ?? [])
      .filter(l => l.contact_email)
      .map(l => [l.contact_email.toLowerCase(), l])
  );

  // ── Dynamic import — imapflow is a CJS module ─────────────────────────────
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

        if (!lead) continue; // Not a tracked lead — leave unread

        // Extract plain-text body
        let body = '';
        for (const [, part] of msg.bodyParts ?? []) {
          body += part.toString();
        }
        const bodyTrimmed = body.slice(0, 4000);

        // ── 1: Log inbound via SECURITY DEFINER RPC ───────────────────────
        let logId: string | null = null;
        const logRes = await sbRpc('intake_log_inbound', {
          p_tenant_id: TENANT,
          p_lead_id:   lead.id,
          p_direction: 'inbound',
          p_channel:   'email',
          p_subject:   subject,
          p_body:      bodyTrimmed,
          p_sent_at:   msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        });
        if (logRes.ok) {
          const logData = await logRes.json().catch(() => null);
          logId = typeof logData === 'string' ? logData : (logData as Record<string, string>)?.id ?? null;
        }

        // ── 2: Mark lead as replied via SECURITY DEFINER RPC ─────────────
        if (['pending', 'contacted'].includes(lead.status ?? '')) {
          await sbRpc('intake_mark_lead_replied', { p_lead_id: lead.id });
        }

        // ── 3: Trigger CEOAuditor (fire-and-forget) ───────────────────────
        if (logId) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fountainbd.com';
          fetch(`${appUrl}/api/agents/ceo-auditor`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({
              log_id:        logId,
              lead_id:       lead.id,
              company_name:  lead.company_name,
              contact_name:  lead.contact_name,
              reply_text:    bodyTrimmed,
              reply_subject: subject,
            }),
          }).catch(() => {});
        }

        toMark.push(msg.uid);
        processed.push({
          lead:       lead.company_name,
          from:       fromAddr,
          subject,
          log_id:     logId,
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

// GET — Vercel cron (requires CRON_SECRET)
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

// POST — manual trigger
export async function POST(req: Request) {
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
