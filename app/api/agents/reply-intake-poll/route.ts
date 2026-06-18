// ───────────────────────────────────────────────────────────────────────────
// ReplyIntakePoll  —  /api/agents/reply-intake-poll
// Cron: every 30 min  "*/30 * * * *"
//
// Polls hotellfountainbd@gmail.com via IMAP for unread emails from
// corporate_leads contacts. On match + confident attribution: logs inbound,
// updates lead status → 'replied', triggers CEOAuditor.
//
// ATTRIBUTION GUARD (added 2026-05-21): sender-email-only matching was
// flipping leads to 'replied' on unrelated inbound. Now we ALSO require the
// inbound subject to match (normalized) at least one outbound subject we
// previously sent to that lead. If subject doesn't match, we still log the
// inbound (annotated with [ATTRIBUTION_UNCERTAIN]) but DO NOT flip status or
// trigger the auditor.
//
// Auth: all DB ops via SECURITY DEFINER RPCs (anon key — no sb_secret_* needed)
// ───────────────────────────────────────────────────────────────────────────
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

// ── Supabase RPC helper ───────────────────────────────────────────────────
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

// Normalize an email subject for thread-matching:
//   "Re: Fwd: [External] Hello World" → "hello world"
// Handles nested prefixes (Re/Fwd/Fw/Aw/Antw/Sv/Tr) and [Tag] markers.
function normalizeSubject(s: string | undefined | null): string {
  let v = (s ?? '').toLowerCase().trim();
  let prev = '';
  while (prev !== v) {
    prev = v;
    v = v.replace(/^\s*(re|fwd|fw|aw|antw|sv|tr)\s*:\s*/i, '')
         .replace(/^\s*\[[^\]]+\]\s*/, '')
         .trim();
  }
  return v.replace(/\s+/g, ' ');
}

// Decide if an inbound message is a confident reply to a tracked thread for
// this lead. Returns { confident, reason }.
function checkAttribution(
  incomingSubject: string,
  outboundSubjects: Set<string>,
): { confident: boolean; reason: string } {
  const norm = normalizeSubject(incomingSubject);
  if (!norm) return { confident: false, reason: 'empty subject' };
  if (outboundSubjects.has(norm)) return { confident: true, reason: 'subject match' };
  // Permissive fallback: substring match either way (for cases where a
  // forwarder/auto-formatter mangles the subject slightly).
  for (const out of outboundSubjects) {
    if (!out) continue;
    if (out.includes(norm) || norm.includes(out)) {
      return { confident: true, reason: 'subject substring match' };
    }
  }
  return { confident: false, reason: 'no outbound thread matches inbound subject' };
}

async function runReplyPoll() {
  // Load all contactable lead emails for matching
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

  // Load outbound subjects per lead (for attribution validation)
  const outRes = await sbRpc('poll_get_outbound_subjects_by_lead', { p_tenant_id: TENANT });
  const outboundByLead = new Map<string, Set<string>>();
  if (outRes.ok) {
    const outRows = await outRes.json() as Array<{ lead_id: string; subject: string }>;
    for (const r of outRows ?? []) {
      const norm = normalizeSubject(r.subject);
      if (!norm) continue;
      const set = outboundByLead.get(r.lead_id) ?? new Set<string>();
      set.add(norm);
      outboundByLead.set(r.lead_id, set);
    }
  }

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

        // ATTRIBUTION GUARD: sender matches a lead, but verify this is a
        // reply to a thread WE initiated. Bug surfaced 2026-05-21 when DESCO
        // had multiple unrelated inbound rows attributed to it.
        const outboundSubjects = outboundByLead.get(lead.id) ?? new Set<string>();
        const attr = checkAttribution(subject, outboundSubjects);

        // Always log the inbound (so we don't lose data), but annotate
        // uncertain ones and DO NOT flip lead status or trigger auditor.
        let finalSubject: string = subject;
        let finalBody: string = bodyTrimmed;
        if (!attr.confident) {
          finalSubject = '[ATTRIBUTION_UNCERTAIN: ' + attr.reason + '] ' + subject;
          const note = '[Sender ' + fromAddr + ' matches lead ' + lead.company_name + ' but ' + attr.reason + '. Lead status NOT flipped, auditor NOT triggered. Review manually.]';
          finalBody = note + '\n\n' + bodyTrimmed;
        }

        // 1: Log inbound via SECURITY DEFINER RPC
        let logId: string | null = null;
        const logRes = await sbRpc('intake_log_inbound', {
          p_tenant_id: TENANT,
          p_lead_id:   lead.id,
          p_direction: 'inbound',
          p_channel:   'email',
          p_subject:   finalSubject,
          p_body:      finalBody,
          p_sent_at:   msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        });
        if (logRes.ok) {
          const logData = await logRes.json().catch(() => null);
          logId = typeof logData === 'string' ? logData : (logData as Record<string, string>)?.id ?? null;
        }

        if (attr.confident) {
          // 2: Mark lead as replied (only when attribution is confident)
          if (['pending', 'contacted'].includes(lead.status ?? '')) {
            await sbRpc('intake_mark_lead_replied', { p_lead_id: lead.id });
          }

          // 3: Trigger CEOAuditor (fire-and-forget)
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
        }

        toMark.push(msg.uid);
        processed.push({
          lead:               lead.company_name,
          from:               fromAddr,
          subject,
          log_id:             logId,
          status_was:         lead.status,
          attribution:        attr.confident ? 'confident' : 'uncertain',
          attribution_reason: attr.reason,
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
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
