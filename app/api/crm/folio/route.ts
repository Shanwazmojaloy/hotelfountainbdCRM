// POST /api/crm/folio — Phase 3 route for folio charges. action = create | delete.
// Both recompute the reservation's canonical total (non-incremental) afterward. Session-gated.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { isAdmin } from '@/lib/permissions';
import { recalcResTotalServer } from '@/lib/recalcResTotal.server';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = tenantClient(TENANT); // crm_tenant JWT when TENANT_JWT_MODE=on, else service role
  const db = tenantScoped(supabase, TENANT);
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const resId = body.reservation_id as string;

  try {
    if (action === 'create') {
      const amount = +(body.amount as number);
      if (!resId) return NextResponse.json({ error: 'No active reservation.' }, { status: 400 });
      if (!amount || amount <= 0) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 });
      const cat = s(body.category) || 'Room Service';
      // Attribution — stamp who added the charge. Name is denormalized because the browser
      // anon key cannot read `staff` (RLS), so the folio row must carry the display name.
      const { data: who } = await db.from('staff').select('name').eq('id', sess.id).limit(1);
      const addedByName = (who && who[0] && who[0].name) || null;
      const { error } = await db.from('folios').insert({
        room_number: s(body.room_number), reservation_id: resId,
        description: s(body.description) || cat, category: cat, amount,
        added_by_id: sess.id, added_by_name: addedByName,
      });
      if (error) throw error;
      await recalcResTotalServer(supabase, resId, TENANT);
      return NextResponse.json({ ok: true });
    }
    if (action === 'delete') {
      // Edit/remove of a charge is owner/admin only — receptionist & housekeeping cannot.
      // Server-authoritative: the role comes from the signed session, not the client.
      if (!isAdmin(sess.role)) {
        return NextResponse.json({ error: 'Only an owner or admin can remove a charge.' }, { status: 403 });
      }
      const id = body.id;
      if (!id) return NextResponse.json({ error: 'Missing folio id.' }, { status: 400 });
      const { error } = await db.from('folios').delete().eq('id', id);
      if (error) throw error;
      if (resId) await recalcResTotalServer(supabase, resId, TENANT);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/folio]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not update folio.' }, { status: 500 });
  }
}
