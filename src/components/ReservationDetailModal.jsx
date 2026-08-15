'use client';

// ReservationDetailModal — full reservation view, opened from Reports → Daily Movements
// (and the post-close New Movements table). Reports fetches reservations with a trimmed
// `cols=` projection for speed, so this modal re-reads the FULL row by id through the
// session-gated route rather than rendering a half-populated object. Linked guests are
// resolved the same way, each with a View Details button into GuestDetailModal.
//
// 2026-08-16: Add Charge / Record Payment / Print added at the owner's request, so the desk
// can act on a movement without hunting the same booking down on the Reservations tab.
//
// This does NOT fork the money paths. It mounts the SAME AddChargeModal and
// RecordPaymentModal that ReservationEditModal mounts, so every guard those carry — the
// payment-may-never-exceed-outstanding clamp, the idempotency key, the folio marker rules —
// applies here unchanged, because it is literally the same component. The old "never writes"
// note meant no bespoke write code lives in this file, and that stays true: this screen
// contributes no SQL of its own. Do not inline a write here to save a click.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Badge, MONO, C, bdt } from './dskit';
import GuestDetailModal from './GuestDetailModal';
import AddChargeModal from './AddChargeModal';
import RecordPaymentModal from './RecordPaymentModal';
import { printConfirmation } from '@/lib/printDocs';

const MARKER_RE = /receivable|payment|settlement|advance|refund/i;
const REAL_PAY = /payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card/i;
const isPay = (t) => REAL_PAY.test(t.type ?? '') && !/^\[VOID-DUP\]/.test(t.type ?? '') && !/balance carried forward/i.test(t.type ?? '');

const dueOf = (r) => Math.max(0, (+r?.total_amount || 0) - (+r?.discount_amount || +r?.discount || 0) - (+r?.paid_amount || 0));
const roomsOf = (r) => (Array.isArray(r?.room_ids) ? r.room_ids : (r?.room_number ? [r.room_number] : [])).join(', ') || '—';
const nightsOf = (r) => { const n = Math.round((new Date((r?.check_out || '').slice(0, 10)) - new Date((r?.check_in || '').slice(0, 10))) / 86400000); return Number.isFinite(n) && n > 0 ? n : 0; };

const fmtDay = (d) => { if (!d) return '—'; try { return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return String(d).slice(0, 10); } };
// Actual action stamps are timestamptz — render them in Asia/Dhaka, never the browser's zone.
const fmtStamp = (iso) => { if (!iso) return null; try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return null; } };

const ST_TONE = { CHECKED_IN: 'blue', RESERVED: 'teal', PENDING: 'amber', CHECKED_OUT: 'gold', CANCELLED: 'rose' };

function Row({ label, value, sub, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 13 }}>
      <span style={{ color: 'var(--iv-ink3)', flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ color: color || 'var(--iv-ink)' }}>{value || '—'}</span>
        {sub ? <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iv-ink3)', ...MONO }}>{sub}</span> : null}
      </span>
    </div>
  );
}

