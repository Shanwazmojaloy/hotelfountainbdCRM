// WORKFLOW 2+3 — Checkout Reminders + Overdue Alert
// WF2: 10:30 AM Dhaka — remind owner of guests checking out today
// WF3: 12:30 PM Dhaka — alert owner of overdue checkouts
//
// Sender switched from Brevo to Resend (2026-07-03): the Brevo account has
// been rejecting every send since at least 2026-06-28 with "SMTP account is
// not yet activated" (permission_denied) — an account-level restriction, not
// a code bug. Resend is already the working sender for the shared send-email
// function; this mirrors that pattern. NOTE: recipients here are always the
// owner's own inbox (config.owner_email), so Resend's shared onboarding
// domain (onboarding@resend.dev) is sufficient — unlike guest-facing sends
// (e.g. booking-confirmation), which need a verified custom domain and were
// NOT touched by this change.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json' }
const FROM_ADDR = 'Hotel Fountain <onboarding@resend.dev>'

function dhakaDateStr(): string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}

async function getResendKey(sb: any): Promise<string> {
  const envKey = Deno.env.get('RESEND_API_KEY')
  if (envKey) return envKey
  const { data } = await sb.rpc('vault_secret', { secret_name: 'RESEND_API_KEY' })
  if (data) return data
  throw new Error('RESEND_API_KEY not found')
}

async function sendEmail(sb: any, to: string, subject: string, html: string) {
  let key: string
  try {
    key = await getResendKey(sb)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDR,
      to: [to],
      subject,
      html,
      text: html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),
    })
  })
  let d: any = {}
  try { d = await r.json() } catch (_e) { d = { raw: await r.text().catch(()=>'non-JSON response') } }
  return r.ok ? { ok:true, id: d.id } : { ok:false, error: d.message || JSON.stringify(d) }
}

async function logWorkflowRun(sb: any, workflowName: string, status: string, records: number, errorMsg?: string) {
  // NOTE: the supabase-js query builder is thenable but does not implement
  // .catch()/.finally() as real Promise methods — chaining .catch() on it
  // throws synchronously ("...insert(...).catch is not a function"). That
  // throw was propagating out of every call site and turning otherwise-
  // successful runs (email sent, DB logged) into a 500 response. Use a
  // real try/catch instead.
  try {
    await sb.from('workflow_runs').insert({
      workflow_name: workflowName,
      status,
      records_processed: records,
      error_msg: errorMsg || null,
      tenant_id: TENANT
    })
  } catch { /* non-fatal */ }
}

