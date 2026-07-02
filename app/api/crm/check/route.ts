// POST /api/crm/check — Phase 3 route for check-in / check-out. action = checkin | checkout.
// Updates the reservation status and syncs every room (OCCUPIED on check-in, DIRTY on
// check-out). Session-gated; service-role write. Mirrors CheckActionModal.
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
  const resId = body.reservation_id as string;
  if (!resId) return NextResponse.json({ error: 'Missing reservation_id.' }, { status: 400 });
  if (action !== 'checkin' && action !== 'checkout') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  try {
    const { data: rrows } = await db.from('reservations').select('room_ids').eq('id', resId).limit(1);
    const r = rrows && rrows[0];
    if (!r) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
    const rooms: string[] = Array.isArray(r.room_ids) && r.room_ids.length ? r.room_ids.filter(Boolean) : (r.room_number ? [r.room_number] : []);

    const resStatus = action === 'checkin' ? 'CHECKED_IN' : 'CHECKED_OUT';
    const roomStatus = action === 'checkin' ? 'OCCUPIED' : 'DIRTY';
    const resPatch: Record<string, unknown> = { status: resStatus };
    if (action === 'checkin') resPatch.check_in = new Date().toISOString();

    const { error: rErr } = await db.from('reservations').update(resPatch).eq('id', resId);
    if (rErr) throw rErr;
    for (const rn of rooms) {
      await db.from('rooms').update({ status: roomStatus }).eq('room_number', rn);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[crm/check]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not complete check action.' }, { status: 500 });
  }
}
