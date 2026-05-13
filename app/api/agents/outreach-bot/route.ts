// ─────────────────────────────────────────────────────────────────────────────
// OutreachBot Agent  —  /api/agents/outreach-bot
// Cron: daily 9:00 AM BDT (3:00 AM UTC)
//
// Fetches pending leads → sends personalised Coffee Tour email via Brevo →
// logs to outreach_log → updates lead status to 'contacted'.
// Max 5 leads per run (Brevo free tier guard).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#07090E;border:1px solid rgba(200,169,110,.2)">

  <tr><td style="padding:36px 44px 24px;border-bottom:1px solid rgba(200,169,110,.12);text-align:center">
    <div style="font-size:24px;color:#EEE9E2;letter-spacing:.1em;font-weight:300">${HOTEL_NAME}</div>
    <div style="font-size:10px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-top:5px">${HOTEL_LOC}</div>
  </td></tr>

  <tr><td style="padding:36px 44px">
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">${greeting}</p>
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">
      I'm Shan, Operations Manager at <strong style="color:#EEE9E2">${HOTEL_NAME}</strong> — a boutique property in ${HOTEL_LOC}, 5 minutes from Hazrat Shahjalal International Airport.
    </p>
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">
      A number of companies similar to <strong style="color:#EEE9E2">${company}</strong>${titleLine} quietly use us for visiting engineers, overseas trainers, and inspection teams — mostly because we're close, billing is easy, and the experience is a step above the usual corporate hotel.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(200,169,110,.05);border:1px solid rgba(200,169,110,.15);margin:24px 0">
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2">✔ Airport pickup at any hour — 3 AM flights included</td></tr>
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">✔ Monthly corporate billing — no per-visit admin hassle</td></tr>
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">✔ Dedicated point of contact for your HR / admin team</td></tr>
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">✔ Quiet, well-appointed rooms designed for work trips</td></tr>
    </table>

    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">
      I'd love to invite you for a <strong style="color:#C8A96E">quick coffee and a look around the property</strong> — no formal presentation, just a conversation about whether we could be useful to ${company} whenever you have the need.
    </p>
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 28px">
      Any day this week or next works well. Just reply and I'll confirm a time.
    </p>

    <div style="border-top:1px solid rgba(200,169,110,.12);padding-top:24px">
      <div style="font-size:16px;color:#C8A96E;font-style:italic;margin-bottom:4px">Shan Ahmed</div>
      <div style="font-size:12px;color:#9A907C;line-height:1.7">Operations Manager · ${HOTEL_NAME}<br/>
      📍 ${HOTEL_ADDR}<br/>
      📞 ${HOTEL_PHONE} · <a href="mailto:${SENDER_EMAIL}" style="color:#C8A96E;text-decoration:none">${SENDER_EMAIL}</a></div>
    </div>
  </td></tr>

  <tr><td style="padding:18px 44px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
    <p style="font-size:10px;color:#5a5a4a;margin:0">${HOTEL_NAME} · ${HOTEL_ADDR} · ${SENDER_EMAIL}</p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

function buildOutreachText(company: string, contactName: string | null): string {
  const greeting = contactName ? `Dear ${contactName},` : 'Dear Sir/Madam,';
  return [
    greeting, '',
    `I'm Shan, Operations Manager at ${HOTEL_NAME} — a boutique property in ${HOTEL_LOC}, 5 minutes from Hazrat Shahjalal International Airport.`,
    '',
    `A number of companies similar to ${company} quietly use us for visiting engineers, overseas trainers, and inspection teams.`,
    '',
    `What we offer corporate clients:`,
    `✔ Airport pickup at any hour`,
    `✔ Monthly corporate billing`,
    `✔ Dedicated HR/admin point of contact`,
    `✔ Quiet rooms designed for work trips`,
    '',
    `I'd love to invite you for a quick coffee and a look around the property — no formal presentation, just a conversation.`,
    '',
    `Any day this week or next works. Just reply and I'll confirm a time.`,
    '',
    `Shan Ahmed`,
    `Operations Manager · ${HOTEL_NAME}`,
    HOTEL_ADDR,
    `${HOTEL_PHONE} · ${SENDER_EMAIL}`,
  ].join('\n');
}

async function runOutreachBot() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch pending leads that have an email address
  const { data: leads, error } = await supabase
    .from('corporate_leads')
    .select('*')
    .eq('tenant_id', TENANT)
    .eq('status', 'pending')
    .not('contact_email', 'is', null)
    .limit(MAX_PER_RUN * 3); // Fetch extra — JS sort below selects top MAX_PER_RUN

  if (error) return { ok: false, error: error.message };

  // Fix: .order('priority') is alphabetical (h<l<m), so 'high' sorts LAST.
  // Sort in JS instead: high=1, med=2, low=3.
  const PRIORITY_RANK: Record<string, number> = { high: 1, med: 2, low: 3 };
  const sorted = (leads ?? [])
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
    .slice(0, MAX_PER_RUN);

  const results: Array<Record<string, unknown>> = [];

  for (const lead of sorted) {
    try {
      const subject = `A 20-minute coffee + property tour — we're 5 min from ${lead.company_name}`;

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: SENDER_NAME, email: SENDER_EMAIL },
          to: [{ email: lead.contact_email, name: lead.contact_name ?? lead.company_name }],
          replyTo: { name: SENDER_NAME, email: SENDER_EMAIL },
          subject,
          htmlContent: buildOutreachHtml(lead.company_name, lead.contact_name, lead.contact_title),
          textContent: buildOutreachText(lead.company_name, lead.contact_name),
        }),
      });

      const ok = brevoRes.ok;
      const brevoData = await brevoRes.json().catch(() => ({}));

      await supabase.from('outreach_log').insert({
        tenant_id: TENANT,
        lead_id: lead.id,
        direction: 'outbound',
        channel: 'email',
        subject,
        body: buildOutreachText(lead.company_name, lead.contact_name),
        sent_at: new Date().toISOString(),
      });

      await supabase
        .from('corporate_leads')
        .update({
          status: ok ? 'contacted' : 'pending',
          last_contacted_at: ok ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id);

      results.push({ lead: lead.company_name, email: lead.contact_email, sent: ok, messageId: brevoData.messageId });
    } catch (e) {
      results.push({ lead: lead.company_name, error: String(e) });
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

// POST â CRM manual trigger (no auth required; CRM-internal use only)
export async function POST() {
  const result = await runOutreachBot();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
