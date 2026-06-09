// ─────────────────────────────────────────────────────────────────────────────
// CRM Staff Login  —  POST /api/crm/login   { email, password }
//
// Server-side credential verification using the SERVICE ROLE. The password hash
// (staff.pwh) is compared here and NEVER leaves the server — the browser only
// receives a minimal session { id, name, role, session_v } on success. This is
// the prerequisite for REVOKE SELECT(pwh) FROM anon (Phase 2): once both the new
// app and /crm.html authenticate through this route, anon no longer needs to read
// the hash column at all.
//
// Mirrors the legacy auth model: hash = SHA-256(password) compared to staff.pwh;
// the returned session_v lets the client honour "Logout All Devices".
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
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
      .select('id, name, role, session_v, activated, pwh')
      .eq('tenant_id', TENANT)
      .ilike('email', email.trim())
      .limit(1);

    if (error) {
      console.error('[crm/login] DB lookup error:', error.message);
      return NextResponse.json({ error: 'Sign-in failed. Try again.' }, { status: 500 });
    }

    const u = rows && rows[0];
    const ok = !!u && !!u.pwh && u.pwh === sha256(password);
    // Generic message — do not reveal whether the email exists.
    if (!ok) {
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }
    if (u.activated === false) {
      return NextResponse.json({ error: 'Account not activated yet — activate via the staff portal first.' }, { status: 403 });
    }

    // Minimal session — NO pwh / otp fields.
    return NextResponse.json({
      ok: true,
      session: { id: u.id, name: u.name, role: u.role, session_v: u.session_v || 1 },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[crm/login]', msg);
    return NextResponse.json({ error: 'Sign-in failed. Try again.' }, { status: 500 });
  }
}
