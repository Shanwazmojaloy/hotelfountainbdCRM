import { NextResponse } from 'next/server'

const CRON_SECRET   = process.env.CRON_SECRET
const FB_TOKEN      = process.env.FACEBOOK_PAGE_TOKEN
const FB_PAGE_ID    = process.env.FACEBOOK_PAGE_ID
const BREVO_API_KEY = process.env.BREVO_API_KEY
const ALERT_EMAIL   = 'ahmedshanwaz5@gmail.com'
const WARN_DAYS     = 30  // alert when < 30 days remain

export async function GET(req: Request) {
  // Auth check
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!FB_TOKEN) {
    return NextResponse.json({ error: 'FACEBOOK_PAGE_TOKEN not set' }, { status: 500 })
  }

  // Check token expiry via Graph API debug_token
  let expiresAt: number | null = null
  let daysLeft: number | null = null
  let tokenError: string | null = null

  try {
    const url = `https://graph.facebook.com/debug_token?input_token=${FB_TOKEN}&access_token=${FB_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()

    if (data?.data?.expires_at) {
      expiresAt = data.data.expires_at
      const msLeft = (expiresAt * 1000) - Date.now()
      daysLeft = Math.floor(msLeft / 86400000)
    } else if (data?.error) {
      tokenError = data.error.message || 'Token invalid'
    }
  } catch (e: any) {
    tokenError = e.message
  }

  const needsAlert = tokenError !== null || (daysLeft !== null && daysLeft < WARN_DAYS)

  if (needsAlert && BREVO_API_KEY) {
    const subject = tokenError
      ? '🚨 Hotel Fountain: Facebook Page Token INVALID'
      : `⚠️ Hotel Fountain: Facebook Token expires in ${daysLeft} days`

    const body = tokenError
      ? `The FACEBOOK_PAGE_TOKEN is invalid or expired.\n\nError: ${tokenError}\n\nRenew immediately via Graph API Explorer:\nhttps://developers.facebook.com/tools/explorer/\n\nAccount: Shanwaz Ahmed\nPage: Hotel Fountain (ID: ${FB_PAGE_ID})\n\nUpdate FACEBOOK_PAGE_TOKEN in Vercel Settings → Environment Variables.`
      : `Your Facebook Page Token expires in ${daysLeft} days (${new Date((expiresAt! * 1000)).toISOString().slice(0,10)}).\n\nRenew via Graph API Explorer before it expires:\nhttps://developers.facebook.com/tools/explorer/\n\nAccount: Shanwaz Ahmed\nPage: Hotel Fountain (ID: ${FB_PAGE_ID})\n\nUpdate FACEBOOK_PAGE_TOKEN in Vercel Settings → Environment Variables.`

    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Lumea CRM', email: 'hotellfountainbd@gmail.com' },
          to: [{ email: ALERT_EMAIL, name: 'Shan' }],
          subject,
          textContent: body,
        }),
      })
    } catch (_) { /* non-fatal — log but don't fail */ }
  }

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    token_valid: tokenError === null,
    token_error: tokenError,
    expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    days_remaining: daysLeft,
    alert_sent: needsAlert,
  })
}
