// lead-reply-alert — emails the owner a digest of corporate leads that REPLIED to outreach.
// Created 2026-06-09 for the reply-watcher pipeline. verify_jwt=true (call with anon/publishable key as Bearer).
// Body: { leads: [{ company, contact?, email?, replied_at?, snippet? }], to? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json' };

function esc(s: unknown): string { return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!)); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(SB_URL, SB_KEY);
    const body = await req.json().catch(() => ({}));
    const leads: Array<Record<string, unknown>> = Array.isArray(body.leads) ? body.leads : [];
    if (leads.length === 0) return new Response(JSON.stringify({ ok: true, skipped: 'no leads' }), { headers: CORS });

    let to = body.to as string | undefined;
    if (!to) {
      const { data: cfg } = await sb.from('manus_config').select('key,value').eq('key', 'owner_email').maybeSingle();
      to = (cfg?.value as string) || 'ahmedshanwaz5@gmail.com';
    }

    const rows = leads.map((l) => `
      <tr><td style="padding:14px 18px;border-bottom:1px solid #EEE9E2;">
        <div style="font-size:15px;font-weight:700;color:#1A1816;">${esc(l.company)}</div>
        ${l.contact ? `<div style="font-size:12px;color:#888;margin-top:2px;">${esc(l.contact)}</div>` : ''}
        ${l.email ? `<div style="font-size:12px;color:#C5A059;margin-top:2px;">${esc(l.email)}</div>` : ''}
        ${l.snippet ? `<div style="font-size:13px;color:#2D2A26;margin-top:8px;white-space:pre-wrap;">“${esc(l.snippet)}”</div>` : ''}
        ${l.replied_at ? `<div style="font-size:11px;color:#aaa;margin-top:6px;">replied ${esc(l.replied_at)}</div>` : ''}
      </td></tr>`).join('');

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#F9F7F2;margin:0;padding:20px;">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
<div style="background:#1A1816;color:#C5A059;padding:22px 24px;"><div style="font-family:Georgia,serif;font-size:20px;">🏨 Hotel Fountain BD — Lead Replies</div>
<div style="color:#888;font-size:13px;margin-top:4px;">${leads.length} corporate lead${leads.length === 1 ? '' : 's'} replied to outreach — ready for you to take over.</div></div>
<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<div style="padding:18px 24px;"><a href="https://lumea.fountainbd.com/crm" style="display:inline-block;background:#C5A059;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">→ Open Lumea CRM</a></div>
<div style="background:#F4F1EA;padding:14px 24px;font-size:11px;color:#888;">Automated by the reply-watcher · Lumea CRM · these leads are now status ‘replied’.</div>
</div></body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Lumea CRM <onboarding@resend.dev>', to: [to], subject: `🔔 ${leads.length} lead repl${leads.length === 1 ? 'y' : 'ies'} — Hotel Fountain outreach`, html })
    });
    const data = await res.json();
    await sb.from('notifications_log').insert({ workflow: 'lead-reply-alert', recipient_email: to, subject: 'Lead replies digest', body: `${leads.length} replies`, status: res.ok ? 'sent' : 'failed', error_msg: res.ok ? null : JSON.stringify(data), metadata: { count: leads.length, email_id: data.id }, tenant_id: TENANT }).catch(() => {});
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: data }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({ ok: true, id: data.id, notified: to, count: leads.length }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: CORS });
  }
});
