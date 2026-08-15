// wf-flash-nudge — Hotel Fountain
// Fires after the 11:00 UTC flash-sale check. If today's FLASH_SALE post is still
// unposted, emails the owner the ready-to-post WhatsApp text (BN + EN).
// Auth: Authorization: Bearer <internal_cron_token> (vault), same pattern as outreach-bot.
// Dedupe: max one nudge per trigger_date via notifications_log workflow='flash-nudge'.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
const JSON_HEADERS = { 'Content-Type': 'application/json' }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS })
  const sb = createClient(SB_URL, SB_KEY)

  // custom auth against vault internal_cron_token
  const { data: token } = await sb.rpc('vault_secret', { secret_name: 'internal_cron_token' })
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim()
  if (!token || auth !== token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })

  const today = new Date().toISOString().substring(0, 10)

  // today's unposted flash post
  const { data: post } = await sb.from('social_content_queue')
    .select('id, body_bn, body_en, rooms_available, scheduled_for, posted')
    .eq('content_type', 'FLASH_SALE').eq('scheduled_for', today).eq('posted', false)
    .limit(1).maybeSingle()
  if (!post) return new Response(JSON.stringify({ ok: true, action: 'nothing_to_nudge' }), { headers: JSON_HEADERS })

  // dedupe: one nudge per day
  const { data: already } = await sb.from('notifications_log').select('id')
    .eq('workflow', 'flash-nudge').gte('created_at', today + 'T00:00:00Z').limit(1)
  if (already && already.length) return new Response(JSON.stringify({ ok: true, action: 'already_nudged' }), { headers: JSON_HEADERS })

  const { data: cfg } = await sb.from('manus_config').select('key,value')
  const config = Object.fromEntries((cfg || []).map((r: { key: string; value: string }) => [r.key, r.value]))
  const ownerEmail = config.owner_email || 'ahmedshanwaz5@gmail.com'

  const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#07090E;font-family:Helvetica,Arial,sans-serif;">\n<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#0D1117;border:1px solid rgba(200,169,110,.15);">\n<tr><td style="padding:28px 36px;">\n<div style="font-family:Georgia,serif;font-size:22px;color:#C8A96E;">Hotel <em>Fountain</em></div>\n<div style="font-size:9px;color:#4A4538;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">Flash Sale — Not Posted Yet</div>\n<div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,.4),transparent);margin:16px 0;"></div>\n<div style="font-size:13px;color:#8A8070;line-height:1.8;">A flash sale triggered today (${post.rooms_available} rooms empty) but the WhatsApp/Facebook post has <strong style=\"color:#EEE9E2;\">not gone out</strong>. Copy-paste below and post now — conversions are only tracked once it is marked posted.</div>\n<div style="background:rgba(200,169,110,.05);border:1px solid rgba(200,169,110,.15);padding:16px 18px;margin:18px 0;font-size:13px;color:#EEE9E2;white-space:pre-wrap;font-family:'IBM Plex Mono',monospace;">${esc(post.body_bn)}</div>\n<div style="background:rgba(200,169,110,.05);border:1px solid rgba(200,169,110,.15);padding:16px 18px;margin-bottom:18px;font-size:13px;color:#EEE9E2;white-space:pre-wrap;font-family:'IBM Plex Mono',monospace;">${esc(post.body_en)}</div>\n<div style="font-size:11px;color:#4A4538;line-height:1.8;">After posting, mark it done so attribution starts:<br/><span style=\"font-family:monospace;color:#8A8070;\">update social_content_queue set posted=true where id='${post.id}';</span></div>\n</td></tr></table></body></html>`

  // send via Resend (same key path as send-email)
  const envKey = Deno.env.get('RESEND_API_KEY')
  let resendKey = envKey
  if (!resendKey) {
    const { data: k } = await sb.rpc('vault_secret', { secret_name: 'RESEND_API_KEY' })
    resendKey = k
  }
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not found' }), { status: 500, headers: JSON_HEADERS })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Hotel Fountain <onboarding@resend.dev>', to: [ownerEmail], subject: `⚡ Flash sale triggered — post not sent yet (${post.rooms_available} rooms)`, html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })
  })
  const data = await res.json()

  await sb.from('notifications_log').insert({
    tenant_id: TENANT, workflow: 'flash-nudge', recipient_email: ownerEmail,
    subject: 'Flash sale unposted nudge', body: `Nudge for social_content_queue ${post.id} (${post.rooms_available} rooms)`,
    status: res.ok ? 'sent' : 'failed', error_msg: res.ok ? null : (data.message || JSON.stringify(data)),
    triggered_by: 'cron:wf-flash-nudge'
  })

  return new Response(JSON.stringify({ ok: res.ok, action: res.ok ? 'nudged' : 'send_failed', email_id: data.id ?? null }), { status: res.ok ? 200 : 500, headers: JSON_HEADERS })
})
