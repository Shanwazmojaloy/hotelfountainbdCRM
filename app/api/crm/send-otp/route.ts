// -----------------------------------------------------------------------------
// CRM Email Verification  -  POST /api/crm/send-otp
//
// Delivery: Google Workspace SMTP (fountainbd.com runs on Google Workspace,
// MX = smtp.google.com). We send OTPs straight through Google's SMTP relay so
// codes land in the inbox reliably - no third-party sending-account validation
// gate. SPF for fountainbd.com already includes _spf.google.com, and Workspace
// applies DKIM automatically, so From: a real fountainbd.com mailbox aligns.
//
//   SMTP_USER : a REAL Workspace mailbox on fountainbd.com (e.g. noreply@ or owner)
//   SMTP_PASS : a Google *App Password* for that mailbox (needs 2-Step Verification)
//   SMTP_HOST : smtp.gmail.com (default)
//   SMTP_PORT : 465 (SSL, default) or 587 (STARTTLS)
//   CRM_FROM_EMAIL : optional. Only override From if it's a VERIFIED "send mail as"
//                    alias of SMTP_USER; otherwise it defaults to SMTP_USER.
//
// No auth required, but resend-throttled: a fresh code can only be requested once
// per minute per account (prevents email spam + repeatedly resetting a victim's code).
// -----------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { getTenantFromHeaders } from '@/lib/tenant';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const SMTP_HOST  = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT  = Number(process.env.SMTP_PORT || 465);
const SMTP_USER  = process.env.SMTP_USER || '';
const SMTP_PASS  = process.env.SMTP_PASS || '';
// From defaults to the authenticated mailbox (best deliverability / no rewrite).
// Only set CRM_FROM_EMAIL to a different address if it is a verified send-as alias.
const FROM_EMAIL = process.env.CRM_FROM_EMAIL || SMTP_USER;
const FROM_NAME  = process.env.CRM_FROM_NAME  || 'Hotel Fountain CRM';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getSupabase() {
  return createClient(SB_URL, SB_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('Email service not configured (missing SMTP_USER/SMTP_PASS)');
  }
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL); false => STARTTLS on 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

async function sendEmail(to: string, code: string) {
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

  const info = await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject: 'Your Account Activation Code',
    text: `Your Hotel Fountain CRM activation code is ${code}. It is valid for 5 minutes. Do not share this code.`,
    html: htmlContent,
  });
  return info;
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

    // Tenant from the request host (pre-session route — the host is the tenant authority).
    let TENANT: string;
    try {
      TENANT = (await getTenantFromHeaders(req.headers)).id;
    } catch {
      return NextResponse.json({ error: 'Unknown property.' }, { status: 404 });
    }

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
    // issued <60s ago - reject to cap email sends and stop attackers churning a victim's code.
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
