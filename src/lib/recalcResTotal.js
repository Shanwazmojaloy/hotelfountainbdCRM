// Shared canonical total recompute — ported from legacy crm-src.jsx recalcResTotal.
// total_amount = Σ(room.price × nights) + Σ(billable folios). NEVER incremental
// (incremental caused the ৳15,000 ghost-bleed). Single source of truth for charges.
import { getSupabaseClient } from '@/lib/supabase/client';

const MARKER_FOLIO_RE = /receivable|payment|settlement|advance|refund/i;
const nights = (ci, co) => { if (!ci || !co) return 1; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 1; };

export async function recalcResTotal(resId) {
  if (!resId) return;
  const supabase = getSupabaseClient();
  const { data: rows } = await supabase.from('reservations').select('room_ids, check_in, check_out').eq('id', resId).limit(1);
  const r = rows && rows[0];
  if (!r) return;
  const n = nights(r.check_in, r.check_out);
  const roomList = Array.isArray(r.room_ids) ? r.room_ids.filter(Boolean) : [];
  let roomCharge = 0;
  if (roomList.length) {
    const { data: roomsData } = await supabase.from('rooms').select('room_number, price').in('room_number', roomList.map(String));
    const arr = roomsData || [];
    roomCharge = roomList.reduce((a, rn) => a + (+(arr.find((rm) => String(rm.room_number) === String(rn))?.price) || 0) * n, 0);
  }
  const { data: fol } = await supabase.from('folios').select('amount, category, description').eq('reservation_id', resId);
  const extras = (fol || [])
    .filter((f) => !MARKER_FOLIO_RE.test(String(f.category || '') + ' ' + String(f.description || '')))
    .reduce((a, f) => a + (+f.amount || 0), 0);
  const total = roomCharge + extras;
  await supabase.from('reservations').update({ total_amount: total }).eq('id', resId);
  return total;
}
