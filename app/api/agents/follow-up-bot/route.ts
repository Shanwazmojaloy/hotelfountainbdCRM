// ─────────────────────────────────────────────────────────────────────────────
// FollowUpBot  —  /api/agents/follow-up-bot
// Cron: daily 10:00 AM BDT (4:00 AM UTC)
//
// Finds leads contacted 3–7 days ago (status='contacted', <2 outbound emails)
// → sends a short warm follow-up via Brevo
// → logs to outreach_log → updates last_contacted_at
// Max 10 leads per run.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TENANT       = process.env.NEXT_PUBLIC_TENANT_ID    || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_NAME  = process.env.HOTEL_SENDER_NAME        || 'Shan Ahmed — Hotel Fountain BD';
const SENDER_EMAIL = process.env.HOTEL_SENDER_EMAIL       || 'hotellfountainbd@gmail.com';
const HOTEL_NAME   = process.env.HOTEL_NAME               || 'Hotel Fountain BD';
const HOTEL_LOC    = process.env.HOTEL_LOCATION           || 'Nikunja 2 · Dhaka · Airport Corridor';
const HOTEL_PHONE  = process.env.HOTEL_PHONE              || '+880 1322-840799';
const HOTEL_ADDR   = process.env.HOTEL_ADDRESS            || 'House-05, Road-02, Nikunja-02, Dhaka-1229';
const CONTACT_NAME = process.env.HOTEL_CONTACT_NAME       || (process.env.HOTEL_SENDER_NAME || 'Shan Ahmed — Hotel Fountain BD').split(' — ')[0];
const MAX_PER_RUN  = 10;

function buildFollowUpHtml(company: string, contactName: string | null): string {
  const greeting = contactName ? `Hi ${contactName},` : 'Hi,';
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8"/></head>',
    '<body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">',
    '<tr><td align="center">',
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#07090E;border:1px solid rgba(200,169,110,.2)">',
    '<tr><td style="padding:28px 44px 18px;border-bottom:1px solid rgba(200,169,110,.12);text-align:center">',
    `<div style="font-size:20px;color:#EEE9E2;letter-spacing:.1em;font-weight:300">${HOTEL_NAME}</div>`,
    `<div style="font-size:10px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-top:4px">${HOTEL_LOC}</div>`,
    '</td></tr>',
    '<tr><td style="padding:32px 44px">',
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 18px">${greeting}</p>`,
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 18px">I sent a note last week about hosting visiting staff from <strong style="color:#EEE9E2">${company}</strong> at ${HOTEL_NAME} — 5 minutes from Hazrat Shahjalal Airport.</p>`,
    '<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 18px">Wanted to follow up in case it got buried. We have rooms available this week and next, and I\'d be glad to arrange a quick 20-minute walk-through whenever suits you.</p>',
    '<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 28px">Just reply with a day that works and I\'ll confirm immediately.</p>',
    '<div style="border-top:1px solid rgba(200,169,110,.12);padding-top:20px">',
    `<div style="font-size:15px;color:#C8A96E;font-style:italic;margin-bottom:4px">${CONTACT_NAME}</div>`,
    `<div style="font-size:12px;color:#9A907C;line-height:1.7">Operations Manager · ${HOTEL_NAME}<br/>${HOTEL_PHONE} · ${SENDER_EMAIL}</div>`,
    '</div>',
    '</td></tr>',
    `<tr><td style="padding:14px 44px;border-top:1px solid rgba(200,169,110,.1);text-align:center"><p style="font-size:10px;color:#5a5a4a;margin:0">${HOTEL_NAME} · ${HOTEL_ADDR}</p></td></tr>`,
    '</table></td></tr></table>',
    '</body></html>',
  ].join('\n');
}

