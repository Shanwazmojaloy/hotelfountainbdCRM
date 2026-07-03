// WORKFLOW 8+9 — Reservation Confirmation + Post-Stay Review Request
// WF8: Triggered on new reservation INSERT — WF9: Triggered 2hrs after CHECKED_OUT
//
// Sender switched from Brevo to Resend (2026-07-03): same dead-Brevo-account
// issue as wf-checkout-alerts (see that function's header comment for the
// full root cause). This function is guest-facing — recipients are arbitrary
// external guest addresses, not the hotel's own inbox — so it needs a
// verified custom domain rather than Resend's shared onboarding domain.
// Using fountainbd.com to match the already-working send-booking-email
// function's sender; if hotelfountainbd.com is the domain you verified in
// Resend instead, change FROM_ADDR below to match.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Content-Type': 'application/json'
}
const FROM_ADDR = 'Hotel Fountain <reservations@fountainbd.com>'

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
    body: JSON.stringify({ from: FROM_ADDR, to: [to], subject, html })
  })
  let d: any = {}
  try { d = await r.json() } catch (_e) { d = { raw: await r.text().catch(()=>'non-JSON response') } }
  return r.ok ? { ok: true, id: d.id } : { ok: false, error: d.message || JSON.stringify(d) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sb = createClient(SB_URL, SB_KEY)
  const body = await req.json().catch(() => ({}))
  const mode = body.mode || 'confirmation'

  const { data: cfg } = await sb.from('manus_config').select('key,value')
  const config = Object.fromEntries((cfg || []).map((r: { key: string; value: string }) => [r.key, r.value]))
  const hotelName = config.hotel_name || 'Hotel Fountain'
  const hotelPhone = config.hotel_phone || '+880'
  const reviewLink = config.review_link || 'https://g.page/hotelfountain'
  const checkinTime = config.checkin_time || '2:00 PM'
  const checkoutTime = config.checkout_time || '12:00 PM'

  // ─── MODE: CONFIRMATION ───────────────────────────────────────────────────
  if (mode === 'confirmation') {
    const reservationId = body.reservation_id
    let reservations = []
    if (reservationId) {
      const { data } = await sb.from('reservations').select('*').eq('id', reservationId)
      reservations = data || []
    } else {
      const tenMinAgo = new Date(Date.now() - 600000).toISOString()
      const { data } = await sb.from('reservations').select('*').gte('created_at', tenMinAgo).in('status', ['RESERVED', 'CHECKED_IN'])
      const { data: alreadySent } = await sb.from('notifications_log').select('metadata').eq('workflow', 'booking-confirmation').gte('created_at', tenMinAgo)
      const sentIds = new Set((alreadySent || []).map((n: { metadata: { reservation_id: string } }) => n.metadata?.reservation_id))
      reservations = (data || []).filter((r: { id: string }) => !sentIds.has(r.id))
    }
    let sent = 0
    for (const res of reservations) {
      const guestId = (res.guest_ids || [])[0]
      if (!guestId) continue
      const { data: guest } = await sb.from('guests').select('name,email,phone').eq('id', guestId).single()
      if (!guest?.email) continue
      const rooms = (res.room_ids || []).join(', ')
      const checkIn = String(res.check_in || '').slice(0, 10)
      const checkOut = String(res.check_out || '').slice(0, 10)
      const balance = Math.max(0, (+res.total_amount || 0) - (+res.paid_amount || 0))
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',sans-serif;"><table width="100%" style="background:#07090E;padding:24px 16px;"><tr><td align="center"><table width="600" style="max-width:600px;"><tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);padding:28px 36px 18px;"><div style="font-family:Georgia,serif;font-size:22px;color:#C8A96E;">Hotel <em>Fountain</em></div><div style="font-size:8px;color:#4A4538;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">Booking Confirmation</div></td></tr><tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:32px 36px;"><p style="font-family:Georgia,serif;font-size:24px;color:#EEE9E2;">Dear ${guest.name},</p><p style="font-size:13px;color:#8A8070;">Your reservation at ${hotelName} is confirmed.</p><table style="background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.18);padding:16px;width:100%;"><tr><td style="font-size:9px;color:#4A4538;letter-spacing:.1em;text-transform:uppercase;padding:6px 0;">Room</td><td style="font-size:13px;color:#EEE9E2;">${rooms}</td></tr><tr><td style="font-size:9px;color:#4A4538;letter-spacing:.1em;text-transform:uppercase;padding:6px 0;">Check-In</td><td style="font-size:13px;color:#EEE9E2;">${checkIn} after ${checkinTime}</td></tr><tr><td style="font-size:9px;color:#4A4538;letter-spacing:.1em;text-transform:uppercase;padding:6px 0;">Check-Out</td><td style="font-size:13px;color:#EEE9E2;">${checkOut} before ${checkoutTime}</td></tr><tr><td style="font-size:9px;color:#4A4538;letter-spacing:.1em;text-transform:uppercase;padding:6px 0;">Total</td><td style="font-size:13px;color:#C8A96E;">৳${Number(res.total_amount || 0).toLocaleString()}</td></tr>${balance > 0 ? `<tr><td style="font-size:9px;color:#E05C7A;text-transform:uppercase;padding:6px 0;">Balance Due</td><td style="color:#E05C7A;">৳${balance.toLocaleString()}</td></tr>` : ''}</table><p style="font-size:12px;color:#8A8070;">Front desk: <span style="color:#C8A96E;">${hotelPhone}</span></p></td></tr><tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:14px 36px;"><p style="font-size:10px;color:#4A4538;">${hotelName} · Dhaka, Bangladesh · Lumea CRM</p></td></tr></table></td></tr></table></body></html>`
      const result = await sendEmail(sb, guest.email, `✅ Booking Confirmed — ${hotelName} · Room ${rooms} · ${checkIn}`, html)
      await sb.from('notifications_log').insert({ workflow: 'booking-confirmation', recipient_email: guest.email, subject: `Booking Confirmed ${checkIn}`, status: result.ok ? 'sent' : 'failed', error_msg: result.ok ? null : result.error, triggered_by: 'reservation-created', metadata: { reservation_id: res.id, guest_name: guest.name, room: rooms }, tenant_id: TENANT })
      if (result.ok) sent++
    }
    return new Response(JSON.stringify({ success: true, workflow: 'booking-confirmation', emails_sent: sent }), { headers: CORS })
  }

  // ─── MODE: REVIEW ─────────────────────────────────────────────────────────
  if (mode === 'review') {
    const reservationId = body.reservation_id

    if (!reservationId)
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_reservation_id' }), { headers: CORS })

    const { data: res } = await sb.from('reservations').select('*').eq('id', reservationId).single()
    if (!res)
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'reservation_not_found' }), { headers: CORS })

    const guestId = (res.guest_ids || [])[0]
    if (!guestId) {
      await sb.from('review_queue').update({ status: 'skipped', sent_at: new Date().toISOString() }).eq('reservation_id', reservationId).eq('status', 'pending')
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_guest_on_reservation' }), { headers: CORS })
    }

    const { data: guest } = await sb.from('guests').select('name,email').eq('id', guestId).single()
    if (!guest?.email) {
      await sb.from('review_queue').update({ status: 'skipped', sent_at: new Date().toISOString() }).eq('reservation_id', reservationId).eq('status', 'pending')
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'guest_has_no_email' }), { headers: CORS })
    }

    const rooms = (res.room_ids || []).join(', ')
    const nights = Math.max(1, Math.round((new Date(res.check_out).getTime() - new Date(res.check_in).getTime()) / 86400000))
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',sans-serif;"><table width="100%" style="background:#07090E;padding:24px 16px;"><tr><td align="center"><table width="600" style="max-width:600px;"><tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);padding:28px 36px 18px;"><div style="font-family:Georgia,serif;font-size:22px;color:#C8A96E;">Hotel <em>Fountain</em></div><div style="font-size:8px;color:#4A4538;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">Thank You for Your Stay</div></td></tr><tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:32px 36px;"><p style="font-family:Georgia,serif;font-size:24px;color:#EEE9E2;">Dear ${guest.name},</p><p style="font-size:13px;color:#8A8070;line-height:1.9;">Thank you for choosing ${hotelName} for your ${nights}-night stay in Room ${rooms}. Your feedback helps us serve every guest better.</p><div style="text-align:center;margin:28px 0;"><div style="font-size:24px;margin-bottom:14px;letter-spacing:6px;">★★★★★</div><a href="${reviewLink}" style="display:inline-block;background:#C8A96E;color:#07090E;font-size:11px;letter-spacing:.2em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">Leave a Google Review →</a></div><p style="font-size:12px;color:#4A4538;">Or reply to this email to share feedback directly.<br/>${hotelPhone}</p></td></tr><tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:14px 36px;"><p style="font-size:10px;color:#4A4538;">${hotelName} · Dhaka, Bangladesh · Lumea CRM</p></td></tr></table></td></tr></table></body></html>`

    const result = await sendEmail(sb, guest.email, `Thank you for staying at ${hotelName}, ${guest.name.split(' ')[0]}! ⭐ Share your experience`, html)
    await sb.from('review_queue').update({ status: result.ok ? 'sent' : 'failed', sent_at: new Date().toISOString() }).eq('reservation_id', reservationId).eq('status', 'pending')
    await sb.from('notifications_log').insert({ workflow: 'review-request', recipient_email: guest.email, subject: `Review Request after stay`, status: result.ok ? 'sent' : 'failed', error_msg: result.ok ? null : result.error, triggered_by: 'checkout', metadata: { reservation_id: res.id, guest_name: guest.name, nights }, tenant_id: TENANT })
    return new Response(JSON.stringify({ success: true, workflow: 'review-request', sent: result.ok, skipped: false }), { headers: CORS })
  }

  return new Response(JSON.stringify({ success: true, skipped: true, reason: 'unknown_mode' }), { headers: CORS })
})
