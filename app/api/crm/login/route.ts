// ─────────────────────────────────────────────────────────────────────────────
// CRM Staff Login — POST /api/crm/login  { email, password }
//
// Server-side credential verification using the SERVICE ROLE. The password hash
// (staff.pwh) is compared here and NEVER leaves the server — the browser only
// receives a minimal session { id, name, role, session_v } on success.
//
// Password hashing: bcrypt (cost 12). Legacy SHA-256 hashes are accepted on
// first login and transparently upgraded to bcrypt — no forced reset.
// ─────────────────────────────────────────────────────────────────────────────
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
// Precomputed bcrypt hash used ONLY to equalize response time on the user-miss path: a missing
// email (instant 401) must take ~the same time as a wrong password (slow bcrypt compare), or the
// timing difference leaks which emails are valid. Throwaway value — never matches any password.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('lumea-login-timing-equalizer', BCRYPT_ROUNDS);

function sha256(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/** Returns true if the supplied password matches the stored hash.
 *  Accepts both bcrypt ($2a/$2b) and legacy hex SHA-256 hashes. */
async function verifyPassword(password: string, stored: string): Promise<boolean> {
    if (stored.startsWith('$2')) {
          return bcrypt.compare(password, stored);
    }
    // Legacy SHA-256 path — constant-time compare
  const candidate = sha256(password);
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(stored, 'hex'));
}

export async function POST(req: NextRequest) {
    try {
          const { email, password } = (await req.json()) as { email?: string; password?: string };
          if (!email || !password) {
                  return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
          }
          if (!SB_SERVICE_KEY) {
                  console.error('[crm/login] SUPABASE_SERVICE_ROLE_KEY is not set');
                  return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
          }

      const supabase = createClient(SB_URL, SB_SERVICE_KEY, {
              auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: rows, error } = await supabase
            .from('staff')
            .select('id, name, role, session_v, activated, pwh, login_fail_count, login_locked_until, tenant_id')
            .eq('tenant_id', TENANT)
            .ilike('email', email.trim())
            .limit(1);

      if (error) {
              console.error('[crm/login] DB lookup error:', error.message);
              return NextResponse.json({ error: 'Sign-in failed. Try again.' }, { status: 500 });
      }

      const u = rows && rows[0];
          if (!u || !u.pwh) {
                  // Equalize timing with the real bcrypt path so a missing account is indistinguishable
                  // from a wrong password — closes the user-enumeration timing oracle.
                  await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
                  return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
          }

          // Per-account lockout: too many consecutive failures → short cool-off (brute-force throttle).
          if (u.login_locked_until && new Date(u.login_locked_until).getTime() > Date.now()) {
                  return NextResponse.json({ error: 'Too many failed attempts. Try again in a few minutes.' }, { status: 429 });
          }

      const ok = await verifyPassword(password, u.pwh);
          if (!ok) {
                  await supabase.rpc('note_login_failure', { p_staff_id: u.id });
                  return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
          }
          if (u.activated === false) {
                  return NextResponse.json({ error: 'Account not activated yet — activate via the staff portal first.' }, { status: 403 });
          }

          // Successful auth — clear any failed-attempt / lockout state.
          if ((u.login_fail_count || 0) > 0 || u.login_locked_until) {
                  await supabase.from('staff').update({ login_fail_count: 0, login_locked_until: null }).eq('id', u.id);
          }

      // Transparent upgrade: if the stored hash is legacy SHA-256, rehash to bcrypt now.
      if (!u.pwh.startsWith('$2')) {
              const upgraded = await bcrypt.hash(password, BCRYPT_ROUNDS);
              await supabase.from('staff').update({ pwh: upgraded }).eq('id', u.id);
      }

      const sess = { id: u.id, role: u.role, session_v: u.session_v || 1, tenant_id: u.tenant_id };
          const res = NextResponse.json({ ok: true, session: { ...sess, name: u.name } });
          res.headers.set('Set-Cookie', sessionCookieHeader(signSession(sess)));
          return res;
    } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          console.error('[crm/login]', msg);
          return NextResponse.json({ error: 'Sign-in failed. Try again.' }, { status: 500 });
    }
}
