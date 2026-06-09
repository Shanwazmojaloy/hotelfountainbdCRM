'use client';

// NewReservationModal — WRITE flow (booking + check-in). Mirrors legacy NewReservationModal.
// Includes the double-booking overlap guard. On check-in: sets rooms OCCUPIED. On paid>0:
// records a payment transaction (with idempotency key). Touches reservations + rooms + transactions.
import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nights = (ci, co) => { if (!ci || !co) return 0; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 0; };
const shortDate = (s) => { if (!s) return ''; try { return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return s; } };

export default function NewReservationModal({ rooms = [], onClose, onSaved }) {
  const [f, setF] = useState({
    guestId: '', guestName: '', roomNos: [''], checkIn: todayStr(), checkOut: '',
    total: '', paid: '', discount: '', method: 'Cash', notes: '', officer: '', stayType: 'CHECK_IN',
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [conflicts, setConflicts] = useState({});
  const [guestQuery, setGuestQuery] = useState('');
  const [guestHits, setGuestHits] = useState([]);

  const winIn = f.checkIn || todayStr();
  const winOut = f.checkOut || (() => { const d = new Date(winIn + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  // overlap guard — flag rooms with an existing booking in [winIn, winOut)
  useEffect(() => {
    if (!winIn || !winOut || winIn >= winOut) { setConflicts({}); return; }
    const supabase = getSupabaseClient();
    supabase.from('reservations')
      .select('room_ids, check_in, check_out, guest_name')
      .in('status', ['RESERVED', 'CHECKED_IN', 'CONFIRMED'])
      .lt('check_in', winOut).gt('check_out', winIn)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach((r) => (r.room_ids || []).forEach((rid) => {
          const k = String(rid);
          if (!map[k] || r.check_in < map[k].check_in) map[k] = { check_in: r.check_in, check_out: r.check_out, guest_name: r.guest_name };
        }));
        setConflicts(map);
      });
  }, [winIn, winOut]);

  // guest search
  useEffect(() => {
    const q = guestQuery.trim();
    if (q.length < 2) { setGuestHits([]); return; }
    const supabase = getSupabaseClient();
    supabase.from('guests').select('id, name, phone').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8)
      .then(({ data }) => setGuestHits(data || []));
  }, [guestQuery]);

  const displayRooms = rooms.filter((r) => r.status !== 'OUT_OF_ORDER' && r.status !== 'DIRTY');
  const roomBlocked = (r) => {
    if (conflicts[String(r.room_number)]) return true;
    return f.stayType === 'CHECK_IN' && r.status === 'OCCUPIED';
  };
  const roomLabel = (r) => {
    const c = conflicts[String(r.room_number)];
    let suffix = c ? ` — Booked ${shortDate(c.check_in)}→${shortDate(c.check_out)}` : (f.stayType === 'CHECK_IN' && r.status === 'OCCUPIED' ? ' — Occupied' : '');
    return `${r.room_number} — ${r.category} — ${bdt(r.price)}/n${suffix}`;
  };

  const nN = nights(f.checkIn, f.checkOut);
  const autoTotal = useMemo(() => f.roomNos.filter(Boolean).reduce((s, rn) => {
    const rm = rooms.find((r) => r.room_number === rn); return s + (rm && nN ? +rm.price * nN : 0);
  }, 0), [f.roomNos, f.checkIn, f.checkOut, rooms, nN]);
  useEffect(() => { if (autoTotal > 0) setF((p) => ({ ...p, total: String(autoTotal) })); }, [autoTotal]);

  async function save() {
    if (!f.guestId) return setErr('Select a guest.');
    const sel = f.roomNos.filter(Boolean);
    if (!sel.length) return setErr('Select at least one room.');
    if (!f.checkIn || !f.checkOut) return setErr('Set check-in and check-out dates.');
    if (nN <= 0) return setErr('Check-out must be after check-in.');
    const blocked = sel.filter((rn) => conflicts[String(rn)]);
    if (blocked.length) { const c = conflicts[String(blocked[0])]; return setErr(`Room ${blocked.join(', ')} already booked ${shortDate(c.check_in)}→${shortDate(c.check_out)}.`); }
    setErr(''); setSaving(true);
    try {
      const isCheckIn = f.stayType === 'CHECK_IN';
      const totalAmt = +f.total || autoTotal;
      const _r = await fetch('/api/crm/reservation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', guest_ids: [f.guestId], room_ids: sel, guest_name: f.guestName || null, check_in: f.checkIn, check_out: f.checkOut, status: isCheckIn ? 'CHECKED_IN' : 'RESERVED', total_amount: totalAmt, paid_amount: +f.paid || 0, discount_amount: +f.discount || 0, payment_method: f.method, special_requests: f.notes || null, on_duty_officer: f.officer || null, stay_type: f.stayType, fiscal_day: todayStr(), idempotency_key: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null) }),
      });
      if (_r.status !== 401) {
        const j = await _r.json().catch(() => ({}));
        if (!_r.ok || j.error) throw new Error(j.error || 'Could not create reservation.');
        onSaved?.(); onClose?.(); return;
      }
      // 401 transition fallback — direct write below (allowed until anon revoke).
      const supabase = getSupabaseClient();
      const { data: newRes, error: resErr } = await supabase.from('reservations').insert({
        guest_ids: [f.guestId], room_ids: sel, guest_name: f.guestName || null,
        check_in: f.checkIn, check_out: f.checkOut, status: isCheckIn ? 'CHECKED_IN' : 'RESERVED',
        total_amount: totalAmt, paid_amount: +f.paid || 0, discount_amount: +f.discount || 0,
        payment_method: f.method, special_requests: f.notes || null, on_duty_officer: f.officer || null,
        stay_type: f.stayType, tenant_id: TENANT,
      }).select().single();
      if (resErr) throw resErr;

      if (isCheckIn) {
        for (const rn of sel) {
          const room = rooms.find((r) => r.room_number === rn);
          if (room) await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', room.id);
        }
      }
      if ((+f.paid || 0) > 0) {
        await supabase.from('transactions').insert({
          room_number: sel[0], guest_name: f.guestName || '', type: `Room Payment (${f.method})`,
          amount: +f.paid, fiscal_day: todayStr(), reservation_id: newRes?.id || null, tenant_id: TENANT,
          idempotency_key: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null),
        });
      }
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  const field = { padding: '8px 12px', border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8', width: '100%', fontSize: 14 };
  const lbl = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A7F6E', marginBottom: 4, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(43,39,34,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 620, margin: '24px 0' }}>
        <h3 className="text-xl mb-4 pb-4 iv-divider">New Reservation / Check-In</h3>

        <div className="flex gap-2 mb-4">
          {[['CHECK_IN', 'Direct Check-In'], ['RESERVATION', 'Future Reservation']].map(([v, l]) => (
            <button key={v} onClick={() => setF((p) => ({ ...p, stayType: v }))} className={f.stayType === v ? 'iv-btn' : 'iv-btn iv-btn--ghost'} style={{ padding: '6px 14px', fontSize: 13 }}>{l}</button>
          ))}
        </div>

        <div className="mb-3" style={{ position: 'relative' }}>
          <label style={lbl}>Guest *</label>
          <input style={field} placeholder="Type name or phone…"
            value={f.guestName || guestQuery}
            onChange={(e) => { setGuestQuery(e.target.value); setF((p) => ({ ...p, guestId: '', guestName: '' })); }} />
          {guestHits.length > 0 && !f.guestId && (
            <div className="iv-card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 2, padding: 4, maxHeight: 200, overflowY: 'auto' }}>
              {guestHits.map((g) => (
                <button key={g.id} onClick={() => { setF((p) => ({ ...p, guestId: g.id, guestName: g.name })); setGuestHits([]); setGuestQuery(''); }}
                  className="block w-full text-left" style={{ padding: '6px 10px', fontSize: 13, color: '#2B2722' }}>
                  {g.name} <span style={{ color: '#8A7F6E' }}>{g.phone || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3">
          <label style={lbl}>Room(s) *</label>
          {f.roomNos.map((rn, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <select style={{ ...field, flex: 1 }} value={rn} onChange={(e) => { const a = [...f.roomNos]; a[idx] = e.target.value; setF((p) => ({ ...p, roomNos: a })); }}>
                <option value="">— select room —</option>
                {displayRooms.filter((r) => r.room_number === rn || !f.roomNos.includes(r.room_number)).map((r) => (
                  <option key={r.id} value={r.room_number} disabled={roomBlocked(r)}>{roomLabel(r)}</option>
                ))}
              </select>
              {f.roomNos.length > 1 && <button onClick={() => setF((p) => ({ ...p, roomNos: p.roomNos.filter((_, i) => i !== idx) }))} style={{ color: '#C0566A', border: '1px solid rgba(192,86,106,0.3)', borderRadius: 8, padding: '0 10px' }}>✕</button>}
            </div>
          ))}
          <button onClick={() => setF((p) => ({ ...p, roomNos: [...p.roomNos, ''] }))} className="iv-btn iv-btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }}>+ Add Room</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label style={lbl}>Check-In Date *</label><input type="date" style={field} value={f.checkIn} onChange={set('checkIn')} /></div>
          <div><label style={lbl}>Check-Out Date *</label><input type="date" style={field} value={f.checkOut} onChange={set('checkOut')} /></div>
        </div>
        {nN > 0 && (
          <div className="mb-3 text-sm" style={{ background: 'rgba(139,105,20,0.07)', border: '1px solid rgba(139,105,20,0.18)', padding: '8px 12px', borderRadius: 8 }}>
            {nN} night{nN !== 1 ? 's' : ''} × {f.roomNos.filter(Boolean).length} room{f.roomNos.filter(Boolean).length !== 1 ? 's' : ''} = <strong style={{ color: '#8B6914' }}>{bdt(autoTotal)}</strong>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div><label style={lbl}>Total (৳)</label><input type="number" style={field} value={f.total} onChange={set('total')} placeholder={String(autoTotal || 0)} /></div>
          <div><label style={lbl}>Paid (৳)</label><input type="number" style={field} value={f.paid} onChange={set('paid')} placeholder="0" /></div>
          <div><label style={lbl}>Discount (৳)</label><input type="number" style={field} value={f.discount} onChange={set('discount')} placeholder="0" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label style={lbl}>Payment Method</label>
            <select style={field} value={f.method} onChange={set('method')}>{['Cash', 'Bkash', 'Nagad', 'Card', 'Bank Transfer', 'Corporate', 'Complimentary'].map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div><label style={lbl}>On-Duty Officer</label><input style={field} value={f.officer} onChange={set('officer')} placeholder="Staff name" /></div>
        </div>
        <div className="mb-4"><label style={lbl}>Notes</label><textarea style={{ ...field, minHeight: 50, resize: 'vertical' }} value={f.notes} onChange={set('notes')} placeholder="Optional" /></div>

        {err && <div className="mb-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}

        <div className="flex justify-end gap-3">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : (f.stayType === 'CHECK_IN' ? '✓ Check In Now' : 'Create Reservation')}</button>
        </div>
      </div>
    </div>
  );
}