Deno.serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response('ok',{headers:CORS})
  try {
  const sb = createClient(SB_URL, SB_KEY)
  const body = await req.json().catch(()=>({}))
  const mode = body.mode || 'reminder'

  const {data:cfg} = await sb.from('manus_config').select('key,value')
  const config = Object.fromEntries((cfg||[]).map((r:{key:string,value:string})=>[r.key,r.value]))
  const ownerEmail = config.owner_email || 'hotellfountainbd@gmail.com'
  const hotelName = config.hotel_name || 'Hotel Fountain'
  const today = dhakaDateStr()

  if (mode === 'reminder') {
    const {data:checkouts} = await sb.from('reservations')
      .select('id,room_ids,guest_ids,total_amount,paid_amount,check_out')
      .eq('status','CHECKED_IN')
      .gte('check_out', today+'T00:00:00')
      .lte('check_out', today+'T23:59:59')

    if (!checkouts || checkouts.length === 0) {
      await logWorkflowRun(sb, 'checkout-reminder', 'success', 0)
      return new Response(JSON.stringify({success:true,message:'No checkouts today'}),{headers:CORS})
    }

    const guestIds = checkouts.flatMap((r:any)=>r.guest_ids||[])
    const {data:guests} = await sb.from('guests').select('id,name,email,phone').in('id',guestIds)
    const guestMap = Object.fromEntries((guests||[]).map((g:any)=>[g.id,g]))

    const rows = checkouts.map((r:any) => {
      const g = guestMap[(r.guest_ids||[])[0]] || {name:'Unknown',email:'',phone:''}
      const balance = Math.max(0,(+r.total_amount||0)-(+r.paid_amount||0))
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:#EEE9E2;">${g.name}</td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:#58A6FF;">${(r.room_ids||[]).join(', ')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:${balance>0?'#E05C7A':'#3FB950'};">৳${balance.toLocaleString('en-BD')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:#8A8070;">${g.phone||'—'}</td>
      </tr>`
    }).join('')

    const totalBalance = checkouts.reduce((a:number,r:any)=>a+Math.max(0,(+r.total_amount||0)-(+r.paid_amount||0)),0)

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07090E;padding:24px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);padding:24px 36px 0;">
    <div style="font-family:Georgia,serif;font-size:20px;color:#C8A96E;">Hotel <em>Fountain</em></div>
    <div style="font-size:8px;color:#4A4538;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">Checkout Reminder · ${config.checkout_time||'12:00'}</div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,.4),transparent);margin-top:16px;"></div>
  </td></tr>
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:28px 36px;">
    <div style="font-size:11px;color:#4A4538;letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px;">${today}</div>
    <div style="font-family:Georgia,serif;font-size:18px;color:#EEE9E2;margin-bottom:20px;">${checkouts.length} guest${checkouts.length>1?'s':''} checking out <em style="color:#E05C7A;">today</em></div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(200,169,110,.15);">Guest</th>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(200,169,110,.15);">Room(s)</th>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(200,169,110,.15);">Balance</th>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(200,169,110,.15);">Phone</th>
      </tr>
      ${rows}
    </table>
    ${totalBalance > 0
      ? `<div style="background:rgba(224,92,122,.08);border:1px solid rgba(224,92,122,.2);padding:14px 18px;margin-bottom:20px;font-size:12px;color:#E05C7A;">Total outstanding: <strong>৳${totalBalance.toLocaleString('en-BD')}</strong> — collect before checkout.</div>`
      : `<div style="background:rgba(63,185,80,.06);border:1px solid rgba(63,185,80,.2);padding:14px 18px;margin-bottom:20px;font-size:12px;color:#3FB950;">All balances settled ✔</div>`
    }
    <a href="https://hotelfountainbd.vercel.app" style="display:inline-block;background:#C8A96E;color:#07090E;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:11px 24px;text-decoration:none;">View in CRM →</a>
  </td></tr>
  <tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:16px 36px;">
    <div style="font-size:10px;color:#4A4538;">Automated checkout reminder · ${hotelName} · Lumea CRM</div>
  </td></tr>
</table></td></tr></table></body></html>`

    const result = await sendEmail(sb, ownerEmail, `🚨 ${checkouts.length} Checkout${checkouts.length>1?'s':''} Today · ${hotelName} · ${today}`, html)
    await sb.from('notifications_log').insert({
      workflow: 'checkout-reminder', recipient_email: ownerEmail,
      subject: `Checkout Reminder ${today}`,
      body: `${checkouts.length} checkouts, balance: ${totalBalance}`,
      status: result.ok ? 'sent' : 'failed',
      error_msg: result.error,
      metadata: { count: checkouts.length, total_balance: totalBalance },
      tenant_id: TENANT
    })
    await logWorkflowRun(sb, 'checkout-reminder', result.ok ? 'success' : 'error', checkouts.length, result.error)
    return new Response(JSON.stringify({success:true,workflow:'checkout-reminder',checkouts:checkouts.length,total_balance:totalBalance,email:result}),{headers:CORS})
  }

  if (mode === 'overdue') {
    const now = new Date().toISOString()
    const {data:overdues} = await sb.from('reservations')
      .select('id,room_ids,guest_ids,check_out,total_amount,paid_amount')
      .eq('status','CHECKED_IN')
      .lt('check_out', now)

    if (!overdues || overdues.length === 0) {
      await logWorkflowRun(sb, 'overdue-alert', 'success', 0)
      return new Response(JSON.stringify({success:true,message:'No overdue checkouts'}),{headers:CORS})
    }

    const guestIds = overdues.flatMap((r:any)=>r.guest_ids||[])
    const {data:guests} = await sb.from('guests').select('id,name,phone').in('id',guestIds)
    const guestMap = Object.fromEntries((guests||[]).map((g:any)=>[g.id,g]))

    const overdueRows = overdues.map((r:any) => {
      const g = guestMap[(r.guest_ids||[])[0]] || {name:'Unknown',phone:''}
      const hoursLate = Math.round((Date.now() - new Date(r.check_out).getTime()) / 3600000 * 10) / 10
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:#EEE9E2;">${(r.room_ids||[]).join(', ')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:#EEE9E2;">${g.name}</td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:#E05C7A;font-weight:500;">${hoursLate} hrs overdue</td>
        <td style="padding:8px 10px;border-bottom:1px solid rgba(200,169,110,.06);font-size:12px;color:#8A8070;">${g.phone||'—'}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07090E;padding:24px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#0D1117;border:1px solid rgba(224,92,122,.3);padding:24px 36px 0;">
    <div style="font-family:Georgia,serif;font-size:20px;color:#C8A96E;">Hotel <em>Fountain</em></div>
    <div style="font-size:8px;color:#E05C7A;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">⚠ Overdue Checkout Alert</div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(224,92,122,.5),transparent);margin-top:16px;"></div>
  </td></tr>
  <tr><td style="background:#0D1117;border:1px solid rgba(224,92,122,.2);border-top:none;padding:28px 36px;">
    <div style="font-family:Georgia,serif;font-size:20px;color:#EEE9E2;margin-bottom:20px;">${overdues.length} room${overdues.length>1?'s':''} <em style="color:#E05C7A;">overdue</em> checkout</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(224,92,122,.2);">Room</th>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(224,92,122,.2);">Guest</th>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(224,92,122,.2);">Overdue By</th>
        <th style="padding:8px 10px;font-size:8px;letter-spacing:.14em;color:#4A4538;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(224,92,122,.2);">Phone</th>
      </tr>
      ${overdueRows}
    </table>
    <div style="background:rgba(224,92,122,.08);border:1px solid rgba(224,92,122,.2);padding:14px 18px;font-size:12px;color:#E05C7A;margin-bottom:20px;">Action required: Contact front desk to arrange late checkout fee or immediate exit.</div>
    <a href="https://hotelfountainbd.vercel.app" style="display:inline-block;background:#E05C7A;color:#fff;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:11px 24px;text-decoration:none;">View in CRM →</a>
  </td></tr>
  <tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:16px 36px;">
    <div style="font-size:10px;color:#4A4538;">Automated overdue alert · ${hotelName} · Lumea CRM</div>
  </td></tr>
</table></td></tr></table></body></html>`

    const result = await sendEmail(sb, ownerEmail, `⚠️ ${overdues.length} Overdue Checkout${overdues.length>1?'s':''} · ${hotelName}`, html)
    await sb.from('notifications_log').insert({
      workflow: 'overdue-checkout-alert', recipient_email: ownerEmail,
      subject: `Overdue Alert ${today}`,
      body: `${overdues.length} overdue checkouts`,
      status: result.ok ? 'sent' : 'failed',
      error_msg: result.error,
      metadata: { count: overdues.length },
      tenant_id: TENANT
    })
    await logWorkflowRun(sb, 'overdue-alert', result.ok ? 'success' : 'error', overdues.length, result.error)
    return new Response(JSON.stringify({success:true,workflow:'overdue-alert',overdue_count:overdues.length,email:result}),{headers:CORS})
  }

  return new Response(JSON.stringify({error:'Invalid mode'}),{status:400,headers:CORS})
  } catch (err: any) {
    console.error('[wf-checkout-alerts] unhandled error:', err?.message ?? err)
    return new Response(JSON.stringify({ error: 'Internal server error', detail: err?.message ?? String(err) }), { status: 500, headers: CORS })
  }
})
