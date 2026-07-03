'use client';

// CheckActionModal — WRITE flow: check-in (RESERVED->CHECKED_IN, rooms OCCUPIED) or
// check-out (CHECKED_IN->CHECKED_OUT, rooms DIRTY; trg_auto_housekeeping makes the task).
// Mirrors the legacy ReservationDetail status transitions. Warns on outstanding balance.
import { useState } from 'react';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const due = (r) => Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0) - (+r.paid_amount || 0));

export default function CheckActionModal({ reservation, action, onClose, onSaved }) {
  const r = reservation;
  const isOut = action === 'checkout';
  const balance = due(r);
  const roomNos = Array.isArray(r.room_ids) ? r.room_ids : (r.room_number ? [r.room_number] : []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    setErr(''); setSaving(true);
    try {
      const resp = await fetch('/api/crm/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isOut ? 'checkout' : 'checkin', reservation_id: r.id }),
      });
      if (resp.status === 401) {
        // Server session lapsed (12h). The old anon-write fallback was revoked by RLS hardening,
        // so surface a clear re-login prompt instead of a confusing 'permission denied'.
        throw new Error('Your session has expired. Please sign out and sign in again, then retry.');
      }
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || j.error) throw new Error(j.error || 'Could not complete.');
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-1">{isOut ? 'Check Out' : 'Check In'}</h3>
        <div className="iv-stat__sub mb-4 pb-4 iv-divider">
          {r.guest_name || 'Guest'} · Room {roomNos.join(', ') || '—'}
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--iv-ink2)' }}>
          {isOut
            ? <>This will mark the reservation <strong>Checked Out</strong> and set room {roomNos.join(', ')} to <strong>Dirty</strong> (a housekeeping task is created automatically).</>
            : <>This will mark the reservation <strong>Checked In</strong> and set room {roomNos.join(', ')} to <strong>Occupied</strong>.</>}
        </p>

        {isOut && balance > 0 && (
          <div className="mb-4 text-sm" style={{ background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 8, padding: '10px 12px', color: '#FF6B6B' }}>
            ⚠ Outstanding balance of <strong>{bdt(balance)}</strong>. You can still check out, but consider collecting payment first (Billing → Collect).
          </div>
        )}

        {err && <div className="mb-3 text-sm" style={{ color: '#FF6B6B' }}>{err}</div>}

        <div className="flex justify-end gap-3 iv-foot">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={go} disabled={saving}>{saving ? 'Saving…' : (isOut ? 'Confirm Check-Out' : 'Confirm Check-In')}</button>
        </div>
      </div>
    </div>
  );
}
