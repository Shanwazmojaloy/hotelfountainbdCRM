// ─────────────────────────────────────────────────────────────────────────────
// CRM OTP Sender  —  POST /api/crm/send-otp
//
// Called during staff account activation:
//   1. Verify email exists in staff table and is not yet activated
//   2. Generate 4-digit OTP, SHA-256 hash it, store in DB with 5-min expiry
//   3. Send SMS via Twilio to the provided phone number
//
// No auth required — rate-limited by requiring a valid staff email in DB.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY     || '';
const TENANT         = process.env.NEXT_PUBLIC_TENANT_ID         || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const TWILIO_SID     = process.env.TWILIO_ACCOUNT_SID            || '';
const TWILIO_TOKEN   = process.env.TWILIO_AUTH_TOKEN             || '';
const TWILIO_FROM    = process.env.TWILIO_FROM_NUMBER            || '';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function sbFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(opts.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sendSMS(to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const creds = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Twilio ${res.status}: ${err.message}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { email, phone } = await req.json() as { email?: string; phone?: string };

    if (!email || !phone) {
      return NextResponse.json({ error: 'email and phone are required' }, { status: 400 });
    }

    // Validate phone is E.164-ish (starts with + and digits)
    const cleanPhone = phone.trim();
    if (!/^\+[1-9]\d{6,14}$/.test(cleanPhone)) {
      return NextResponse.json({ error: 'Phone must be in international format e.g. +8801XXXXXXXXX' }, { status: 400 });
    }

    // Check Twilio config
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      return NextResponse.json({ error: 'SMS service not configured — contact admin' }, { status: 503 });
    }

    // Look up staff by email
    const rows = await sbFetch(
      `staff?tenant_id=eq.${TENANT}&email=eq.${encodeURIComponent(email)}&select=id,activated`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      // Don't reveal whether email exists — generic message
      return NextResponse.json({ error: 'No pending account found for this email' }, { status: 404 });
    }

    const staff = rows[0] as { id: number; activated: boolean };

    if (staff.activated) {
      return NextResponse.json({ error: 'Account already activated. Use the Sign In tab.' }, { status: 409 });
    }

    // Generate 4-digit OTP
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const otpHash = sha256(otp);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

    // Store hash + expiry + phone in DB
    await sbFetch(`staff?id=eq.${staff.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ otp_hash: otpHash, otp_expires: otpExpires, phone: cleanPhone }),
    });

    // Send SMS
    await sendSMS(cleanPhone, `Hotel Fountain CRM: Your activation code is ${otp}. Valid for 5 minutes.`);

    return NextResponse.json({ ok: true, message: 'OTP sent' });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[send-otp]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
