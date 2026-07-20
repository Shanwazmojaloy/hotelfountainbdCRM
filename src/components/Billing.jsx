'use client';

// Billing & Invoices — Hotel Fountain Design System master-detail (matches the mockup).
// Left: folio search + status chips + selected Invoice card (Record Payment / Download).
// Right: Today's Collections + Payment Methods. Real data + idempotent RecordPaymentModal.
import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import RecordPaymentModal from './RecordPaymentModal';
import { printInvoice } from '@/lib/printDocs';
import { Card as DSCard, Badge, C } from './dskit';
import { getSnap, warmSnap, setSnap } from '@/lib/snap';
import { openBusinessDay } from '@/lib/businessDay';
import { outstandingList, outstandingTotal } from '@/lib/dues';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const getDhakaDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const REAL_PAY = /payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card/i;
const due = (r) => Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0) - (+r.paid_amount || 0));
const roomOf = (r) => (Array.isArray(r.room_ids) ? r.room_ids.join(', ') : (r.room_number || '—'));
const nightsOf = (r) => { const ci = r.check_in, co = r.check_out; if (!ci || !co) return null; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : null; };

function FRow({ label, value, color, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: sub ? 11 : 12 }}>
      <span style={{ color: 'var(--iv-ink3)' }}>{label}</span>
      <span className="iv-mono" style={{ color: color || 'var(--iv-ink)' }}>{value}</span>
    </div>
  );
}

