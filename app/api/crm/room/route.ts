// POST /api/crm/room — Phase 3 route for room writes. action = update (status) | create.
// Session-gated; service-role write. RoomStatusModal/RoomFormModal repoint here.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const STATUSES = ['AVAILABLE', 'OCCUPIED', 'DIRTY', 'OUT_OF_ORDER', 'RESERVED'];

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

  try {
    if (action === 'update') {
      const id = body.id;
      const status = s(body.status);
      if (!id || !status || !STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid room/status.' }, { status: 400 });
      const patch: Record<string, unknown> = { status };
      // Admin-only room-detail edits (room number / category / rate). Housekeeping
      // and reception keep status-only; detail fields from a non-admin are ignored.
      const isAdmin = ['owner', 'admin', 'manager'].includes(String(sess.role || '').toLowerCase());
      if (isAdmin) {
        const rn = s(body.room_number);
        if (rn) patch.room_number = rn;
        const cat = s(body.category);
        if (cat) patch.category = cat;
        if (body.price !== undefined && body.price !== null && body.price !== '') {
          const p = Number(body.price);
          if (Number.isFinite(p) && p >= 0) patch.price = p;
        }
      }
      const { error } = await db.from('rooms').update(patch).eq('id', id);
      if (error) {
        // unique_violation on (tenant_id, room_number) → friendly conflict
        if ((error as { code?: string }).code === '23505') {
          return NextResponse.json({ error: 'That room number is already in use.' }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json({ ok: true });
    }
    if (action === 'create') {
      const room_number = s(body.room_number);
      if (!room_number) return NextResponse.json({ error: 'Room number is required.' }, { status: 400 });
      const row: Record<string, unknown> = {
        room_number, category: s(body.category) || 'Standard',
        price: +(body.price as number) || 0, status: 'AVAILABLE',
      };
      if (s(body.floor)) row.floor = s(body.floor);
      if (s(body.beds)) row.beds = s(body.beds);
      const { error } = await db.from('rooms').insert(row);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/room]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not update room.' }, { status: 500 });
  }
}
