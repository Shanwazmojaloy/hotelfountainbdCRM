// POST /api/crm/folio — Phase 3 route for folio charges. action = create | delete.
// Both recompute the reservation's canonical total (non-incremental) afterward. Session-gated.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';
import { recalcResTotalServer } from '@/lib/recalcResTotal.server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const supabase = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: srow } = await supabase.from('staff').select('session_v').eq('id', sess.id).limit(1);
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
      const { error } = await supabase.from('folios').insert({
        room_number: s(body.room_number), reservation_id: resId,
        description: s(body.description) || cat, category: cat, amount, tenant_id: TENANT,
      });
      if (error) throw error;
      await recalcResTotalServer(supabase, resId);
      return NextResponse.json({ ok: true });
    }
    if (action === 'delete') {
      const id = body.id;
      if (!id) return NextResponse.json({ error: 'Missing folio id.' }, { status: 400 });
      const { error } = await supabase.from('folios').delete().eq('id', id);
      if (error) throw error;
      if (resId) await recalcResTotalServer(supabase, resId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e: unknown) {
    console.error('[crm/folio]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not update folio.' }, { status: 500 });
  }
}
