// ─────────────────────────────────────────────────────────────────────────────
// ReplyDigest  —  /api/agents/reply-digest
// Cron: daily 8:00 AM BDT (2:00 AM UTC)
//
// Queries corporate_leads for contacts that replied in the last 24 hours
// (status='replied', set by reply-intake-poll) → sends a formatted digest
// email to hotellfountainbd@gmail.com listing who replied, their company,
// title, message snippet, and suggested next action.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TENANT        = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_NAME   = process.env.HOTEL_SENDER_NAME     || 'Shan Ahmed — Hotel Fountain BD';
const SENDER_EMAIL  = process.env.HOTEL_SENDER_EMAIL    || 'hotellfountainbd@gmail.com';
const HOTEL_NAME    = process.env.HOTEL_NAME            || 'Hotel Fountain BD';
const DIGEST_TO     = process.env.HOTEL_SENDER_EMAIL    || 'hotellfountainbd@gmail.com';

interface ReplyRow {
  lead_id:       string;
  company_name:  string;
  contact_name:  string | null;
  contact_title: string | null;
  contact_email: string;
  replied_at:    string;
  message_body:  string | null;
}

function buildDigestHtml(replies: ReplyRow[], dateStr: string): string {
  const rows = replies.map((r, i) => {
    const name    = r.contact_name  || '—';
    const title   = r.contact_title || '—';
    const snippet = r.message_body
      ? r.message_body.replace(/<[^>]+>/g, '').slice(0, 220).trim() + (r.message_body.length > 220 ? '…' : '')
      : 'No message body captured.';
    const replyTime = new Date(r.replied_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'short', timeStyle: 'short' });

    return [
      `<tr style="border-top:${i === 0 ? 'none' : '1px solid rgba(200,169,110,.1)'}">`,
      `<td style="padding:20px 0">`,
      `<div style="font-size:15px;color:#C8A96E;font-weight:600;margin-bottom:2px">${r.company_name}</div>`,
      `<div style="font-size:12px;color:#9A907C;margin-bottom:10px">${name} · ${title} · <a href="mailto:${r.contact_email}" style="color:#9A907C">${r.contact_email}</a> · ${replyTime} BDT</div>`,
      `<div style="font-size:13px;color:#C8BFB0;line-height:1.7;background:rgba(200,169,110,.04);border-left:2px solid rgba(200,169,110,.3);padding:10px 14px;margin-bottom:10px">${snippet}</div>`,
      `<div style="font-size:11px;color:#6a6a5a;letter-spacing:.05em">→ <strong style="color:#EEE9E2">Next action:</strong> Reply directly and invite for a coffee tour this week.</div>`,
      `</td></tr>`,
    ].join('');
  }).join('');

  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8"/></head>',
    '<body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">',
    '<tr><td align="center">',
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#07090E;border:1px solid rgba(200,169,110,.2)">',
    '<tr><td style="padding:28px 44px 20px;border-bottom:1px solid rgba(200,169,110,.12)">',
    `<div style="font-size:11px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-bottom:6px">Daily Lead Digest · ${dateStr}</div>`,
    `<div style="font-size:22px;color:#EEE9E2;font-weight:300">${HOTEL_NAME}</div>`,
    `<div style="font-size:13px;color:#C8A96E;margin-top:6px">${replies.length} new repl${replies.length === 1 ? 'y' : 'ies'} in the last 24 hours</div>`,
    '</td></tr>',
    '<tr><td style="padding:24px 44px">',
    '<table width="100%" cellpadding="0" cellspacing="0">',
    rows,
    '</table>',
    '</td></tr>',
    '<tr><td style="padding:16px 44px;border-top:1px solid rgba(200,169,110,.1);text-align:center">',
    `<p style="font-size:10px;color:#5a5a4a;margin:0">Automated digest from ${HOTEL_NAME} CRM · Reply intake powered by OutreachBot</p>`,
    '</td></tr>',
    '</table></td></tr></table>',
    '</body></html>',
  ].join('\n');
}

function buildDigestText(replies: ReplyRow[], dateStr: string): string {
  const lines = [
    `${HOTEL_NAME} — Daily Lead Digest (${dateStr})`,
    `${replies.length} new repl${replies.length === 1 ? 'y' : 'ies'} in the last 24 hours`,
    '─────────────────────────────────────',
  ];
  replies.forEach((r, i) => {
    const snippet = r.message_body
      ? r.message_body.replace(/<[^>]+>/g, '').slice(0, 220).trim()
      : 'No message body captured.';
    lines.push(
      `\n${i + 1}. ${r.company_name}`,
      `   ${r.contact_name || '—'} · ${r.contact_title || '—'}`,
      `   ${r.contact_email}`,
      `   "${snippet}"`,
      `   → Reply and invite for coffee tour.`,
    );
  });
  return lines.join('\n');
}

async function runReplyDigest() {
  const SB_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  const SB_KEY    = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!SB_KEY) return { ok: false, error: 'Env missing: NEXT_PUBLIC_SUPABASE_ANON_KEY' };
  const BREVO_KEY = (process.env.BREVO_API_KEY || '').trim();
  if (!BREVO_KEY) return { ok: false, error: 'Env missing: BREVO_API_KEY' };

  const RPC = `${SB_URL}/rest/v1/rpc`;
  const sbH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  // Fetch recent replies
  const repliesRes = await fetch(`${RPC}/digest_get_recent_replies`, {
    method: 'POST', headers: sbH,
    body: JSON.stringify({ p_tenant_id: TENANT }),
  });
  if (!repliesRes.ok) {
    const txt = await repliesRes.text();
    return { ok: false, error: `Supabase ${repliesRes.status}: ${txt}` };
  }
  const replies: ReplyRow[] = await repliesRes.json();

  if (!replies?.length) {
    return { ok: true, agent: 'reply-digest', sent: false, message: 'No new replies in last 24h — no digest sent.' };
  }

  const dateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'long', year: 'numeric' });
  const subject = `[${HOTEL_NAME}] ${replies.length} new repl${replies.length === 1 ? 'y' : 'ies'} — ${dateStr}`;

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: `${HOTEL_NAME} CRM`, email: SENDER_EMAIL },
      to:          [{ email: DIGEST_TO, name: process.env.ALERT_NAME || 'Hotel Owner' }],
      subject,
      htmlContent: buildDigestHtml(replies, dateStr),
      textContent: buildDigestText(replies, dateStr),
    }),
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: false, error: `Brevo ${brevoRes.status}: ${String(err?.message ?? 'unknown')}` };
  }

  return {
    ok: true, agent: 'reply-digest',
    sent: true, replyCount: replies.length,
    digestTo: DIGEST_TO,
    companies: replies.map(r => r.company_name),
    timestamp: new Date().toISOString(),
  };
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runReplyDigest();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

export async function POST() {
  const result = await runReplyDigest();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
