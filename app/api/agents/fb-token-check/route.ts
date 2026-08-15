import { NextResponse } from 'next/server'
import { sendMail, isMailConfigured } from '@/lib/mailer';

const CRON_SECRET   = process.env.CRON_SECRET
const FB_TOKEN      = process.env.FACEBOOK_PAGE_TOKEN
const FB_PAGE_ID    = process.env.FACEBOOK_PAGE_ID
// FB_APP_TOKEN = "APP_ID|APP_SECRET" — required for debug_token endpoint.
// Set in Vercel: FACEBOOK_APP_ID + FACEBOOK_APP_SECRET (get from developers.facebook.com → App Dashboard).
const FB_APP_ID     = process.env.FACEBOOK_APP_ID
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET
// BREVO_API_KEY removed 2026-08-15 (H-12): the account accepts sends with 200 and
// delivers nothing. Alerts now go through src/lib/mailer.ts (Google Workspace SMTP).
const ALERT_EMAIL   = process.env.ALERT_EMAIL  || 'shanwazahmed@fountainbd.com'
const ALERT_NAME    = process.env.ALERT_NAME   || 'Hotel Owner'
const HOTEL_NAME    = process.env.HOTEL_NAME   || 'Hotel Fountain'
const SENDER_EMAIL  = process.env.HOTEL_SENDER_EMAIL || 'hotellfountainbd@gmail.com'
const WARN_DAYS     = 30  // alert when < 30 days remain

export async function GET(req: Request) {
  // Auth check
  const auth = req.headers.get('authorization') || ''
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (auth !== `Bearer ${CRON_SECRET}`) {
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
        expiresAt = data.data.expires_at as number
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
  } catch (e: unknown) {
    tokenError = e instanceof Error ? e.message : String(e)
  }

  const needsAlert = tokenError !== null || (daysLeft !== null && daysLeft < WARN_DAYS)
  // Reports whether the warning actually went out, not whether one was warranted.
  let alertSent = false

  if (needsAlert && isMailConfigured()) {
    const subject = tokenError
      ? `🚨 ${HOTEL_NAME}: Facebook Page Token INVALID`
      : `⚠️ ${HOTEL_NAME}: Facebook Token expires in ${daysLeft} days`

    const body = tokenError
      ? `The FACEBOOK_PAGE_TOKEN is invalid or expired.\n\nError: ${tokenError}\n\nRenew immediately via Graph API Explorer:\nhttps://developers.facebook.com/tools/explorer/\n\nPage: ${HOTEL_NAME} (ID: ${FB_PAGE_ID})\n\nUpdate FACEBOOK_PAGE_TOKEN in Vercel Settings → Environment Variables.`
      : `Your Facebook Page Token expires in ${daysLeft} days (${new Date((expiresAt! * 1000)).toISOString().slice(0,10)}).\n\nRenew via Graph API Explorer before it expires:\nhttps://developers.facebook.com/tools/explorer/\n\nPage: ${HOTEL_NAME} (ID: ${FB_PAGE_ID})\n\nUpdate FACEBOOK_PAGE_TOKEN in Vercel Settings → Environment Variables.`

    // Google Workspace SMTP, not Brevo. src/lib/mailer.ts documents why: the Brevo
    // account was never validated and had been ACCEPTING sends with HTTP 200 while
    // delivering nothing since ~2026-06-28. This route is the Facebook-token expiry
    // warning — the one alert whose whole job is to reach a human before a token dies —
    // so a transport that silently drops mail defeats the point entirely.
    // Audit 2026-08-15 H-12.
    try {
      await sendMail({
        to: ALERT_EMAIL,
        fromName: 'Lumea CRM',
        fromEmail: SENDER_EMAIL,
        subject,
        text: body,
      })
      alertSent = true
    } catch (e) {
      // Still non-fatal, but it must be VISIBLE. The old code swallowed this and the
      // response below then reported `alert_sent: needsAlert` — the NEED, not the
      // OUTCOME — so a dead mailer looked identical to a delivered warning.
      console.error('[fb-token-check] alert email FAILED:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    check_method: checkMethod,
    app_creds_configured: !!(FB_APP_ID && FB_APP_SECRET),
    token_valid: tokenError === null,
    token_error: tokenError,
    expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    days_remaining: daysLeft,
    alert_needed: needsAlert,
    alert_sent: alertSent,   // the OUTCOME, not the need — audit 2026-08-15 H-12
  })
}
