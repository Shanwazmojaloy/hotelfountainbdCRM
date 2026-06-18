// Server-side recalcResTotal — same canonical math as src/lib/recalcResTotal.js but driven
// by a service-role client (for the Phase 3 write routes). total_amount = Σ(room.price ×
// nights) + Σ(billable folios). NEVER incremental.
import type { SupabaseClient } from '@supabase/supabase-js';

const MARKER = /receivable|payment|settlement|advance|refund/i;
const nights = (ci: string, co: string) => { if (!ci || !co) return 1; const n = Math.round((+new Date(co) - +new Date(ci)) / 86400000); return n > 0 ? n : 1; };

export async function recalcResTotalServer(supabase: SupabaseClient, resId: string): Promise<number | undefined> {
  if (!resId) return;
  const { data: rows } = await supabase.from('reservations').select('room_ids, check_in, check_out').eq('id', resId).limit(1);
  const r = rows && rows[0];
  if (!r) return;
  const n = nights(r.check_in, r.check_out);
  const roomList: string[] = Array.isArray(r.room_ids) ? r.room_ids.filter(Boolean) : [];
  let roomCharge = 0;
  if (roomList.length) {
    const { data: rd } = await supabase.from('rooms').select('room_number, price').in('room_number', roomList.map(String));
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
