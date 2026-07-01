// ─────────────────────────────────────────────────────────────────────────────
// CRM Email Verification  —  POST /api/crm/send-otp
//
// Called during staff account activation:
//   1. Verify email exists in staff table and is not yet activated
//   2. Generate 6-digit code, SHA-256 hash it, store in DB with 5-min expiry
//   3. Send code to staff's registered email via Brevo
//
// No auth required, but resend-throttled: a fresh code can only be requested once
// per minute per account (prevents email spam + repeatedly resetting a victim's code).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY     || '';
const TENANT         = process.env.NEXT_PUBLIC_TENANT_ID         || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const BREVO_API_KEY  = process.env.BREVO_API_KEY                 || '';
// Sender MUST be a Brevo-verified address. `noreply@fountainbd.com` was NOT authenticated in
// Brevo (no SPF/DKIM for fountainbd.com), so Brevo accepted the API call (2xx) but Gmail
// dropped/spam-filed the OTP -> staff never received activation codes (Ayon Kishor, 2026-07-01).
// Align to the SAME verified single-sender every other working Lumea email uses.
const FROM_EMAIL     = process.env.CRM_FROM_EMAIL || process.env.HOTEL_SENDER_EMAIL || 'hotellfountainbd@gmail.com';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getSupabase() {
  return createClient(SB_URL, SB_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendEmail(to: string, code: string) {
  if (!BREVO_API_KEY) throw new Error('Email service not configured');

  const htmlContent = [
    '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#F9F7F2;border-radius:8px;">',
    '<h2 style="color:#1A1816;font-size:18px;margin-bottom:8px;">Hotel Fountain CRM</h2>',
    '<p style="color:#2D2A26;font-size:14px;margin-bottom:24px;">Your account activation code:</p>',
    '<div style="background:#2D2A26;border-radius:6px;padding:20px;text-align:center;letter-spacing:0.5em;font-size:32px;font-weight:700;color:#C5A059;font-family:monospace;">',
    code,
    '</div>',
    '<p style="color:#6B6259;font-size:12px;margin-top:20px;">Valid for 5 minutes. Do not share this code.</p>',
    '</div>',
  ].join('');

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Hotel Fountain CRM', email: FROM_EMAIL },
      to: [{ email: to }],
      subject: 'Your Account Activation Code',
      htmlContent,
    }),
  });

  if (!res.ok) {
    const rawBody = await res.text().catch(() => String(res.status));
    console.error('[send-otp] Brevo HTTP', res.status, rawBody);
    let msg: string = String(res.status);
    try { msg = (JSON.parse(rawBody) as { message?: string }).message || rawBody; } catch { msg = rawBody; }
    throw new Error('Email send failed [' + res.status + ']: ' + msg);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json() as { email?: string };

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    if (!SB_SERVICE_KEY) {
      console.error('[send-otp] SUPABASE_SERVICE_ROLE_KEY is not set');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = getSupabase();

    const { data: rows, error: fetchErr } = await supabase
      .from('staff')
      .select('id, activated, otp_expires')
      .eq('tenant_id', TENANT)
      .ilike('email', email.trim())
      .limit(1);

    if (fetchErr) {
      console.error('[send-otp] DB lookup error:', fetchErr.message, fetchErr.code);
      throw new Error('DB error: ' + fetchErr.message);
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No pending account found for this email' }, { status: 404 });
    }

    const staff = rows[0] as { id: number; activated: boolean; otp_expires: string | null };

    if (staff.activated) {
      return NextResponse.json({ error: 'Account already activated. Use the Sign In tab.' }, { status: 409 });
    }

    // Resend throttle: codes expire 5 min after issue, so >4 min remaining means one was
    // issued <60s ago — reject to cap email sends and stop attackers churning a victim's code.
    if (staff.otp_expires && new Date(staff.otp_expires).getTime() - Date.now() > 4 * 60 * 1000) {
      return NextResponse.json({ error: 'A code was just sent. Please wait a minute before requesting another.' }, { status: 429 });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = sha256(code);
    const codeExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: patchErr } = await supabase
      .from('staff')
      .update({ otp_hash: codeHash, otp_expires: codeExpires, otp_attempts: 0 })
      .eq('id', staff.id);

    if (patchErr) {
      console.error('[send-otp] DB update error:', patchErr.message);
      throw new Error('DB update error: ' + patchErr.message);
    }

    await sendEmail(email.trim(), code);

    return NextResponse.json({ ok: true, message: 'Verification code sent' });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[send-otp]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