function buildFollowUpText(company: string, contactName: string | null): string {
  const greeting = contactName ? `Hi ${contactName},` : 'Hi,';
  return [
    greeting, '',
    `I sent a note last week about hosting visiting staff from ${company} at ${HOTEL_NAME} — 5 minutes from Hazrat Shahjalal Airport.`,
    '',
    "Wanted to follow up in case it got buried. We have rooms available this week and next, and I'd be glad to arrange a quick 20-minute walk-through whenever suits you.",
    '',
    "Just reply with a day that works and I'll confirm immediately.",
    '',
    CONTACT_NAME,
    `Operations Manager · ${HOTEL_NAME}`,
    `${HOTEL_PHONE} · ${SENDER_EMAIL}`,
  ].join('\n');
}

async function runFollowUpBot() {
  const SB_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  const SB_KEY    = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!SB_KEY) return { ok: false, error: 'Env missing: NEXT_PUBLIC_SUPABASE_ANON_KEY' };
  const BREVO_KEY = (process.env.BREVO_API_KEY || '').trim();
  if (!BREVO_KEY) return { ok: false, error: 'Env missing: BREVO_API_KEY' };

  const RPC = `${SB_URL}/rest/v1/rpc`;
  const sbH: Record<string, string> = {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
  };

  // Fetch eligible leads via SECURITY DEFINER RPC
  const eligibleRes = await fetch(`${RPC}/followup_get_eligible_leads`, {
    method: 'POST', headers: sbH,
    body: JSON.stringify({ p_tenant_id: TENANT, p_limit: MAX_PER_RUN }),
  });
  if (!eligibleRes.ok) {
    const txt = await eligibleRes.text();
    return { ok: false, error: `Supabase ${eligibleRes.status}: ${txt}` };
  }
  const leads: Record<string, unknown>[] = await eligibleRes.json();
  if (!leads?.length) return { ok: true, agent: 'follow-up-bot', processed: 0, message: 'No eligible leads for follow-up today.' };

  const results: Array<Record<string, unknown>> = [];

  for (const lead of leads) {
    try {
      const company = String(lead.company_name ?? '');
      const contact = lead.contact_name ? String(lead.contact_name) : null;
      const email   = String(lead.contact_email ?? '');
      const subject = `Re: Coffee tour at ${HOTEL_NAME} — still open this week?`;

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender:      { name: SENDER_NAME, email: SENDER_EMAIL },
          to:          [{ email, name: contact ?? company }],
          replyTo:     { name: SENDER_NAME, email: SENDER_EMAIL },
          subject,
          htmlContent: buildFollowUpHtml(company, contact),
          textContent: buildFollowUpText(company, contact),
        }),
      });

      const brevoData = await brevoRes.json().catch(() => ({})) as Record<string, unknown>;
      const ok = brevoRes.ok;

      if (brevoRes.status === 401) {
        return { ok: false, error: `Brevo auth failed: check BREVO_API_KEY in Vercel` };
      }

      // Log outbound
      await fetch(`${RPC}/outreach_log_entry`, {
        method: 'POST', headers: sbH,
        body: JSON.stringify({
          p_tenant_id: TENANT, p_lead_id: lead.id, p_direction: 'outbound',
          p_channel: 'email', p_subject: subject,
          p_body: buildFollowUpText(company, contact),
          p_sent_at: new Date().toISOString(),
        }),
      });

      // Update last_contacted_at only (keep status = 'contacted')
      await fetch(`${RPC}/outreach_update_lead_status`, {
        method: 'POST', headers: sbH,
        body: JSON.stringify({
          p_lead_id: lead.id,
          p_status: ok ? 'contacted' : 'contacted',
          p_last_contacted_at: ok ? new Date().toISOString() : null,
        }),
      });

      results.push({ lead: company, email, sent: ok, messageId: brevoData.messageId });
    } catch (e) {
      results.push({ lead: String(lead.company_name ?? ''), error: String(e) });
    }
  }

  return {
    ok: true, agent: 'follow-up-bot',
    processed: results.length,
    timestamp: new Date().toISOString(),
    results,
  };
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runFollowUpBot();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

export async function POST() {
  const result = await runFollowUpBot();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
