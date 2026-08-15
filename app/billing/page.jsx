'use client';

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import Layout from "@/components/Layout";
import BillingCard from "@/components/BillingCard";
import ProgressRing from "@/components/ProgressRing";
import QueryProvider from "@/providers/QueryProvider";
import { C, Card as DSCard, Badge } from "@/components/dskit";
import RecordPaymentModal from "@/components/RecordPaymentModal";
import UiFonts from "../components/UiFonts";
import { isRealPayment, txDay, discountOf } from "@/lib/dues";

function FRow({ label, value, color, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: sub ? 11 : 12 }}>
      <span style={{ color: 'var(--iv-ink3)' }}>{label}</span>
      <span className="iv-mono" style={{ color: color || 'var(--iv-ink)' }}>{value}</span>
    </div>
  );
}

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');

// Host-routed singleton (sends x-tenant-host) — RLS scopes rows to the tenant,
// same path /churn uses. Replaces the old createClient + NEXT_PUBLIC_TENANT_ID
// path, which resolved no tenant under host-routed RLS (showed all zeros).

function computeBill(invoice) {
  // Extracted from original App.jsx logic
  const total = Number(invoice?.total_amount || 0);
  const paid = (invoice?.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return { total, paid, balance: total - paid };
}

function BillingPageInner() {
  const [billingData, setBillingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("TODAY");
  const [stats, setStats] = useState({ revenue: 0, occupancy: 0 });
  const [activeId, setActiveId] = useState(null);
  const [q, setQ] = useState("");
  const [payFolio, setPayFolio] = useState(null);
  const [orphans, setOrphans] = useState([]); // unattributable transactions — surfaced, never merged

  useEffect(() => {
    fetchBillingData();
  }, [filter]);

  async function fetchBillingData() {
    setBillingData([]); // immediate cleanup before network round-trip
    setOrphans([]);
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      // C3: reservations + transactions via the session-gated route; rooms stays on anon.
      const [resR, txR] = await Promise.all([
        fetch('/api/crm/data?resource=reservations&order=check_in.desc&limit=5000'),
        fetch('/api/crm/data?resource=transactions'),
      ]);
      const reservations = ((await resR.json().catch(() => ({}))).rows) || [];
      const transactions = ((await txR.json().catch(() => ({}))).rows) || [];

      const { data: rooms } = await supabase
        .from("rooms")
        .select("id, room_number, status");

      // Group by reservation UUID — prevents key collisions when guest_name is null
      const unifiedGroups = {};

      reservations.forEach((res) => {
        unifiedGroups[res.id] = { res, txs: [] };
      });

      // RESERVATION-CENTRIC ANCHOR (house rule). A transaction belongs to a folio only
      // via reservation_id. The previous fallback re-attached orphans by room_number +
      // date overlap, which merged a DELETED booking's money into whoever occupied the
      // room next — the exact 13,600 BDT failure the rule exists to prevent. Both range
      // ends were inclusive, so on a changeover day an orphan always landed on the
      // ARRIVING guest (reservations are fetched check_in.desc, so .find() hit them
      // first). Orphans are now surfaced, never silently merged. Audit 2026-08-15 C-3.
      const orphanTxs = [];

      transactions.forEach((tx) => {
        if (tx.reservation_id && unifiedGroups[tx.reservation_id]) {
          unifiedGroups[tx.reservation_id].txs.push(tx);
          return;
        }
        // No reservation_id, or it points at a reservation outside the fetched window.
        // Either way this is not attributable — flag it for a human.
        orphanTxs.push(tx);
      });

      // 🔥 THE DHAKA ANCHOR
      const getDhakaDate = () => {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Dhaka',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());
      };

      const todayDhaka = getDhakaDate();

      // Date range bounds for WEEK/MONTH filters
      const getFilterBounds = () => {
        const today = new Date(todayDhaka);
        if (filter === 'WEEK') {
          const start = new Date(today); start.setDate(today.getDate() - 6);
          return { from: start.toISOString().slice(0, 10), to: todayDhaka };
        }
        if (filter === 'MONTH') {
          const start = new Date(today); start.setDate(1);
          return { from: start.toISOString().slice(0, 10), to: todayDhaka };
        }
        return { from: todayDhaka, to: todayDhaka };
      };
      const { from: dateFrom, to: dateTo } = getFilterBounds();

      // --- LEDGER FILTER ---
      const displayList = Object.values(unifiedGroups)
        .map(grp => {
          const invoice = grp.res;
          const totalAmount = Number(invoice?.total_amount || 0);
          const discountAmount = discountOf(invoice);
          const billTotal = totalAmount - discountAmount;

          // Use paid_amount from reservations table (DB-authoritative)
          const totalPaidEver = Number(invoice?.paid_amount || 0);
          const balanceDue = Math.max(0, billTotal - totalPaidEver);

          // Payments collected within the active date range. POSITIVE match via the
          // canonical isRealPayment() — the old exclusion-only filter ("anything that
          // isn't Balance Carried Forward") counted CHARGES as cash: on 2026-08-07 that
          // reported 63,000 BDT against 41,500 BDT actually collected, because five
          // `Stay Extension (+1 night)` rows passed it. Migration 20260808 fixed the RPC
          // and Billing.jsx; this page was missed. Audit 2026-08-15 H-7.
          const collectionToday = grp.txs
            .filter((t) => { const d = txDay(t); return isRealPayment(t) && d >= dateFrom && d <= dateTo; })
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

          return { ...grp, billTotal, collectionToday, balanceDue, paidInReportPeriod: collectionToday, status: invoice?.status };
        })
        .filter(grp => {
          return grp.status === 'CHECKED_IN' || grp.collectionToday > 0 || grp.balanceDue > 0;
        });

      // Compute stats
      const revenue = displayList.reduce((sum, item) => sum + (item.paidInReportPeriod || 0), 0);
      const occupiedRooms = rooms.filter((r) => r.status === "OCCUPIED").length;
      const occupancy = rooms.length > 0 ? Math.round((occupiedRooms / rooms.length) * 100) : 0;

      setBillingData(displayList);
      setOrphans(orphanTxs);
      setStats({ revenue, occupancy });
    } catch (error) {
      console.error("Billing fetch error:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-96">
          <div className="iv-stat__sub">Loading billing ledger…</div>
        </div>
      </Layout>
    );
  }

  // ---- design-system master-detail derivations ----
  const dhaka = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fName = (g) => g.res?.guest_name || 'Guest';
  const fRoom = (g) => Array.isArray(g.res?.room_ids) ? g.res.room_ids.join(', ') : (g.res?.room_number || '—');
  const fNights = (g) => { const ci = g.res?.check_in, co = g.res?.check_out; if (!ci || !co) return null; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : null; };
  const fStatus = (g) => { const paid = +g.res?.paid_amount || 0; if ((g.balanceDue || 0) <= 0 && paid > 0) return ['Paid', 'green']; if (paid > 0) return ['Partial', 'blue']; return ['Unpaid', 'amber']; };
  const filteredFolios = billingData.filter((g) => (fRoom(g) + ' ' + fName(g)).toLowerCase().includes(q.trim().toLowerCase()));
  const sel = billingData.find((g) => g.res?.id === activeId) || filteredFolios[0] || billingData[0] || null;

  let mCash = 0, mDigital = 0;
  billingData.forEach((g) => (g.txs || []).forEach((t) => {
    if (!isRealPayment(t)) return;          // audit 2026-08-15 H-7 — was exclusion-only
    if (txDay(t) !== dhaka) return;
    const amt = Number(t.amount) || 0;
    const blob = ((t.type || '') + ' ' + (t.payment_method || '')).toLowerCase();
    if (/cash/.test(blob)) mCash += amt; else if (/bkash|card|bank/.test(blob)) mDigital += amt; else mCash += amt;
  }));
  const mTotal = (mCash + mDigital) || 1;

  const orphanTotal = orphans.reduce((a, t) => a + (Number(t.amount) || 0), 0);

  return (
    <Layout>
      {orphans.length > 0 && (
        <div
          role="alert"
          style={{
            border: '1px solid #B45309', background: '#FEF6E7', padding: '12px 16px',
            marginBottom: 12, fontSize: 12, color: '#7C2D12',
            transition: 'all .2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <strong style={{ letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 11 }}>
            ⚠ {orphans.length} unattributed transaction{orphans.length === 1 ? '' : 's'} · {bdt(orphanTotal)}
          </strong>
          <div style={{ marginTop: 6, lineHeight: 1.5 }}>
            These rows carry no <code>reservation_id</code>, so they belong to no folio. They are
            deliberately <em>not</em> merged into any guest&rsquo;s bill and are excluded from the
            figures below. Reconcile them before the next day close.
          </div>
          <div className="iv-mono" style={{ marginTop: 8, fontSize: 11, color: '#92400E' }}>
            {orphans.slice(0, 8).map((t) => (
              <div key={t.id ?? `${t.created_at}-${t.amount}`}>
                {txDay(t)} · room {t.room_number || '—'} · {t.type || 'unknown'} · {bdt(t.amount)}
              </div>
            ))}
            {orphans.length > 8 && <div>… and {orphans.length - 8} more</div>}
          </div>
        </div>
      )}
      <div className="iv-bill-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* LEFT — folio search + invoice */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--iv-border)', padding: '8px 12px', marginBottom: 12 }}>
            <span style={{ color: 'var(--iv-ink3)', fontSize: 13 }}>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folios by room number or guest name…" style={{ background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--iv-body)', fontSize: 12, color: 'var(--iv-ink)', flex: 1 }} />
            {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--iv-ink3)', fontSize: 14 }}>×</button>}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
            {filteredFolios.map((g) => {
              const [lbl, tone] = fStatus(g);
              const on = sel && g.res?.id === sel.res?.id;
              return (
                <button key={g.res?.id} onClick={() => setActiveId(g.res?.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', whiteSpace: 'nowrap', flexShrink: 0, background: on ? '#fff' : 'transparent', cursor: 'pointer', border: '1px solid var(--iv-border)', borderTop: `3px solid ${on ? 'var(--iv-side)' : 'var(--iv-border)'}`, fontFamily: 'var(--iv-body)', fontSize: 11, color: 'var(--iv-ink)' }}>
                  <span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{fRoom(g)}</span>
                  <span style={{ fontWeight: 500 }}>{fName(g)}</span>
                  <Badge tone={tone} style={{ fontSize: 7, padding: '1px 6px' }}>{lbl}</Badge>
                </button>
              );
            })}
            {filteredFolios.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--iv-ink3)', fontStyle: 'italic' }}>No folios match “{q}”.</div>}
          </div>

          {sel ? (() => {
            const [lbl, tone] = fStatus(sel);
            const paid = +sel.res?.paid_amount || 0;
            const cat = sel.res?.category || sel.res?.room_category || 'Room';
            const n = fNights(sel);
            return (
              <DSCard bodyStyle={{ padding: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'var(--iv-head)', fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)' }}>{fName(sel)} — <em style={{ fontStyle: 'italic', color: 'var(--iv-gold)', fontWeight: 400 }}>Invoice</em></div>
                    <div className="iv-mono" style={{ fontSize: 10.5, color: 'var(--iv-ink3)' }}>Rm {fRoom(sel)}{n ? ` · ${n} nights` : ''}</div>
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
                      <tr><td style={{ padding: '6px 0', fontSize: 12, color: 'var(--iv-ink)', borderBottom: '1px solid var(--iv-border2)' }}>Room Charge — {cat}{n ? ` (${n} nights)` : ''}</td><td className="iv-mono" style={{ padding: '6px 0', fontSize: 12, textAlign: 'right', color: 'var(--iv-gold)', borderBottom: '1px solid var(--iv-border2)' }}>{bdt(sel.billTotal)}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ background: 'var(--iv-sunken)', border: '1px solid var(--iv-border2)', padding: '10px 14px' }}>
                    <FRow label="Bill Total" value={bdt(sel.billTotal)} />
                    <FRow label="Paid" value={bdt(paid)} color="var(--iv-in-fg)" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, paddingTop: 8, fontFamily: 'var(--iv-head)' }}>
                      <span>Balance Due</span><span className="iv-mono" style={{ color: sel.balanceDue > 0 ? 'var(--iv-rose-fg)' : 'var(--iv-in-fg)' }}>{bdt(sel.balanceDue)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="iv-btn iv-btn--ghost" style={{ flex: 1, fontSize: 9.5, padding: '8px' }} onClick={() => window.print()}>🖨 Print</button>
                    <button className="iv-btn" style={{ flex: 1, fontSize: 9.5, padding: '8px' }} disabled={sel.balanceDue <= 0} onClick={() => setPayFolio(sel.res)}>{sel.balanceDue <= 0 ? '✓ Settled' : '✓ Record Payment'}</button>
                  </div>
                </div>
              </DSCard>
            );
          })() : <DSCard><div style={{ padding: 24, textAlign: 'center', color: 'var(--iv-ink3)', fontSize: 12 }}>No open folios.</div></DSCard>}
        </div>

        {/* RIGHT — collections + methods */}
        <div>
          <DSCard title="Today's" titleAccent="Collections" accent="var(--iv-gold)">
            <div style={{ fontFamily: 'var(--iv-head)', fontSize: 30, fontWeight: 700, color: 'var(--iv-ink)', marginBottom: 4 }}>{bdt(stats.revenue)}</div>
            <div style={{ fontSize: 11, color: 'var(--iv-ink3)' }}>Cash {bdt(mCash)} · Digital {bdt(mDigital)}</div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--iv-border2)', margin: '10px 0' }} />
            <FRow label="Active folios" value={billingData.length} sub />
            <FRow label="Occupancy" value={`${stats.occupancy}%`} sub />
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

      {payFolio && <RecordPaymentModal reservation={payFolio} onClose={() => setPayFolio(null)} onSaved={() => { setPayFolio(null); fetchBillingData(); }} />}

      <style>{`@media (max-width:900px){ .iv-bill-grid{ grid-template-columns:1fr !important; } }`}</style>
    </Layout>
  );
}

// BillingCard uses React Query (useCheckout); provide the client here.
export default function BillingPage() {
  return (
    <QueryProvider>
      <UiFonts />
      <BillingPageInner />
    </QueryProvider>
  );
}
