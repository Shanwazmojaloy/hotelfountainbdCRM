import { NextResponse } from 'next/server'

const CRON_SECRET   = process.env.CRON_SECRET
const FB_TOKEN      = process.env.FACEBOOK_PAGE_TOKEN
const FB_PAGE_ID    = process.env.FACEBOOK_PAGE_ID
// FB_APP_TOKEN = "APP_ID|APP_SECRET" — required for debug_token endpoint.
// Set in Vercel: FACEBOOK_APP_ID + FACEBOOK_APP_SECRET (get from developers.facebook.com → App Dashboard).
const FB_APP_ID     = process.env.FACEBOOK_APP_ID
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET
const BREVO_API_KEY = process.env.BREVO_API_KEY
const ALERT_EMAIL   = process.env.ALERT_EMAIL  || 'ahmedshanwaz5@gmail.com'
const ALERT_NAME    = process.env.ALERT_NAME   || 'Hotel Owner'
const HOTEL_NAME    = process.env.HOTEL_NAME   || 'Hotel Fountain'
const SENDER_EMAIL  = process.env.HOTEL_SENDER_EMAIL || 'hotellfountainbd@gmail.com'
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
  // access_token MUST be an App Access Token (APP_ID|APP_SECRET), NOT the Page token.
  // If app creds not set, fall back to a /me validity check (no expiry date, just valid/invalid).
  let expiresAt: number | null = null
  let daysLeft: number | null = null
  let tokenError: string | null = null
  let checkMethod = 'debug_token'

  try {
    if (FB_APP_ID && FB_APP_SECRET) {
      // Preferred path — App Access Token allows full debug_token introspection
      const appToken = `${FB_APP_ID}|${FB_APP_SECRET}`
      const url = `https://graph.facebook.com/debug_token?input_token=${FB_TOKEN}&access_token=${appToken}`
      const res = await fetch(url)
      const data = await res.json()

      if (data?.data?.expires_at) {
        expiresAt = data.data.expires_at
        const msLeft = (expiresAt * 1000) - Date.now()
        daysLeft = Math.floor(msLeft / 86400000)
      } else if (data?.data?.is_valid === false) {
        tokenError = data.data.error?.message || 'Token is invalid or expired'
      } else if (data?.error) {
        tokenError = data.error.message || 'debug_token call failed'
      }
    } else {
      // Fallback — no app creds: use /me to check if token is still valid
      // Cannot determine expiry date this way; will alert if token is invalid only.
      checkMethod = 'me_endpoint_fallback'
      const res = await fetch(`https://graph.facebook.com/me?access_token=${FB_TOKEN}&fields=id,name`)
      const data = await res.json()
      if (data?.error) {
        tokenError = data.error.message || 'Token invalid — set FACEBOOK_APP_ID + FACEBOOK_APP_SECRET for expiry detection'
      }
      // No expiry date available without App Access Token — prompt to set app creds
      if (!tokenError) {
        daysLeft = null // unknown; assume valid but warn in response
      }
    }
  } catch (e: any) {
    tokenError = e.message
  }

  const needsAlert = tokenError !== null || (daysLeft !== null && daysLeft < WARN_DAYS)

  if (needsAlert && BREVO_API_KEY) {
    const subject = tokenError
      ? `🚨 ${HOTEL_NAME}: Facebook Page Token INVALID`
      : `⚠️ ${HOTEL_NAME}: Facebook Token expires in ${daysLeft} days`

    const body = tokenError
      ? `The FACEBOOK_PAGE_TOKEN is invalid or expired.\n\nError: ${tokenError}\n\nRenew immediately via Graph API Explorer:\nhttps://developers.facebook.com/tools/explorer/\n\nPage: ${HOTEL_NAME} (ID: ${FB_PAGE_ID})\n\nUpdate FACEBOOK_PAGE_TOKEN in Vercel Settings → Environment Variables.`
      : `Your Facebook Page Token expires in ${daysLeft} days (${new Date((expiresAt! * 1000)).toISOString().slice(0,10)}).\n\nRenew via Graph API Explorer before it expires:\nhttps://developers.facebook.com/tools/explorer/\n\nPage: ${HOTEL_NAME} (ID: ${FB_PAGE_ID})\n\nUpdate FACEBOOK_PAGE_TOKEN in Vercel Settings → Environment Variables.`

    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Lumea CRM', email: SENDER_EMAIL },
          to: [{ email: ALERT_EMAIL, name: ALERT_NAME }],
          subject,
          textContent: body,
        }),
      })
    } catch (_) { /* non-fatal — log but don't fail */ }
  }

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    check_method: checkMethod,
    app_creds_configured: !!(FB_APP_ID && FB_APP_SECRET),
    token_valid: tokenError === null,
    token_error: tokenError,
    expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    days_remaining: daysLeft,
    alert_sent: needsAlert,
  })
}
