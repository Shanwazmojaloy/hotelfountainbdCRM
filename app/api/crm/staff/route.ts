// POST /api/crm/staff — Phase 3 protected writes for staff accounts (OWNER ONLY).
// action = create | update | delete | reset | logout_all. Requires a valid session cookie
// whose role is 'owner', re-checks session_v, then writes on the SERVICE ROLE. Server
// computes the next integer id and never accepts pwh from the client.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const initials = (n: string) => String(n || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const supabase = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: srow } = await supabase.from('staff').select('session_v, role').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }
  if (srow[0].role !== 'owner') return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const id = body.id;

  try {
    if (action === 'list') {
      const { data, error } = await supabase.from('staff').select('id, name, email, role, activated, device').eq('tenant_id', TENANT).order('role');
      if (error) throw error;
      return NextResponse.json({ ok: true, staff: data || [] });
    }
    if (action === 'create') {
      const name = s(body.name); const email = s(body.email);
      if (!name || !email) return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
      const { data: mx } = await supabase.from('staff').select('id').order('id', { ascending: false }).limit(1);
      const nextId = ((mx && mx[0]?.id) || 0) + 1;
      const { error } = await supabase.from('staff').insert({
        id: nextId, name, email: email.toLowerCase(), role: s(body.role) || 'receptionist',
        device: s(body.device) || `${name} Terminal`, av: initials(name),
        tenant_id: TENANT, activated: false, pwh: null, session_v: 1,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, id: nextId });
    }
    if (action === 'update') {
      if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
      const patch: Record<string, unknown> = { name: s(body.name), email: s(body.email)?.toLowerCase(), role: s(body.role), device: s(body.device) };
      const { error } = await supabase.from('staff').update(patch).eq('id', id).eq('tenant_id', TENANT);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'delete') {
      if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
      const { error } = await supabase.from('staff').delete().eq('id', id).eq('tenant_id', TENANT);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'reset') {
      if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
      const { error } = await supabase.from('staff').update({ pwh: null, activated: false, otp_hash: null, otp_expires: null, session_v: 1 }).eq('id', id).eq('tenant_id', TENANT);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'logout_all') {
      // Invalidate every non-owner session.
      const { error } = await supabase.from('staff').update({ session_v: 2 }).eq('tenant_id', TENANT).neq('role', 'owner');
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/staff]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
}
