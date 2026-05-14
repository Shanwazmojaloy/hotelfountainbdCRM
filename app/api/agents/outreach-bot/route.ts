// ─────────────────────────────────────────────────────────────────────────────
// OutreachBot Agent  —  /api/agents/outreach-bot
// Cron: daily 9:00 AM BDT (3:00 AM UTC)
//
// Fetches pending leads via SECURITY DEFINER RPC → sends personalised Coffee
// Tour email via Brevo → logs to outreach_log → updates lead status to 'contacted'.
// Max 10 leads per run (Brevo free tier guard).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTenantFromHeaders } from '@/lib/tenant';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PER_RUN = 10;

// Build functions now accept tenant config instead of reading module-level constants
function buildOutreachHtml(
  company: string, contactName: string | null, title: string | null,
  cfg: { hotel_name: string; hotel_location: string; hotel_address: string; hotel_phone: string; hotel_email: string; sender_name: string }
): string {
  const greeting   = contactName ? `Dear ${contactName},` : 'Dear Sir/Madam,';
  const titleLine  = title ? ` — ${title}` : '';
  const contactFirst = cfg.sender_name.split(' — ')[0];
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8"/></head>',
    '<body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">',
    '<tr><td align="center">',
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#07090E;border:1px solid rgba(200,169,110,.2)">',
    '<tr><td style="padding:36px 44px 24px;border-bottom:1px solid rgba(200,169,110,.12);text-align:center">',
    `<div style="font-size:24px;color:#EEE9E2;letter-spacing:.1em;font-weight:300">${cfg.hotel_name}</div>`,
    `<div style="font-size:10px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-top:5px">${cfg.hotel_location}</div>`,
    '</td></tr>',
    '<tr><td style="padding:36px 44px">',
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">${greeting}</p>`,
    `<p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">I'm ${contactFirst}, Operations Manager at <strong style="color:#EEE9E2">${cfg.hotel_name}</strong> — a boutique property in ${cfg.hotel_location}, 5 minutes from Hazrat Shahjalal International Airport.</p>`,
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
    `<div style="font-size:16px;color:#C8A96E;font-style:italic;margin-bottom:4px">${contactFirst}</div>`,
    `<div style="font-size:12px;color:#9A907C;line-height:1.7">Operations Manager · ${cfg.hotel_name}<br/>${cfg.hotel_address}<br/>${cfg.hotel_phone} · ${cfg.hotel_email}</div>`,
    '</div>',
    '</td></tr>',
    `<tr><td style="padding:18px 44px;border-top:1px solid rgba(200,169,110,.1);text-align:center"><p style="font-size:10px;color:#5a5a4a;margin:0">${cfg.hotel_name} · ${cfg.hotel_address}</p></td></tr>`,
    '</table></td></tr></table>',
    '</body></html>',
  ].join('\n');
}

function buildOutreachText(
  company: string, contactName: string | null,
  cfg: { hotel_name: string; hotel_location: string; hotel_address: string; hotel_phone: string; hotel_email: string; sender_name: string }
): string {
  const greeting     = contactName ? `Dear ${contactName},` : 'Dear Sir/Madam,';
  const contactFirst = cfg.sender_name.split(' — ')[0];
  return [
    greeting, '',
    `I'm ${contactFirst}, Operations Manager at ${cfg.hotel_name} — a boutique property in ${cfg.hotel_location}, 5 minutes from Hazrat Shahjalal International Airport.`,
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
    contactFirst,
    `Operations Manager · ${cfg.hotel_name}`,
    cfg.hotel_address,
    `${cfg.hotel_phone} · ${cfg.hotel_email}`,
  ].join('\n');
}

async function runOutreachBot(req: NextRequest) {
  // ── Resolve tenant from subdomain ────────────────────────────────────────
  const tenant = await getTenantFromHeaders(req.headers);

  const SB_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  // Use publishable (anon) key — all write ops via SECURITY DEFINER RPCs.
  // Legacy JWT keys (eyJ...) were rotated 2026-05-01 and are now disabled in Supabase.
  const _rawKey   = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const SB_KEY    = _rawKey.startsWith('eyJ')
    ? 'sb_publishable_YVx6y5ai5WXlZZ9jhCLugQ_67DaIVsh'
    : (_rawKey || 'sb_publishable_YVx6y5ai5WXlZZ9jhCLugQ_67DaIVsh');
  const BREVO_KEY = (tenant.brevo_api_key || process.env.BREVO_API_KEY || '').trim();
  if (!BREVO_KEY) return { ok: false, error: 'Env missing: BREVO_API_KEY — add in Vercel dashboard or tenants table' };

  const RPC = `${SB_URL}/rest/v1/rpc`;
  const sbH: Record<string, string> = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  // Fetch pending leads via SECURITY DEFINER RPC (bypasses RLS/key issues entirely).
  const leadsRes = await fetch(`${RPC}/outreach_get_pending_leads`, {
    method: 'POST',
    headers: sbH,
    body: JSON.stringify({ p_tenant_id: tenant.id, p_limit: MAX_PER_RUN }),
  });
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
          sender:  { name: tenant.sender_name, email: tenant.hotel_email },
          to:      [{ email, name: contact ?? company }],
          replyTo: { name: tenant.sender_name, email: tenant.hotel_email },
          subject,
          htmlContent: buildOutreachHtml(company, contact, title, tenant),
          textContent: buildOutreachText(company, contact, tenant),
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
          p_tenant_id: tenant.id,
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
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runOutreachBot(req);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

// POST — CRM manual trigger (no auth required; CRM-internal use only)
export async function POST(req: NextRequest) {
  const result = await runOutreachBot(req);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