export default function Billing() {
  // Cache key is fiscal-day-scoped: transactions are TODAY-filtered, so yesterday's
  // snapshot must never seed today's "Today's Collections" (would show stale money).
  const today = getDhakaDate();
  const SNAP_KEY = 'billing.' + today;
  const _cached = getSnap(SNAP_KEY); // hot tier — instant tab→tab revisits
  const [reservations, setReservations] = useState(_cached?.reservations || []);
  const [transactions, setTransactions] = useState(_cached?.transactions || []);
  const [loading, setLoading] = useState(!_cached);
  const [payRes, setPayRes] = useState(null);
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (!getSnap(SNAP_KEY)) {
      const warm = warmSnap(SNAP_KEY); // localStorage tier — instant paint after full reload
      if (warm) { setReservations(warm.reservations || []); setTransactions(warm.transactions || []); setLoading(false); }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchData() {
    if (!getSnap(SNAP_KEY)) setLoading(true); // revisits refresh silently behind cached rows
    try {
      const supabase = getSupabaseClient();
      // NOTE: transactions has NO payment_method column (it lives on payment_transactions).
      // Selecting a non-existent column makes PostgREST 400 the WHOLE query → data:null →
      // this page silently renders ৳0. Method is derived from the `type` string instead.
      // Open business day (latest closed + 1) drives "Today's Collections", not the calendar.
      const { data: closes } = await supabase.from('night_audit_log').select('audit_date, status');
      const openDay = openBusinessDay(closes);
      // C3: reservations + transactions via session-gated route; night_audit_log stays on anon.
      const [rR, tR] = await Promise.all([
        fetch('/api/crm/data?resource=reservations&order=check_out.desc&limit=5000'),
        fetch(`/api/crm/data?resource=transactions&fiscal_day=${encodeURIComponent(openDay)}&cols=id,type,amount,reservation_id,fiscal_day,created_at,guest_name,room_number`),
      ]);
      const rj = await rR.json().catch(() => ({}));
      const tj = await tR.json().catch(() => ({}));
      if (!rR.ok || !tR.ok) console.error('[Billing] query error:', rj.error || tj.error);
      const r = rj.rows || [];
      const t = tj.rows || [];
      setReservations(r);
      setTransactions(t);
      setSnap(SNAP_KEY, { reservations: r, transactions: t });
    } catch (e) {
      console.error('[Billing] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const collected = useMemo(
    () => transactions.filter((t) => !/^\[VOID-DUP\]/.test(t.type || '') && REAL_PAY.test(t.type || '')),
    [transactions],
  );
  const todayRevenue = collected.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  // Outstanding = RECEIVABLES only (CHECKED_IN/CHECKED_OUT) - shared canonical helper (owner decision 2026-06-12)
  const dues = useMemo(() => outstandingList(reservations), [reservations]);
  const outstanding = outstandingTotal(reservations);

  // open folios = in-house or with a balance
  const folios = useMemo(
    () => reservations.filter((r) => r.status === 'CHECKED_IN' || due(r) > 0)
      .sort((a, b) => due(b) - due(a)),
    [reservations],
  );
  const fStatus = (r) => { const paid = +r.paid_amount || 0; if (due(r) <= 0 && paid > 0) return ['Paid', 'green']; if (paid > 0) return ['Partial', 'blue']; return ['Unpaid', 'amber']; };
  const filtered = folios.filter((r) => (roomOf(r) + ' ' + (r.guest_name || '')).toLowerCase().includes(q.trim().toLowerCase()));
  const sel = reservations.find((r) => r.id === activeId) || filtered[0] || folios[0] || null;

  let mCash = 0, mDigital = 0;
  collected.forEach((t) => {
    const amt = Number(t.amount) || 0;
    const blob = ((t.type || '') + ' ' + (t.payment_method || '')).toLowerCase();
    if (/cash/.test(blob)) mCash += amt; else if (/bkash|nagad|card|bank/.test(blob)) mDigital += amt; else mCash += amt;
  });
  const mTotal = (mCash + mDigital) || 1;

  return (
    <div>
      <div className="iv-bill-grid iv-stagger" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* LEFT */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.05)', border: '1px solid var(--iv-border)', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
            <span style={{ color: 'var(--iv-ink3)', fontSize: 13 }}>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folios by room number or guest name…" style={{ background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--iv-body)', fontSize: 12, color: 'var(--iv-ink)', flex: 1 }} />
            {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--iv-ink3)', fontSize: 14 }}>×</button>}
          </div>

          {/* Folio picker — wraps into rows (owner 2026-07-04: standard view, no horizontal scroll) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {filtered.slice(0, 40).map((r) => {
              const [lbl, tone] = fStatus(r);
              const on = sel && r.id === sel.id;
              return (
                <button key={r.id} onClick={() => setActiveId(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', whiteSpace: 'nowrap', background: on ? 'rgba(223,255,69,.12)' : 'rgba(255,255,255,.04)', cursor: 'pointer', border: `1px solid ${on ? 'rgba(223,255,69,.45)' : 'var(--iv-border)'}`, borderRadius: 10, fontFamily: 'var(--iv-body)', fontSize: 11, color: 'var(--iv-ink)', transition: 'background .2s var(--iv-ease), border-color .2s var(--iv-ease)' }}>
                  <span className="iv-mono" style={{ color: 'var(--iv-gold)', fontWeight: 700 }}>{roomOf(r)}</span>
                  <span style={{ fontWeight: on ? 700 : 500 }}>{r.guest_name || 'Guest'}</span>
                  <Badge tone={tone} style={{ fontSize: 7, padding: '1px 6px' }}>{lbl}</Badge>
                </button>
              );
            })}
            {!loading && filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--iv-ink3)', fontStyle: 'italic' }}>No open folios{q ? ` match “${q}”` : ''}.</div>}
          </div>

          {sel ? (() => {
            const [lbl, tone] = fStatus(sel);
            const paid = +sel.paid_amount || 0;
            const billTotal = Math.max(0, (+sel.total_amount || 0) - (+sel.discount_amount || +sel.discount || 0));
            const n = nightsOf(sel);
            const bal = due(sel);
            return (
              <DSCard bodyStyle={{ padding: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'var(--iv-head)', fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)' }}>{sel.guest_name || 'Guest'} — <em style={{ fontStyle: 'italic', color: 'var(--iv-gold)', fontWeight: 400 }}>Invoice</em></div>
                    <div className="iv-mono" style={{ fontSize: 10.5, color: 'var(--iv-ink3)' }}>Rm {roomOf(sel)}{n ? ` · ${n} nights` : ''}</div>
                  </div>
                  <Badge tone={tone}>{lbl}</Badge>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                    <thead><tr>
                      <th style={{ fontFamily: 'var(--iv-body)', fontSize: 8, letterSpacing: '.16em', color: 'var(--iv-ink3)', textTransform: 'uppercase', padding: '8px 0', textAlign: 'left', borderBottom: '2px solid var(--iv-side)', fontWeight: 600 }}>Description</th>
                      <th style={{ fontFamily: 'var(--iv-body)', fontSize: 8, letterSpacing: '.16em', color: 'var(--iv-ink3)', textTransform: 'uppercase', padding: '8px 0', textAlign: 'right', borderBottom: '2px solid var(--iv-side)', fontWeight: 600 }}>Amount</th>
                    </tr></thead>
                    <tbody>
                      <tr><td style={{ padding: '6px 0', fontSize: 12, color: 'var(--iv-ink)', borderBottom: '1px solid var(--iv-border2)' }}>Room Charge — {sel.room_type || 'Room'}{n ? ` (${n} nights)` : ''}</td><td className="iv-mono" style={{ padding: '6px 0', fontSize: 12, textAlign: 'right', color: 'var(--iv-gold)', borderBottom: '1px solid var(--iv-border2)' }}>{bdt(billTotal)}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ background: 'var(--iv-sunken)', border: '1px solid var(--iv-border2)', padding: '10px 14px' }}>
                    <FRow label="Bill Total" value={bdt(billTotal)} />
                    <FRow label="Paid" value={bdt(paid)} color="var(--iv-in-fg)" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, paddingTop: 8, fontFamily: 'var(--iv-head)' }}>
                      <span>Balance Due</span><span className="iv-mono" style={{ color: bal > 0 ? 'var(--iv-rose-fg)' : 'var(--iv-in-fg)' }}>{bdt(bal)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="iv-btn iv-btn--ghost" style={{ flex: 1, fontSize: 12, padding: '8px' }} onClick={async () => {
                      // Invoice needs room rates + this folio's charges — fetched on demand,
                      // STRICTLY reservation_id-scoped (v3.1 anchor rule; room_number is not a join key).
                      const supabase = getSupabaseClient();
                      const [{ data: rms, error: e1 }, { data: fol, error: e2 }, gR] = await Promise.all([
                        supabase.from('rooms').select('room_number, category, price'),
                        supabase.from('folios').select('*').eq('reservation_id', sel.id),
                        (sel.guest_ids || []).length ? fetch(`/api/crm/data?resource=guests&ids=${encodeURIComponent((sel.guest_ids || []).join(','))}`) : Promise.resolve(null),
                      ]);
                      if (e1 || e2) { console.error('[Billing] print fetch error:', e1 || e2); alert('Could not load invoice data — try again.'); return; }
                      const gst = gR ? ((await gR.json().catch(() => ({}))).rows || []) : [];
                      printInvoice(sel, rms || [], sel.guest_name, fol || [], gst);
                    }}>🖨 Print Invoice</button>
                    <button className="iv-btn" style={{ flex: 1, fontSize: 12, padding: '8px' }} disabled={bal <= 0} onClick={() => setPayRes(sel)}>{bal <= 0 ? '✓ Settled' : '✓ Record Payment'}</button>
                  </div>
                </div>
              </DSCard>
            );
          })() : <DSCard><div style={{ padding: 24, textAlign: 'center', color: 'var(--iv-ink3)', fontSize: 12 }}>{loading ? 'Loading folios…' : 'No open folios. 🎉'}</div></DSCard>}
        </div>

        {/* RIGHT */}
        <div style={{ minWidth: 0 }}>
          <DSCard title="Today's" titleAccent="Collections" accent="var(--iv-gold)">
            <div style={{ fontFamily: 'var(--iv-head)', fontSize: 30, fontWeight: 700, color: 'var(--iv-ink)', marginBottom: 4 }}>{bdt(todayRevenue)}</div>
            <div style={{ fontSize: 11, color: 'var(--iv-ink3)' }}>Cash {bdt(mCash)} · Digital {bdt(mDigital)}</div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--iv-border2)', margin: '10px 0' }} />
            <FRow label="Open folios" value={folios.length} sub />
            <FRow label="Outstanding dues" value={bdt(outstanding)} color="var(--iv-due-fg)" sub />
          </DSCard>
          <DSCard title="Payment" titleAccent="Methods">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--iv-ink3)', marginBottom: 4 }}><span>Cash</span><span className="iv-mono" style={{ color: 'var(--iv-ink)' }}>{bdt(mCash)}</span></div>
                <div style={{ height: 6, background: 'var(--iv-border2)' }}><div style={{ height: '100%', width: `${Math.round(mCash / mTotal * 100)}%`, background: 'var(--iv-side)' }} /></div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--iv-ink3)', marginBottom: 4 }}><span>Digital · bKash / Card / Bank</span><span className="iv-mono" style={{ color: 'var(--iv-ink)' }}>{bdt(mDigital)}</span></div>
                <div style={{ height: 6, background: 'var(--iv-border2)' }}><div style={{ height: '100%', width: `${Math.round(mDigital / mTotal * 100)}%`, background: 'var(--iv-gold)' }} /></div>
              </div>
            </div>
          </DSCard>
        </div>
      </div>

      {payRes && (
        <RecordPaymentModal reservation={payRes} onClose={() => setPayRes(null)} onSaved={fetchData} />
      )}

      <style>{`@media (max-width:900px){ .iv-bill-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
