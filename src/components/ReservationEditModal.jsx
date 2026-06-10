'use client';

// ReservationEditModal — ported from legacy ReservationDetail save logic. Edits the
// reservation's dates, rooms, status, discount, paid, notes; mirrors the exact write
// side-effects: room-status sync on add/remove/transition, Stay-Extension TX when the
// checkout date is pushed out, Advance-Payment TX when paid_amount increases, then the
// authoritative recalcResTotal. Add Charge / Record Payment reuse the money-grade modals.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { recalcResTotal } from '@/lib/recalcResTotal';
import AddChargeModal from './AddChargeModal';
import RecordPaymentModal from './RecordPaymentModal';
import { printConfirmation } from '@/lib/printDocs';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const MARKER_RE = /receivable|payment|settlement|advance|refund/i;
const nightsCount = (ci, co) => { if (!ci || !co) return 0; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 0; };
const todayDhaka = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const STATUSES = ['RESERVED', 'PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

export default function ReservationEditModal({ reservation, guests, rooms, onClose, onSaved }) {
  const res = reservation;
  const [status, setStatus] = useState(res.status);
  const [paidAmt, setPaidAmt] = useState(String(res.paid_amount || ''));
  const [discountAmt, setDiscountAmt] = useState(String(res.discount_amount || res.discount || ''));
  const [notes, setNotes] = useState(res.notes || res.special_requests || '');
  const [checkInDate, setCheckInDate] = useState(res.check_in ? String(res.check_in).slice(0, 10) : '');
  const [checkOut, setCheckOut] = useState(res.check_out ? String(res.check_out).slice(0, 10) : '');
  const [roomArr, setRoomArr] = useState((res.room_ids || []).filter(Boolean));
  const [resFolioExtras, setResFolioExtras] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showCharge, setShowCharge] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const gn = (guests || []).find((g) => String(g.id) === String((res.guest_ids || [])[0] || ''))?.name || res.guest_name || 'Unknown';

  useEffect(() => {
    let cancelled = false;
    if (!res?.id) return;
    const supabase = getSupabaseClient();
    supabase.from('folios').select('amount, category, description').eq('reservation_id', res.id)
      .then(({ data }) => {
        if (cancelled) return;
        const ex = (data || []).filter((f) => !MARKER_RE.test(String(f.category || '') + ' ' + String(f.description || ''))).reduce((a, f) => a + (+f.amount || 0), 0);
        setResFolioExtras(ex);
      });
    return () => { cancelled = true; };
  }, [res?.id]);

  const nights = nightsCount(checkInDate || res.check_in, checkOut || res.check_out);
  const origNights = nightsCount(res.check_in, res.check_out);
  const extNights = Math.max(0, nights - origNights);
  const ratesSum = roomArr.filter(Boolean).reduce((a, rn) => a + (+(rooms || []).find((r) => String(r.room_number) === String(rn))?.price || 0), 0);
  const extCharge = extNights > 0 ? extNights * ratesSum : 0;
  const computedTotal = ratesSum * nights + resFolioExtras;

  const _origCheckIn = res.check_in ? String(res.check_in).slice(0, 10) : '';
  const _origCheckOut = res.check_out ? String(res.check_out).slice(0, 10) : '';
  const _origRoomKey = [...(res.room_ids || [])].filter(Boolean).map(String).sort().join(',');
  const _newRoomKey = [...roomArr].filter(Boolean).map(String).sort().join(',');
  const _isUserEditing = checkInDate !== _origCheckIn || checkOut !== _origCheckOut || _newRoomKey !== _origRoomKey;
  const _dbTotal = +res.total_amount || 0;
  const totalAmt = _isUserEditing ? computedTotal : (_dbTotal > 0 ? _dbTotal : computedTotal);
  const paidNum = +paidAmt || 0;
  const discountNum = +discountAmt || 0;
  const balance = Math.max(0, totalAmt - discountNum - paidNum);
  const selectableRooms = (rooms || []).filter((r) => r.status === 'AVAILABLE' || roomArr.includes(r.room_number));

  function toggleRoom(rn) {
    setRoomArr((prev) => (prev.includes(rn) ? prev.filter((x) => x !== rn) : [...prev, rn]));
  }

  async function save() {
    if (saving) return;
    if (status === 'CHECKED_OUT' && res.status !== 'CHECKED_OUT' && balance > 0) {
      if (!window.confirm(`${gn} has an outstanding balance of ${bdt(balance)}. Check out anyway? It will be carried forward as Outstanding Due.`)) return;
    }
    setErr(''); setSaving(true);
    try {
      const _r = await fetch('/api/crm/reservation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: res.id, status, paid_amount: paidNum, discount_amount: discountNum, notes, check_in: checkInDate, check_out: checkOut, room_ids: roomArr.filter(Boolean), guest_name: gn }),
      });
      if (_r.status !== 401) {
        const j = await _r.json().catch(() => ({}));
        if (!_r.ok || j.error) throw new Error(j.error || 'Could not save reservation.');
        onSaved?.(); onClose?.(); return;
      }
      // 401 transition fallback — direct multi-table write below (allowed until anon revoke).
      const supabase = getSupabaseClient();
      const newRoomNos = roomArr.filter(Boolean);
      const oldRoomNos = res.room_ids || [];
      const roomByNo = (rn) => (rooms || []).find((r) => String(r.room_number) === String(rn));

      // removed rooms -> AVAILABLE
      for (const rn of oldRoomNos.filter((rn) => !newRoomNos.includes(rn))) {
        const room = roomByNo(rn); if (room) await supabase.from('rooms').update({ status: 'AVAILABLE' }).eq('id', room.id);
      }
      // status transitions -> room status
      if (status === 'CHECKED_IN') {
        for (const rn of newRoomNos) { const room = roomByNo(rn); if (room) await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', room.id); }
      }
      if (status === 'CHECKED_OUT' && res.status !== 'CHECKED_OUT') {
        for (const rn of newRoomNos) { const room = roomByNo(rn); if (room) await supabase.from('rooms').update({ status: 'DIRTY' }).eq('id', room.id); }
      }

      // Stay-Extension TX when checkout pushed out
      let finalTotal = totalAmt;
      if (checkOut && checkOut !== _origCheckOut) {
        if (nights > 0) finalTotal = nights * ratesSum + resFolioExtras;
        if (extCharge > 0) {
          await supabase.from('transactions').insert({
            room_number: newRoomNos[0] || '?', guest_name: gn,
            type: `Stay Extension (+${extNights} night${extNights !== 1 ? 's' : ''})`,
            amount: extCharge, fiscal_day: todayDhaka(), reservation_id: res.id, tenant_id: TENANT,
            idempotency_key: crypto.randomUUID(),
          });
        }
      }
      // Advance-Payment TX when paid_amount increases (keeps Billing visible)
      const payIncrease = paidNum - (+res.paid_amount || 0);
      if (payIncrease > 0) {
        await supabase.from('transactions').insert({
          room_number: newRoomNos[0] || '?', guest_name: gn, type: 'Advance Payment',
          amount: payIncrease, fiscal_day: todayDhaka(), reservation_id: res.id, tenant_id: TENANT,
          idempotency_key: crypto.randomUUID(),
        });
      }

      const updates = {
        status, paid_amount: paidNum, discount_amount: discountNum, notes,
        check_in: checkInDate, check_out: checkOut, room_ids: newRoomNos,
        total_amount: finalTotal, guest_name: gn,
      };
      const { error } = await supabase.from('reservations').update(updates).eq('id', res.id);
      if (error) throw error;
      await recalcResTotal(res.id); // authoritative recompute
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  const field = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 8, background: '#fff', width: '100%', fontSize: 13, minHeight: 42, color: 'var(--iv-ink)' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(43,39,34,0.5)', zIndex: 90,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-start justify-between mb-4 pb-4 iv-divider">
          <div><h3 className="text-xl">{gn}</h3><div style={lbl} className="mt-1">Edit Reservation · {(res.room_ids || []).join(', ') || '—'}</div></div>
          <div style={{ textAlign: 'right' }}><div style={lbl}>Balance</div>
            <div className="iv-mono" style={{ fontSize: 20, fontWeight: 700, color: balance > 0 ? '#DC2626' : '#16A34A' }}>{bdt(balance)}</div></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div><label style={lbl}>Check-In</label><input type="date" style={field} value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} /></div>
          <div><label style={lbl}>Check-Out</label><input type="date" style={field} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
        </div>

        <div className="mb-4">
          <label style={lbl}>Rooms {nights > 0 && <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--iv-gold)' }}>· {nights} night{nights !== 1 ? 's' : ''}{extNights > 0 ? ` (+${extNights} ext)` : ''}</span>}</label>
          <div className="flex flex-wrap gap-2">
            {selectableRooms.map((r) => (
              <button key={r.id} type="button" onClick={() => toggleRoom(r.room_number)}
                className={roomArr.includes(r.room_number) ? 'iv-btn' : 'iv-btn iv-btn--ghost'} style={{ padding: '4px 10px', fontSize: 12 }}>
                {r.room_number} · {bdt(r.price)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div><label style={lbl}>Status</label><select style={field} value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
          <div><label style={lbl}>Discount (৳)</label><input type="number" style={field} value={discountAmt} onChange={(e) => setDiscountAmt(e.target.value)} placeholder="0" /></div>
          <div><label style={lbl}>Paid (৳)</label><input type="number" style={field} value={paidAmt} onChange={(e) => setPaidAmt(e.target.value)} placeholder="0" /></div>
        </div>

        <div className="mb-4"><label style={lbl}>Notes / Special Requests</label><input style={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        <div style={{ background: 'rgba(139,105,20,0.05)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div className="flex justify-between text-sm" style={{ marginBottom: 3 }}><span style={{ color: 'var(--iv-ink3)' }}>Total{_isUserEditing ? ' (recalc)' : ''}</span><span className="iv-mono">{bdt(totalAmt)}</span></div>
          {discountNum > 0 && <div className="flex justify-between text-sm" style={{ color: '#16A34A', marginBottom: 3 }}><span>Discount</span><span className="iv-mono">− {bdt(discountNum)}</span></div>}
          <div className="flex justify-between text-sm" style={{ color: '#16A34A', marginBottom: 3 }}><span>Paid</span><span className="iv-mono">− {bdt(paidNum)}</span></div>
          {extCharge > 0 && <div className="flex justify-between text-sm" style={{ color: '#DC2626', marginBottom: 3 }}><span>Stay extension (will post)</span><span className="iv-mono">+ {bdt(extCharge)}</span></div>}
          <div className="flex justify-between" style={{ fontWeight: 700, fontSize: 14, color: balance > 0 ? '#DC2626' : '#16A34A', borderTop: '1px solid var(--iv-border2)', paddingTop: 6, marginTop: 3 }}><span>Balance Due</span><span className="iv-mono">{bdt(balance)}</span></div>
        </div>

        {err && <div className="mb-3 text-sm" style={{ color: '#DC2626' }}>{err}</div>}

        <div className="flex justify-between gap-2 flex-wrap iv-foot">
          <div className="flex gap-2 flex-wrap">
            <button className="iv-btn iv-btn--ghost" onClick={() => setShowCharge(true)}>+ Add Charge</button>
            <button className="iv-btn iv-btn--ghost" onClick={() => setShowPay(true)}>Record Payment</button>
            <button className="iv-btn iv-btn--ghost" title="Print booking confirmation voucher"
              onClick={() => printConfirmation({ ...res, check_in: checkInDate, check_out: checkOut, room_ids: roomArr.filter(Boolean), total_amount: totalAmt, discount_amount: discountNum, paid_amount: paidNum, notes, status, guest_name: gn }, rooms, gn)}>Print</button>
          </div>
          <div className="flex gap-2">
            <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>

      {showCharge && (
        <AddChargeModal roomNo={roomArr[0] || res.room_number} resId={res.id}
          onClose={() => setShowCharge(false)} onDone={() => { onSaved?.(); }} />
      )}
      {showPay && (
        <RecordPaymentModal reservation={{ ...res, guest_name: gn, total_amount: totalAmt, discount_amount: discountNum, paid_amount: paidNum }}
          onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); onSaved?.(); }} />
      )}
    </div>
  );
}
