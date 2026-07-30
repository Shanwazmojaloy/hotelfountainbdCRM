// POST /api/crm/guest — Phase 3 protected write for guests (PII). action = create|update|delete.
// Requires a valid signed session cookie + session_v recheck, then writes on the SERVICE ROLE,
// scoped to the tenant. Delete maps FK violations to a friendly 409. Same transition model as
// /api/crm/task: client falls back to a direct insert on 401 until anon writes are revoked.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const TENANT = sess.tenant_id || ENV_TENANT; // tenant bound to the SIGNED session (env fallback)
  const supabase = tenantClient(TENANT); // crm_tenant JWT when TENANT_JWT_MODE=on, else service role
  const db = tenantScoped(supabase, TENANT);
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const id = body.id;

  const payload = {
    name: s(body.name), phone: s(body.phone), email: (s(body.email) || '').toLowerCase() || null,
    id_type: s(body.id_type) || 'NID', id_number: s(body.id_number),
    nationality: s(body.nationality), city: s(body.city), address: s(body.address),
  };

  try {
    if (action === 'create') {
      if (!payload.name) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
      const { error } = await db.from('guests').insert(payload);
      if (error) {
        if (error.code === '23505' || /guests_unique_real_email|duplicate key/i.test(error.message || '')) {
          return NextResponse.json({ error: 'A guest with this email already exists — search for them and edit instead.' }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json({ ok: true });
    }
    if (action === 'update') {
      if (!id) return NextResponse.json({ error: 'Missing guest id.' }, { status: 400 });
      if (!payload.name) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
      const { error } = await db.from('guests').update(payload).eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'delete') {
      if (!id) return NextResponse.json({ error: 'Missing guest id.' }, { status: 400 });
      const { error } = await db.from('guests').delete().eq('id', id);
      if (error) {
        if (/23503|foreign key|violates/i.test(error.message || '')) {
          return NextResponse.json({ error: 'Cannot delete — this guest has billing, ledger or payment history. Remove or reassign those first.' }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/guest]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not save guest.' }, { status: 500 });
  }
}
