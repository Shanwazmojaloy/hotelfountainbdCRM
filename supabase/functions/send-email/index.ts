// SHARED EMAIL SENDER — Hotel Fountain
// Uses Resend onboarding domain until hotelfountain.com is verified
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

// Sender: use resend.dev until hotelfountain.com domain is verified in Resend dashboard
const FROM_REPORTS  = 'Hotel Fountain <onboarding@resend.dev>'
const FROM_GUEST    = 'Hotel Fountain <onboarding@resend.dev>'

async function getResendKey(): Promise<string> {
  const envKey = Deno.env.get('RESEND_API_KEY')
  if (envKey) return envKey
  const sb = createClient(SB_URL, SB_KEY)
  const { data } = await sb.rpc('vault_secret', { secret_name: 'RESEND_API_KEY' })
  if (data) return data
  throw new Error('RESEND_API_KEY not found')
}

export async function sendEmail(
  to: string, subject: string, html: string,
  fromOverride?: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = await getResendKey()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromOverride || FROM_REPORTS,
      to: [to],
      subject,
      html,
      text: html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
    })
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.message || JSON.stringify(data) }
  return { ok: true, id: data.id }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sb = createClient(SB_URL, SB_KEY)
  const body = await req.json().catch(() => ({}))

  if (body.test === true) {
    const { data: cfg } = await sb.from('manus_config').select('key,value')
    const config = Object.fromEntries((cfg||[]).map((r:{key:string,value:string}) => [r.key, r.value]))
    const ownerEmail = config.owner_email || 'ahmedshanwaz5@gmail.com'

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07090E;padding:24px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);padding:28px 36px 0;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#C8A96E;">Hotel <em>Fountain</em></div>
    <div style="font-size:8px;color:#4A4538;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">System Confirmation</div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,.4),transparent);margin-top:16px;"></div>
  </td></tr>
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:32px 36px;">
    <div style="font-family:Georgia,serif;font-size:24px;color:#EEE9E2;margin-bottom:12px;">Email System <em style="color:#3FB950;">Active</em></div>
    <div style="font-size:13px;color:#8A8070;line-height:1.9;margin-bottom:24px;">All Manus workflow emails are now fully configured and operational for Hotel Fountain CRM.</div>
    <div style="background:rgba(63,185,80,.06);border:1px solid rgba(63,185,80,.2);padding:18px 20px;margin-bottom:20px;">
      <div style="font-size:11px;color:#3FB950;font-weight:500;letter-spacing:.06em;margin-bottom:10px;">✓ CONFIGURATION</div>
      <table cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0;font-size:12px;color:#4A4538;width:140px;">Owner Email</td><td style="padding:4px 0;font-size:12px;color:#EEE9E2;">${ownerEmail}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#4A4538;">Hotel Phone</td><td style="padding:4px 0;font-size:12px;color:#EEE9E2;">${config.hotel_phone}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#4A4538;">Review Link</td><td style="padding:4px 0;font-size:12px;color:#C8A96E;">Configured ✓</td></tr></table>
    </div>
    <div style="background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.1);padding:18px 20px;margin-bottom:24px;">
      <div style="font-size:11px;color:#C8A96E;letter-spacing:.1em;margin-bottom:10px;font-weight:500;">ACTIVE WORKFLOWS</div>
      <div style="font-size:11px;color:#8A8070;line-height:2;">
        ▦ WF1 &nbsp;Morning Briefing &mdash; 7:00 AM daily<br/>
        ▦ WF2 &nbsp;Checkout Reminder &mdash; 10:30 AM daily<br/>
        ▦ WF3 &nbsp;Overdue Alert &mdash; 12:30 PM daily<br/>
        ▦ WF4 &nbsp;Evening Revenue Report &mdash; 9:00 PM daily<br/>
        ▦ WF5 &nbsp;Weekly Summary &mdash; Every Monday 8:00 AM<br/>
        ▦ WF6 &nbsp;Monthly P&amp;L Report &mdash; 1st of every month<br/>
        ▦ WF8 &nbsp;Booking Confirmation &mdash; On reservation create<br/>
        ▦ WF9 &nbsp;Post-Stay Review Request &mdash; On checkout
      </div>
    </div>
    <a href="https://hotelfountainbd.vercel.app" style="display:inline-block;background:#C8A96E;color:#07090E;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:12px 28px;text-decoration:none;font-weight:400;">Open CRM Dashboard →</a>
  </td></tr>
  <tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:16px 36px;">
    <div style="font-size:10px;color:#4A4538;">Hotel Fountain &middot; Lumea CRM &middot; Manus Email System</div>
  </td></tr>
</table></td></tr></table></body></html>`

    const result = await sendEmail(ownerEmail, '✅ Hotel Fountain CRM — Email System Active', html)
    await sb.from('notifications_log').insert({ workflow:'system-test', recipient_email:ownerEmail, subject:'Email System Test', body:'System test email', status:result.ok?'sent':'failed', error_msg:result.error, metadata:{test:true,email_id:result.id}, tenant_id:'46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8' })
    return new Response(JSON.stringify({ success:result.ok, email_id:result.id, sent_to:ownerEmail, error:result.error }), { headers: CORS })
  }

  const { data: cfg } = await sb.from('manus_config').select('key,value')
  const config = Object.fromEntries((cfg||[]).map((r:{key:string,value:string}) => [r.key, r.value]))
  return new Response(JSON.stringify({ status:'ready', owner_email:config.owner_email, hotel_phone:config.hotel_phone }), { headers: CORS })
})
