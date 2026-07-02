// POST /api/crm/settings — Phase 3 protected write for hotel_settings (OWNER ONLY).
// Upserts the hotel-info key/value rows (PK = key,tenant_id) on the SERVICE ROLE after
// verifying an owner session cookie. Same transition fallback model on the client.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const KEYS = ['hotel_name', 'city', 'currency', 'check_in', 'check_out', 'vat_rate', 'service_charge'];

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const TENANT = sess.tenant_id || ENV_TENANT; // tenant bound to the SIGNED session (env fallback)
  const supabase = tenantClient(TENANT); // crm_tenant JWT when TENANT_JWT_MODE=on, else service role
  const db = tenantScoped(supabase, TENANT);
  const { data: srow } = await db.from('staff').select('session_v, role').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }
  if (srow[0].role !== 'owner') return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const values = (body.values || {}) as Record<string, unknown>;
  const rows = KEYS
    .filter((k) => values[k] !== undefined && values[k] !== null)
    .map((key) => ({ key, value: String(values[key]) }));
  if (rows.length === 0) return NextResponse.json({ error: 'No settings to save.' }, { status: 400 });

  const { error } = await db.from('hotel_settings').upsert(rows, { onConflict: 'key,tenant_id' });
  if (error) {
    console.error('[crm/settings]', error.message);
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
