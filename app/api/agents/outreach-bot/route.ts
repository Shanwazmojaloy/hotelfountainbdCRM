// ─────────────────────────────────────────────────────────────────────────────
// OutreachBot Agent  —  /api/agents/outreach-bot
// Cron: daily 9:00 AM BDT (3:00 AM UTC)
//
// Fetches pending leads → sends personalised Coffee Tour email via Brevo →
// logs to outreach_log → updates lead status to 'contacted'.
// Max 10 leads per run (Brevo free tier guard).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TENANT        = process.env.NEXT_PUBLIC_TENANT_ID    || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_NAME   = process.env.HOTEL_SENDER_NAME        || 'Shan Ahmed — Hotel Fountain BD';
const SENDER_EMAIL  = process.env.HOTEL_SENDER_EMAIL       || 'hotellfountainbd@gmail.com';
const HOTEL_NAME    = process.env.HOTEL_NAME               || 'Hotel Fountain BD';
const HOTEL_LOC     = process.env.HOTEL_LOCATION           || 'Nikunja 2 · Dhaka · Airport Corridor';
const HOTEL_ADDR    = process.env.HOTEL_ADDRESS            || 'House-05, Road-02, Nikunja-02, Dhaka-1229';
const HOTEL_PHONE   = process.env.HOTEL_PHONE              || '+880 1322-840799';
const MAX_PER_RUN   = 10;

function buildOutreachHtml(company: string, contactName: string | null, title: string | null): string {
  const greeting = contactName ? `Dear ${contactName},` : 'Dear Sir/Madam,';
  const titleLine = title ? ` — ${title}` : '';
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8"/></head>',
    '<body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">',
    '<tr><td align="center">',
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#07090E;border:1px solid rgba(200,169,110,.2)">',
    '<tr><td style="padding:36px 44px 24px;border-bottom:1px solid rgba(200,169,110,.12);text-align:center">',
    `<div style="font-size:24px;color:#EEE9E2;letter-spacing:.1em;font-weight:300">${HOTEL_NAME}</div>`,
    `<div style="font-size:10px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-top:5px">${HOTEL_LOC}</div>`,
    '</td></tr>',
    '<tr><td style="padding:36px 44px">',
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">${greeting}</p>`,
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">I'm Shan, Operations Manager at <strong style="color:#EEE9E2">${HOTEL_NAME}</strong> — a boutique property in ${HOTEL_LOC}, 5 minutes from Hazrat Shahjalal International Airport.</p>`,
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">A number of companies similar to <strong style="color:#EEE9E2">${company}</strong>${titleLine} quietly use us for visiting engineers, overseas trainers, and inspection teams.</p>`,
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(200,169,110,.05);border:1px solid rgba(200,169,110,.15);margin:24px 0">',
    '<tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2">Airport pickup at any hour</td></tr>',
    '<tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">Monthly corporate billing</td></tr>',
    '<tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">Dedicated HR/admin point of contact</td></tr>',
    '<tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">Quiet rooms designed for work trips</td></tr>',
    '</table>',
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">I would love to invite you for a quick coffee and a look around the property — no formal presentation, just a conversation about whether we could be useful to ${company}.</p>`,
    '<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 28px">Any day this week or next works well. Just reply and I will confirm a time.</p>',
    '<div style="border-top:1px solid rgba(200,169,110,.12);padding-top:24px">',
    '<div style="font-size:16px;color:#C8A96E;font-style:italic;margin-bottom:4px">Shan Ahmed</div>',
    `<div style="font-size:12px;color:#9A907C;line-height:1.7">Operations Manager · ${HOTEL_NAME}<br/>${HOTEL_ADDR}<br/>${HOTEL_PHONE} · ${SENDER_EMAIL}</div>`,
    '</div>',
    '</td></tr>',
    `<tr><td style="padding:18px 44px;border-top:1px solid rgba(200,169,110,.1);text-align:center"><p style="font-size:10px;color:#5a5a4a;margin:0">${HOTEL_NAME} · ${HOTEL_ADDR}</p></td></tr>`,
    '</table></td></tr></table>',
    '</body></html>',
  ].join('\n');
}

function buildOutreachText(company: string, contactName: string | null): string {
  const greeting = contactName ? `Dear ${contactName},` : 'Dear Sir/Madam,';
  return [
    greeting, '',
    `I'm Shan, Operations Manager at ${HOTEL_NAME} — a boutique property in ${HOTEL_LOC}, 5 minutes from Hazrat Shahjalal International Airport.`,
    '',
    `A number of companies similar to ${company} quietly use us for visiting engineers, overseas trainers, and inspection teams.`,
    '',
    'What we offer corporate clients:',
    'Airport pickup at any hour',
    'Monthly corporate billing',
    'Dedicated HR/admin point of contact',
    'Quiet rooms designed for work trips',
    '',
    'I would love to invite you for a quick coffee and a look around the property.',
    '',
    'Any day this week or next works. Just reply and I will confirm a time.',
    '',
    'Shan Ahmed',
    `Operations Manager · ${HOTEL_NAME}`,
    HOTEL_ADDR,
    `${HOTEL_PHONE} · ${SENDER_EMAIL}`,
  ].join('\n');
}