export default function ReservationDetailModal({ reservation, reservationId, txs, onClose, onSaved }) {
  const id = reservationId || reservation?.id;
  // A trimmed Reports row is a usable first paint, but it is NOT the full record — always refetch.
  const [res, setRes] = useState(reservation || null);
  const [guests, setGuests] = useState([]);
  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState(null); // null = still resolving
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detailGuest, setDetailGuest] = useState(null);
  const [showCharge, setShowCharge] = useState(false);
  const [showPay, setShowPay] = useState(false);
  // Bumped after a charge or payment lands so this modal re-reads its own figures — the
  // balance on screen must never be the pre-write one.
  const [reload, setReload] = useState(0);
  // Rooms carry the rate and category the printed voucher needs. Reports' own rooms query
  // omits room_number, which is the key printConfirmation matches on, so fetch them here.
  const [rooms, setRooms] = useState([]);
  const [hotelSettings, setHotelSettings] = useState(null);

  useEffect(() => {
    if (!id) { setLoading(false); setErr('Missing reservation.'); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/crm/data?resource=reservations&ids=${encodeURIComponent(id)}`);
        const j = await r.json().catch(() => ({}));
        const full = (j.rows || [])[0];
        if (cancelled) return;
        if (!full) { setErr('Reservation not found.'); setLoading(false); return; }
        setRes(full);

        const gids = (full.guest_ids || []).filter(Boolean);
        if (gids.length) {
          const gr = await fetch(`/api/crm/data?resource=guests&ids=${encodeURIComponent(gids.join(','))}`);
          const gj = await gr.json().catch(() => ({}));
          if (!cancelled) {
            // Preserve the reservation's own guest ORDER (primary first) — `ids` returns name-sorted.
            const byId = {}; (gj.rows || []).forEach((x) => { byId[String(x.id)] = x; });
            setGuests(gids.map((x) => byId[String(x)]).filter(Boolean));
          }
        }
      } catch {
        if (!cancelled) setErr('Could not load this reservation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, reload]);

  // Rooms + hotel settings for the printed voucher. Both are small, both are non-fatal:
  // printConfirmation degrades to its own fallbacks if either never resolves, so Print works
  // regardless.
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();
    supabase.from('rooms').select('room_number, price, category')
      .then(({ data }) => { if (!cancelled) setRooms(data || []); });
    supabase.from('hotel_settings').select('key, value')
      .then(({ data }) => {
        if (cancelled) return;
        setHotelSettings(Object.fromEntries((data || []).map((r) => [r.key, r.value])));
      });
    return () => { cancelled = true; };
  }, []);

  // Folio line items — same anon read + same marker filter as ReservationEditModal, so the
  // "Additional Charges" list reads identically on both screens.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSupabaseClient().from('folios')
      .select('id, amount, category, description, added_by_name, created_at')
      .eq('reservation_id', id).order('created_at')
      .then(({ data }) => {
        if (cancelled) return;
        setCharges((data || []).filter((f) => !MARKER_RE.test(String(f.category || '') + ' ' + String(f.description || ''))));
      });
    return () => { cancelled = true; };
  }, [id, reload]);

  // Payments: Reports already holds the day's transactions, so it passes them in and we skip a
  // network round trip. Standalone callers fall back to the shared trimmed projection.
  // After a payment is recorded here, `txs` from Reports is a beat stale, so a local reload
  // re-reads from the route instead of trusting the passed-in array.
  useEffect(() => {
    if (!id) return;
    if (Array.isArray(txs) && reload === 0) { setPayments(txs.filter((t) => t.reservation_id === id && isPay(t))); return; }
    let cancelled = false;
    fetch('/api/crm/data?resource=transactions&cols=id,type,amount,reservation_id,fiscal_day,created_at,guest_name,room_number')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setPayments((j.rows || []).filter((t) => t.reservation_id === id && isPay(t))); })
      .catch(() => { if (!cancelled) setPayments([]); });
    return () => { cancelled = true; };
  }, [id, txs, reload]);

  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };
  const balance = res ? dueOf(res) : 0;
  const st = String(res?.status || '').toUpperCase();
  const paid = +res?.paid_amount || 0;
  const discount = +res?.discount_amount || +res?.discount || 0;

  return (
    <>
      <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.58)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto' }}>
          <div className="flex items-start justify-between mb-4 pb-4 iv-divider">
            <div>
              <h3 className="text-xl">{res?.guest_name || guests[0]?.name || (loading ? 'Loading…' : 'Reservation')}</h3>
              <div style={lbl} className="mt-1">Reservation Details · Room {roomsOf(res)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={lbl}>Balance</div>
              <div className="iv-mono" style={{ fontSize: 20, fontWeight: 700, color: balance > 0 ? C.rose : C.grn }}>{bdt(balance)}</div>
            </div>
          </div>

          {loading && <div style={{ fontSize: 12, color: C.ink3, padding: '10px 0' }}>Loading reservation…</div>}
          {err && <div className="mb-3 text-sm" style={{ color: C.rose }}>{err}</div>}

          {res && (
            <>
              {/* ── Guests — primary first, each with a jump into the full guest profile ── */}
              <div className="mb-4">
                <label style={lbl}>Guest{guests.length > 1 ? 's' : ''}</label>
                {guests.length === 0 && (
                  <div style={{ fontSize: 12.5, color: 'var(--iv-ink)' }}>
                    {res.guest_name || 'Unknown'} <span style={{ color: C.ink3, fontSize: 11 }}>· no linked guest record</span>
                  </div>
                )}
                {guests.map((g, i) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < guests.length - 1 ? '1px solid var(--iv-border2)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--iv-ink)' }}>{g.name}</div>
                      <div style={{ fontSize: 10.5, color: C.ink3, ...MONO }}>
                        {i === 0 ? 'Primary' : 'Secondary'}{g.phone ? ` · ${g.phone}` : ''}{g.id_image_url ? ' · ID on file' : ''}
                      </div>
                    </div>
                    <button className="iv-btn iv-btn--ghost" style={{ fontSize: 11.5, padding: '4px 11px' }} onClick={() => setDetailGuest(g)}>View Details</button>
                  </div>
                ))}
              </div>

              {/* ── Stay — scheduled dates AND the actual check-in / check-out stamps ── */}
              <div className="mb-4">
                <Row label="Status" value={<Badge tone={ST_TONE[st] || 'neutral'}>{st.replace('_', ' ') || '—'}</Badge>} />
                <Row label="Check-In" value={fmtDay(res.check_in)} sub={fmtStamp(res.checked_in_at) ? `actual · ${fmtStamp(res.checked_in_at)}` : 'not yet checked in'} />
                <Row label="Check-Out" value={fmtDay(res.check_out)} sub={fmtStamp(res.checked_out_at) ? `actual · ${fmtStamp(res.checked_out_at)}` : 'not yet checked out'} />
                <Row label="Nights" value={nightsOf(res) || '—'} />
                <Row label="Room(s)" value={roomsOf(res)} />
                {res.on_duty_officer ? <Row label="On-Duty Officer" value={res.on_duty_officer} /> : null}
                {res.breakfast_included ? <Row label="Breakfast" value="🍳 Included" /> : null}
                {(res.notes || res.special_requests) ? <Row label="Notes" value={res.notes || res.special_requests} /> : null}
              </div>

              {charges.length > 0 && (
                <div className="mb-4">
                  <label style={lbl}>Additional Charges</label>
                  {charges.map((f) => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 12.5 }}>
                      <span>{f.description} <span className="iv-badge" style={{ marginLeft: 6 }}>{f.category}</span></span>
                      <span className="iv-mono" style={{ color: C.gold }}>{bdt(f.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-4">
                <label style={lbl}>Payments</label>
                {payments === null && <div style={{ fontSize: 12, color: C.ink3 }}>Loading payments…</div>}
                {payments !== null && payments.length === 0 && <div style={{ fontSize: 12, color: C.ink3 }}>No payments recorded against this reservation.</div>}
                {(payments || []).map((t) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 12.5 }}>
                    <span>{t.type || 'Payment'} <span style={{ fontSize: 10.5, color: C.ink3, ...MONO }}>· {(t.fiscal_day || t.created_at || '').slice(0, 10)}</span></span>
                    <span className="iv-mono" style={{ color: C.grn }}>{bdt(t.amount)}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--iv-border2)', borderRadius: 10, padding: '10px 14px' }}>
                <div className="flex justify-between text-sm" style={{ marginBottom: 3 }}><span style={{ color: C.ink3 }}>Total</span><span className="iv-mono">{bdt(res.total_amount)}</span></div>
                {discount > 0 && <div className="flex justify-between text-sm" style={{ color: C.grn, marginBottom: 3 }}><span>Discount</span><span className="iv-mono">− {bdt(discount)}</span></div>}
                <div className="flex justify-between text-sm" style={{ color: C.grn, marginBottom: 3 }}><span>Paid</span><span className="iv-mono">− {bdt(paid)}</span></div>
                <div className="flex justify-between" style={{ fontWeight: 700, fontSize: 14, color: balance > 0 ? C.rose : C.grn, borderTop: '1px solid var(--iv-border2)', paddingTop: 6, marginTop: 3 }}>
                  <span>Balance Due</span><span className="iv-mono">{bdt(balance)}</span>
                </div>
              </div>
            </>
          )}

          {/* Actions mirror ReservationEditModal. Disabled until the full row has loaded —
              AddChargeModal and RecordPaymentModal both need a real reservation, and
              RecordPaymentModal derives its outstanding-balance clamp from these figures. */}
          <div className="flex justify-end gap-3 iv-foot" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <button className="iv-btn iv-btn--ghost" disabled={!res} onClick={() => setShowCharge(true)}>+ Add Charge</button>
            <button className="iv-btn iv-btn--ghost" disabled={!res} onClick={() => setShowPay(true)}>Record Payment</button>
            <button
              className="iv-btn iv-btn--ghost"
              disabled={!res}
              onClick={() => printConfirmation(res, rooms, guests[0]?.name || res?.guest_name, guests, hotelSettings)}
            >Print</button>
            <button className="iv-btn iv-btn--ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {detailGuest && <GuestDetailModal guest={detailGuest} onClose={() => setDetailGuest(null)} />}
      {showCharge && res && (
        <AddChargeModal
          roomNo={(Array.isArray(res.room_ids) ? res.room_ids[0] : null) || res.room_number}
          resId={res.id}
          onClose={() => setShowCharge(false)}
          onDone={() => { setShowCharge(false); setReload((n) => n + 1); onSaved?.(); }}
        />
      )}
      {showPay && res && (
        <RecordPaymentModal
          reservation={res}
          onClose={() => setShowPay(false)}
          onSaved={() => { setShowPay(false); setReload((n) => n + 1); onSaved?.(); }}
        />
      )}
    </>
  );
}
