'use client';

// RecordPaymentModal — WRITE flow (MONEY). Mirrors the legacy RecordPayModal path
// EXACTLY (the one fixed for idempotency this session):
//   1. insert into `transactions` with a per-open idempotency_key (dual-write trigger
//      mirrors to payment_transactions; uq_transactions_idempotency + key-aware guard
//      block duplicates).
//   2. on 23505 (already landed) -> treat as success, DO NOT re-bump paid_amount.
//   3. else update reservations.paid_amount (owner-confirmed due-math source of truth),
//      floored at the net bill so it can't push a balance negative.
import { useState, useRef } from 'react';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const getDhakaDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const TYPES = ['Room Payment (Cash)', 'Room Payment (Bkash)', 'Room Payment (Card)', 'Advance Payment', 'Room Payment (Bank Transfer)'];

export default function RecordPaymentModal({ reservation, onClose, onSaved }) {
  const r = reservation;
  const net = Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0));
  const paid = +r.paid_amount || 0;
  const balance = Math.max(0, net - paid);
  const room = Array.isArray(r.room_ids) ? r.room_ids[0] : r.room_number;
  // Owner rule 2026-07-01: a payment may never exceed the outstanding balance (no double-count /
  // overpay). Clamp keystrokes to `balance`; server re-validates as source of truth.
  const clampAmt = (v) => { if (v === '') return ''; const n = Math.max(0, +v || 0); return balance > 0 ? String(Math.min(n, balance)) : '0'; };

  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');
  const [type, setType] = useState('Room Payment (Cash)');
  const [fiscalDay, setFiscalDay] = useState(getDhakaDate());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const idemKey = useRef(crypto.randomUUID());
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    const a = +amount;
    if (!a || a <= 0) return setErr('Enter a valid amount.');
    if (balance <= 0) return setErr('This reservation is already fully settled.');
    if (a > balance) return setErr('Amount cannot exceed the outstanding balance of ' + bdt(balance) + '.');
    inFlight.current = true; setErr(''); setSaving(true);
    try {
      // Phase 3 money route (service role). idempotency_key carries through to the dual-write guard.
      const resp = await fetch('/api/crm/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: r.id, amount: a, type, fiscal_day: fiscalDay, idempotency_key: idemKey.current }),
      });
      if (resp.status === 401) {
        throw new Error('Your session has expired. Please sign out and sign in again, then retry.');
      }
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || j.error) throw new Error(j.error || 'Could not record payment.');
      onSaved?.(); onClose?.();
    } catch (e) {
      inFlight.current = false; setErr(e.message || String(e)); setSaving(false);
    }
  }

  const field = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 10, background: 'rgba(255,255,255,.05)', width: '100%', fontSize: 13, minHeight: 42, color: 'var(--iv-ink)' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-1">Record Payment</h3>
        <div className="iv-stat__sub mb-4 pb-4 iv-divider">
          {r.guest_name || 'Guest'} · Room {room || '—'} · Balance <span style={{ color: '#FF6B6B' }}>{bdt(balance)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div><label style={lbl}>Amount (৳) *</label>
            <input style={field} type="number" inputMode="numeric" min="0" max={balance > 0 ? balance : undefined} value={amount} onChange={(e) => setAmount(clampAmt(e.target.value))} autoFocus />
            <div style={{ fontSize: 10, color: 'var(--iv-ink3)', marginTop: 4 }}>Max: {bdt(balance)}</div></div>
          <div><label style={lbl}>Date</label>
            <input style={field} type="date" value={fiscalDay} onChange={(e) => setFiscalDay(e.target.value)} /></div>
        </div>
        <div className="mb-4">
          <label style={lbl}>Method</label>
          <select style={field} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>

        {err && <div className="mb-3 text-sm" style={{ color: '#FF6B6B' }}>{err}</div>}

        <div className="flex justify-end gap-3 iv-foot">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={save} disabled={saving || balance <= 0}>{saving ? 'Saving…' : 'Record Payment'}</button>
        </div>
      </div>
    </div>
  );
}
