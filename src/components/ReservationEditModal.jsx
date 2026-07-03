'use client';

// ReservationEditModal — ported from legacy ReservationDetail save logic. Edits the
// reservation's dates, rooms, status, discount, paid, notes; mirrors the exact write
// side-effects: room-status sync on add/remove/transition, Stay-Extension TX when the
// checkout date is pushed out, Advance-Payment TX when paid_amount increases, then the
// authoritative recalcResTotal. Add Charge / Record Payment reuse the money-grade modals.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { recalcResTotal } from '@/lib/recalcResTotal';
import { useAuth } from './AuthGate';
import { isAdmin } from '@/lib/permissions';
import AddChargeModal from './AddChargeModal';
import RecordPaymentModal from './RecordPaymentModal';
import { printConfirmation } from '@/lib/printDocs';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const MARKER_RE = /receivable|payment|settlement|advance|refund/i;
const nightsCount = (ci, co) => { if (!ci || !co) return 0; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 0; };
const todayDhaka = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return String(d).slice(0, 10); } };

const STATUSES = ['RESERVED', 'PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

export default function ReservationEditModal({ reservation, guests, rooms, onClose, onSaved }) {
  const { user } = useAuth();
  const admin = isAdmin(user?.role); // edit/remove of charges = owner/admin only
  const res = reservation;
  const [status, setStatus] = useState(res.status);
  const [paidAmt, setPaidAmt] = useState(String(res.paid_amount || ''));
  const [discountAmt, setDiscountAmt] = useState(String(res.discount_amount || res.discount || ''));
  const [notes, setNotes] = useState(res.notes || res.special_requests || '');
  const [checkInDate, setCheckInDate] = useState(res.check_in ? String(res.check_in).slice(0, 10) : '');
  const [checkOut, setCheckOut] = useState(res.check_out ? String(res.check_out).slice(0, 10) : '');
  const [roomArr, setRoomArr] = useState((res.room_ids || []).filter(Boolean));
  const [chargeRows, setChargeRows] = useState([]); // manual Add-Charge line items
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showCharge, setShowCharge] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const gn = (guests || []).find((g) => String(g.id) === String((res.guest_ids || [])[0] || ''))?.name || res.guest_name || 'Unknown';

  useEffect(() => {
    let cancelled = false;
    if (!res?.id) return;
    const supabase = getSupabaseClient();
    supabase.from('folios').select('id, amount, category, description, added_by_name, created_at').eq('reservation_id', res.id).order('created_at')
      .then(({ data, error }) => {
        if (error) console.error('[ResEdit] folio fetch:', error);
        if (cancelled) return;
        const rows = (data || []).filter((f) => !MARKER_RE.test(String(f.category || '') + ' ' + String(f.description || '')));
        setChargeRows(rows);
      });
    return () => { cancelled = true; };
  }, [res?.id, reload]);

  const resFolioExtras = chargeRows.reduce((a, f) => a + (+f.amount || 0), 0);

  async function deleteCharge(f) {
    if (!window.confirm('Delete folio charge?')) return;
    try {
      const r = await fetch('/api/crm/folio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: f.id, reservation_id: res.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'Could not delete charge.');
      setChargeRows((p) => p.filter((x) => x.id !== f.id));
      onSaved?.();
    } catch (e) { alert(e.message || String(e)); }
  }

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
    // Date-edit RBAC mirror (server is authoritative): block non-admins early with a clear message.
    if (!admin) {
      if (checkInDate !== _origCheckIn) { setErr('Only management can change the check-in date.'); return; }
      if (checkOut && _origCheckOut && checkOut < _origCheckOut) { setErr('Check-out can only be extended, not shortened. Ask an admin to reduce it.'); return; }
    }
    if (status === 'CHECKED_OUT' && res.status !== 'CHECKED_OUT' && balance > 0) {
      if (!window.confirm(`${gn} has an outstanding balance of ${bdt(balance)}. Check out anyway? It will be carried forward as Outstanding Due.`)) return;
    }
    setErr(''); setSaving(true);
    try {
      const _r = await fetch('/api/crm/reservation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: res.id, status, paid_amount: paidNum, discount_amount: discountNum, notes, check_in: checkInDate, check_out: checkOut, room_ids: roomArr.filter(Boolean), guest_name: gn }),
      });
      if (_r.status === 401) {
        throw new Error('Your session has expired. Please sign out and sign in again, then retry.');
      }
      const j = await _r.json().catch(() => ({}));
      if (!_r.ok || j.error) throw new Error(j.error || 'Could not save reservation.');
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  const field = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 10, background: 'rgba(255,255,255,.05)', width: '100%', fontSize: 13, minHeight: 42, color: 'var(--iv-ink)' };
  const fieldLocked = { ...field, background: 'rgba(255,255,255,.03)', color: 'var(--iv-ink3)', cursor: 'not-allowed' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };
  const lockHint = { textTransform: 'none', letterSpacing: 0, color: 'var(--iv-gold)', fontWeight: 600 };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.58)', zIndex: 90,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-start justify-between mb-4 pb-4 iv-divider">
          <div><h3 className="text-xl">{gn}</h3><div style={lbl} className="mt-1">Edit Reservation · {(res.room_ids || []).join(', ') || '—'}</div></div>
          <div style={{ textAlign: 'right' }}><div style={lbl}>Balance</div>
            <div className="iv-mono" style={{ fontSize: 20, fontWeight: 700, color: balance > 0 ? '#FF6B6B' : '#7BE04A' }}>{bdt(balance)}</div></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
          <div><label style={lbl}>Check-In{!admin && <span style={lockHint}> · locked</span>}</label>
            <input type="date" style={admin ? field : fieldLocked} value={checkInDate} disabled={!admin} title={admin ? '' : 'Only management can change the check-in date'} onChange={(e) => admin && setCheckInDate(e.target.value)} /></div>
          <div><label style={lbl}>Check-Out{!admin && <span style={lockHint}> · extend only</span>}</label>
            <input type="date" style={field} value={checkOut} min={admin ? undefined : _origCheckOut}
              onChange={(e) => { const v = e.target.value; if (!admin && v && _origCheckOut && v < _origCheckOut) return; setCheckOut(v); }} /></div>
        </div>
        {!admin && <div className="mb-4" style={{ fontSize: 11, color: 'var(--iv-ink3)' }}>Check-in is locked and check-out can only be extended. Contact an admin to change these.</div>}
        {admin && <div className="mb-4" />}

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

        {/* Additional Charges — manual Add-Charge line items, shown separately and visible to
            every staff account, each stamped with who added it. Edit/remove is owner/admin
            only (× hidden for other roles; re-checked on the server). */}
        <div className="mb-4">
          <label style={lbl}>Additional Charges</label>
          {chargeRows.length === 0 && <div className="iv-stat__sub" style={{ fontSize: 12, color: 'var(--iv-ink3)' }}>No additional charges.</div>}
          {chargeRows.map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 13 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{f.description} <span className="iv-badge" style={{ marginLeft: 6 }}>{f.category}</span></span>
                <span style={{ fontSize: 10, color: 'var(--iv-ink3)' }}>by {f.added_by_name || '—'} · {fmtDate(f.created_at)}</span>
              </span>
              <span className="flex items-center gap-2"><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(f.amount)}</span>
                {admin && <button title="Delete charge" onClick={() => deleteCharge(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF6B6B', fontSize: 15, lineHeight: 1 }}>×</button>}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--iv-border2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div className="flex justify-between text-sm" style={{ marginBottom: 3 }}><span style={{ color: 'var(--iv-ink3)' }}>Total{_isUserEditing ? ' (recalc)' : ''}</span><span className="iv-mono">{bdt(totalAmt)}</span></div>
          {discountNum > 0 && <div className="flex justify-between text-sm" style={{ color: '#7BE04A', marginBottom: 3 }}><span>Discount</span><span className="iv-mono">− {bdt(discountNum)}</span></div>}
          <div className="flex justify-between text-sm" style={{ color: '#7BE04A', marginBottom: 3 }}><span>Paid</span><span className="iv-mono">− {bdt(paidNum)}</span></div>
          {extCharge > 0 && <div className="flex justify-between text-sm" style={{ color: '#FF6B6B', marginBottom: 3 }}><span>Stay extension (will post)</span><span className="iv-mono">+ {bdt(extCharge)}</span></div>}
          <div className="flex justify-between" style={{ fontWeight: 700, fontSize: 14, color: balance > 0 ? '#FF6B6B' : '#7BE04A', borderTop: '1px solid var(--iv-border2)', paddingTop: 6, marginTop: 3 }}><span>Balance Due</span><span className="iv-mono">{bdt(balance)}</span></div>
        </div>

        {err && <div className="mb-3 text-sm" style={{ color: '#FF6B6B' }}>{err}</div>}

        <div className="flex justify-between gap-2 flex-wrap iv-foot">
          <div className="flex gap-2 flex-wrap">
            <button className="iv-btn iv-btn--ghost" onClick={() => setShowCharge(true)}>+ Add Charge</button>
            <button className="iv-btn iv-btn--ghost" onClick={() => setShowPay(true)}>Record Payment</button>
            <button className="iv-btn iv-btn--ghost" title="Print booking confirmation voucher"
              onClick={() => printConfirmation({ ...res, check_in: checkInDate, check_out: checkOut, room_ids: roomArr.filter(Boolean), total_amount: totalAmt, discount_amount: discountNum, paid_amount: paidNum, notes, status, guest_name: gn }, rooms, gn, guests)}>Print</button>
          </div>
          <div className="flex gap-2">
            <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>

      {showCharge && (
        <AddChargeModal roomNo={roomArr[0] || res.room_number} resId={res.id}
          onClose={() => setShowCharge(false)} onDone={() => { setReload((r) => r + 1); onSaved?.(); }} />
      )}
      {showPay && (
        <RecordPaymentModal reservation={{ ...res, guest_name: gn, total_amount: totalAmt, discount_amount: discountNum, paid_amount: paidNum }}
          onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); onSaved?.(); }} />
      )}
    </div>
  );
}
