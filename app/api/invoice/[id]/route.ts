// GET /api/invoice/[id] — PUBLIC guest invoice lookup (capability URL: the reservation UUID
// is the access token; no login). Reads ONE reservation by id on the SERVICE ROLE so the broad
// anon SELECT on `reservations` can be revoked (C3) without breaking guest invoice links.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const { id } = await params;
  if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) return NextResponse.json({ reservation: null }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('reservations').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[invoice] read:', error.message);
    return NextResponse.json({ reservation: null }, { status: 500 });
  }
  return NextResponse.json({ reservation: data || null }, { status: data ? 200 : 404 });
}
