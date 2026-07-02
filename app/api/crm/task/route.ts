// POST /api/crm/task — Phase 3 PROOF-OF-PATTERN protected write (housekeeping_tasks,
// the lowest-risk table). Requires a valid signed session cookie (requireSession),
// re-checks session_v against staff so "Logout All Devices" applies, then INSERTs on the
// SERVICE ROLE. Once all staff carry the cookie, anon INSERT on housekeeping_tasks is
// revoked and this becomes the only write path. Server forces status/department/tenant.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

export async function POST(req: NextRequest) {
  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const TENANT = sess.tenant_id || ENV_TENANT; // tenant bound to the SIGNED session (env fallback)
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const supabase = tenantClient(TENANT); // crm_tenant JWT when TENANT_JWT_MODE=on, else service role
  const db = tenantScoped(supabase, TENANT);

  // Honour Logout All Devices: the cookie's session_v must still match the DB.
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const room_number = s(body.room_number);
  if (!room_number) return NextResponse.json({ error: 'Room is required.' }, { status: 400 });

  const insert = {
    room_number,
    task_type: s(body.task_type) || 'Standard Clean',
    priority: s(body.priority) || 'medium',
    assignee: s(body.assignee),
    scheduled_time: s(body.scheduled_time),
    notes: s(body.notes),
    status: 'pending',
    department: 'Housekeeping',
  };

  const { data, error } = await db.from('housekeeping_tasks').insert(insert).select('id').limit(1);
  if (error) {
    console.error('[crm/task] insert error:', error.message);
    return NextResponse.json({ error: 'Could not create task.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data && data[0]?.id });
}
