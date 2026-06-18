// POST /api/crm/activate — new-staff account activation (step 2). Verifies the OTP that
// /api/crm/send-otp emailed (SHA-256 hash, ≤5 min), then sets the password (pwh, bcrypt)
// and marks the account activated — all on the SERVICE ROLE (anon can no longer write staff).
// On success returns a minimal session so the client can sign the user straight in.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { signSession, sessionCookieHeader } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const BCRYPT_ROUNDS = 12;
const sha256 = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function POST(req: NextRequest) {
    try {
          const { email, otp, password } = (await req.json()) as { email?: string; otp?: string; password?: string };
          if (!email || !otp || !password) return NextResponse.json({ error: 'Email, code and password are required.' }, { status: 400 });
          if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
          if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
          const { data: rows } = await supabase.from('staff').select('id, name, role, session_v, otp_hash, otp_expires, otp_attempts, tenant_id').eq('tenant_id', TENANT).ilike('email', email.trim()).limit(1);
          const u = rows && rows[0];
          if (!u || !u.otp_hash) return NextResponse.json({ error: 'No pending activation for this email. Request a new code.' }, { status: 404 });

      // Brute-force lockout: a 6-digit code has 900k combos; without a cap an attacker could
      // grind it within the 5-min window. After 5 wrong tries the code is locked until a new
      // one is requested (send-otp resets otp_attempts to 0). Requires staff.otp_attempts column.
      const MAX_OTP_ATTEMPTS = 5;
          if ((u.otp_attempts || 0) >= MAX_OTP_ATTEMPTS) {
                  return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 });
          }
          if (u.otp_hash !== sha256(otp.trim())) {
                  await supabase.from('staff').update({ otp_attempts: (u.otp_attempts || 0) + 1 }).eq('id', u.id);
                  return NextResponse.json({ error: 'Incorrect code.' }, { status: 401 });
          }
          if (u.otp_expires && new Date(u.otp_expires).getTime() < Date.now()) return NextResponse.json({ error: 'Code expired — request a new one.' }, { status: 401 });

      // Store bcrypt hash for the new password (OTP hash stays SHA-256 — fine for a 5-min code).
      const pwh = await bcrypt.hash(password, BCRYPT_ROUNDS);
          const newSv = (u.session_v || 1);
          const { error } = await supabase.from('staff').update({ pwh, activated: true, otp_hash: null, otp_expires: null, otp_attempts: 0 }).eq('id', u.id);
          if (error) throw error;

      const sess = { id: u.id, role: u.role, session_v: newSv, tenant_id: u.tenant_id };
          const res = NextResponse.json({ ok: true, session: { ...sess, name: u.name } });
          res.headers.set('Set-Cookie', sessionCookieHeader(signSession(sess)));
          return res;
    } catch (e: unknown) {
          console.error('[crm/activate]', e instanceof Error ? e.message : e);
          return NextResponse.json({ error: 'Activation failed. Try again.' }, { status: 500 });
    }
}
