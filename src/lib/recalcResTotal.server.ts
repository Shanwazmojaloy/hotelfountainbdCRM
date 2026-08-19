// Server-side recalcResTotal — same canonical math as src/lib/recalcResTotal.js but driven
// by a service-role client (for the Phase 3 write routes). total_amount = Σ(room.price ×
// nights) + Σ(billable folios). NEVER incremental.
import type { SupabaseClient } from '@supabase/supabase-js';

const MARKER = /receivable|payment|settlement|advance|refund/i;
const nights = (ci: string, co: string) => { if (!ci || !co) return 1; const n = Math.round((+new Date(co) - +new Date(ci)) / 86400000); return n > 0 ? n : 1; };

// tenantId is REQUIRED, not optional, and that is deliberate: making it
// optional would let a caller silently fall back to the unscoped lookup this
// parameter exists to close. Required means the compiler finds every call site.
//
// WHY IT EXISTS — this client is the RAW service role, so RLS is bypassed and
// isolation depends entirely on the filter below. rooms.room_number was UNIQUE
// GLOBALLY until 004, which is the only reason an unscoped `.in('room_number',
// …)` could not mis-hit. Once numbering is per-tenant, an unfiltered lookup
// returns one row per hotel sharing that number and the `arr.find()` on the
// next line takes whichever came back first — repricing a stay at ANOTHER
// HOTEL'S nightly rate, silently. Do not remove the tenant filter.
export async function recalcResTotalServer(supabase: SupabaseClient, resId: string, tenantId: string): Promise<number | undefined> {
  if (!resId) return;
  if (!tenantId) throw new Error('recalcResTotalServer: tenantId is required — refusing an unscoped rate lookup');
  const { data: rows } = await supabase.from('reservations').select('room_ids, check_in, check_out').eq('id', resId).limit(1);
  const r = rows && rows[0];
  if (!r) return;
  const n = nights(r.check_in, r.check_out);
  const roomList: string[] = Array.isArray(r.room_ids) ? r.room_ids.filter(Boolean) : [];
  let roomCharge = 0;
  if (roomList.length) {
    const { data: rd } = await supabase.from('rooms').select('room_number, price').eq('tenant_id', tenantId).in('room_number', roomList.map(String));
    const arr = rd || [];
    roomCharge = roomList.reduce((a, rn) => a + (+(arr.find((rm) => String(rm.room_number) === String(rn))?.price) || 0) * n, 0);
  }
  const { data: fol } = await supabase.from('folios').select('amount, category, description').eq('reservation_id', resId);
  const extras = (fol || [])
    .filter((f) => !MARKER.test(String(f.category || '') + ' ' + String(f.description || '')))
    .reduce((a, f) => a + (+f.amount || 0), 0);
  // Round to paisa (2 dp) so float accumulation can't leave artifacts like 58880.00000001.
  const total = Math.round((roomCharge + extras) * 100) / 100;
  await supabase.from('reservations').update({ total_amount: total }).eq('id', resId);
  return total;
}