async function runOutreachBot() {
  const SB_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  // Use publishable (anon) key — tenant_read_leads RLS allows anon SELECT; write ops via SECURITY DEFINER RPCs.
  // Legacy JWT keys (eyJ…) were rotated 2026-05-01 and are now disabled in Supabase.
  // The sb_publishable_* key is intentionally public (NEXT_PUBLIC_ prefix) — safe to embed as fallback.
  const _rawKey   = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const SB_KEY    = _rawKey.startsWith('eyJ')
    ? 'sb_publishable_YVx6y5ai5WXlZZ9jhCLugQ_67DaIVsh'
    : (_rawKey || 'sb_publishable_YVx6y5ai5WXlZZ9jhCLugQ_67DaIVsh');
  if (!SB_KEY) return { ok: false, error: 'Env missing: NEXT_PUBLIC_SUPABASE_ANON_KEY' };
  const BREVO_KEY = (process.env.BREVO_API_KEY || '').trim();
  if (!BREVO_KEY) return { ok: false, error: 'Env missing: BREVO_API_KEY — add in Vercel dashboard' };

  const REST = `${SB_URL}/rest/v1`;
  const RPC  = `${SB_URL}/rest/v1/rpc`;
  const sbH: Record<string, string> = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  // Fetch pending leads via direct table REST query (avoids PostgREST schema-cache dependency).
  // tenant_read_leads RLS policy allows anon SELECT; filter by status+tenant here.
  const leadsRes = await fetch(
    `${REST}/corporate_leads?tenant_id=eq.${TENANT}&status=eq.pending&contact_email=not.is.null` +
    `&select=id,company_name,contact_name,contact_title,contact_email,priority` +
    `&order=priority.asc&limit=${MAX_PER_RUN}`,
    { headers: sbH }
  );
  if (!leadsRes.ok) {
    const txt = await leadsRes.text();
    let msg = txt;
    try { msg = (JSON.parse(txt) as { message?: string }).message || txt; } catch { /* use raw txt */ }
    return { ok: false, error: `Supabase ${leadsRes.status}: ${msg}` };
  }
  const leads: Record<string, unknown>[] = await leadsRes.json();
  const sorted = (leads ?? []).slice(0, MAX_PER_RUN);

  const results: Array<Record<string, unknown>> = [];

  for (const lead of sorted) {
    try {
      const company   = String(lead.company_name ?? '');
      const contact   = lead.contact_name  ? String(lead.contact_name)  : null;
      const title     = lead.contact_title ? String(lead.contact_title) : null;
      const email     = String(lead.contact_email ?? '');
      const subject   = `A 20-minute coffee + property tour — 5 min from ${company}`;

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender:  { name: SENDER_NAME,  email: SENDER_EMAIL },
          to:      [{ email, name: contact ?? company }],
          replyTo: { name: SENDER_NAME,  email: SENDER_EMAIL },
          subject,
          htmlContent: buildOutreachHtml(company, contact, title),
          textContent: buildOutreachText(company, contact),
        }),
      });

      const brevoData = await brevoRes.json().catch(() => ({})) as Record<string, unknown>;
      const ok = brevoRes.ok;

      if (brevoRes.status === 401) {
        return { ok: false, error: `Brevo auth failed: ${String(brevoData?.message ?? 'Invalid API key')} — check BREVO_API_KEY in Vercel` };
      }

      // Log via SECURITY DEFINER RPC
      await fetch(`${RPC}/outreach_log_entry`, {
        method: 'POST',
        headers: sbH,
        body: JSON.stringify({
          p_tenant_id: TENANT,
          p_lead_id:   lead.id,
          p_direction: 'outbound',
          p_channel:   'email',
          p_subject:   subject,
          p_body:      buildOutreachText(company, contact),
          p_sent_at:   new Date().toISOString(),
        }),
      });

      // Update status via SECURITY DEFINER RPC
      await fetch(`${RPC}/outreach_update_lead_status`, {
        method: 'POST',
        headers: sbH,
        body: JSON.stringify({
          p_lead_id:            lead.id,
          p_status:             ok ? 'contacted' : 'pending',
          p_last_contacted_at:  ok ? new Date().toISOString() : null,
        }),
      });

      results.push({ lead: company, email, sent: ok, messageId: brevoData.messageId });
    } catch (e) {
      results.push({ lead: String(lead.company_name ?? ''), error: String(e) });
    }
  }

  return {
    ok: true,
    agent: 'outreach-bot',
    processed: results.length,
    timestamp: new Date().toISOString(),
    results,
  };
}

// GET — Vercel cron (requires CRON_SECRET)
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runOutreachBot();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

// POST — CRM manual trigger (no auth required; CRM-internal use only)
export async function POST() {
  const result = await runOutreachBot();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
