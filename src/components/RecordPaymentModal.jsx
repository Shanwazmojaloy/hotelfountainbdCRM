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
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
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
    inFlight.current = true; setErr(''); setSaving(true);
    try {
      // Phase 3 money route (service role). idempotency_key carries through to the dual-write guard.
      const resp = await fetch('/api/crm/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: r.id, amount: a, type, fiscal_day: fiscalDay, idempotency_key: idemKey.current }),
      });
      if (resp.status === 401) {
        // Transition fallback: session predates the cookie — direct write (allowed until revoke).
        const supabase = getSupabaseClient();
        const { error: txErr } = await supabase.from('transactions').insert({
          room_number: room, guest_name: r.guest_name, type, amount: a,
          fiscal_day: fiscalDay, reservation_id: r.id, tenant_id: TENANT, idempotency_key: idemKey.current,
        });
        if (txErr) {
          if (/23505|duplicate key|uq_transactions_idempotency|uq_payment_tx_idempotency/i.test(txErr.message || '')) { onSaved?.(); onClose?.(); return; }
          throw txErr;
        }
        const { data: fresh } = await supabase.from('reservations').select('paid_amount').eq('id', r.id).single();
        const newPaid = Math.min(net, (+(fresh?.paid_amount || 0)) + a);
        const { error: upErr } = await supabase.from('reservations').update({ paid_amount: newPaid }).eq('id', r.id);
        if (upErr) throw upErr;
      } else {
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || j.error) throw new Error(j.error || 'Could not record payment.');
      }
      onSaved?.(); onClose?.();
    } catch (e) {
      inFlight.current = false; setErr(e.message || String(e)); setSaving(false);
    }
  }

  const field = { padding: '8px 12px', border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8', width: '100%', fontSize: 14 };
  const lbl = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A7F6E', marginBottom: 4, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(43,39,34,0.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 460 }}>
        <h3 className="text-xl mb-1">Record Payment</h3>
        <div className="iv-stat__sub mb-4 pb-4 iv-divider">
          {r.guest_name || 'Guest'} · Room {room || '—'} · Balance <span style={{ color: '#C0566A' }}>{bdt(balance)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label style={lbl}>Amount (৳) *</label>
            <input style={field} type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><label style={lbl}>Date</label>
            <input style={field} type="date" value={fiscalDay} onChange={(e) => setFiscalDay(e.target.value)} /></div>
        </div>
        <div className="mb-4">
          <label style={lbl}>Method</label>
          <select style={field} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>

        {err && <div className="mb-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}

        <div className="flex justify-end gap-3">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button>
        </div>
      </div>
    </div>
  );
}
