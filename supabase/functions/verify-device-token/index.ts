// verify-device-token
// Replaces auto_login_password checks with token-based device authentication.
// Called by the app on page load to identify which terminal is connecting.
//
// Request:  POST { device_id: string, token: string }
// Response: { valid: true, role, email, label, device_id, expires_at }
//        or { valid: false, reason }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const { device_id, token } = body

    // Both fields required
    if (!device_id || !token) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'device_id and token are required' }),
        { status: 400, headers: CORS }
      )
    }

    const sb = createClient(SB_URL, SB_KEY)

    // Look up device — token must match, not be expired, device_id must match
    const { data: device, error } = await sb
      .from('authorized_devices')
      .select('id, device_id, label, role, auto_login_email, device_token, token_expires_at, token_rotated_at, tenant_id')
      .eq('device_id', device_id)
      .eq('device_token', token)
      .single()

    if (error || !device) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'invalid_token' }),
        { status: 401, headers: CORS }
      )
    }

    // Check expiry
    if (device.token_expires_at && new Date(device.token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({
          valid: false,
          reason: 'token_expired',
          expired_at: device.token_expires_at,
          hint: 'Call rotate_device_token() to issue a new token'
        }),
        { status: 401, headers: CORS }
      )
    }

    // Valid — return device identity (never return the token itself)
    return new Response(
      JSON.stringify({
        valid: true,
        device_id: device.device_id,
        label: device.label,
        role: device.role,
        email: device.auto_login_email,
        expires_at: device.token_expires_at,
        rotated_at: device.token_rotated_at,
        tenant_id: device.tenant_id
      }),
      { headers: CORS }
    )

  } catch (err) {
    console.error('verify-device-token error:', err)
    return new Response(
      JSON.stringify({ valid: false, reason: 'server_error', detail: String(err) }),
      { status: 500, headers: CORS }
    )
  }
})
