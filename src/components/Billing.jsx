'use client';

// Billing — ported from legacy crm-src.jsx BillingPage (overview / read-only).
// Shows today's collected revenue, outstanding dues, and today's collections.
// Canonical due = max(0, total - discount - paid) (owner-confirmed source of truth).
// Actual payment recording routes to the main /crm.html (proven money path). No writes here.
import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase() || '?';
const getDhakaDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Real cash-in only (mirrors legacy _isRealPayment): excludes charges / BCF.
const REAL_PAY = /payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card/i;
const due = (r) => Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0) - (+r.paid_amount || 0));

export default function Billing() {
  const [reservations, setReservations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = getDhakaDate();

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: r }, { data: t }] = await Promise.all([
        supabase.from('reservations').select('*').order('check_out', { ascending: false }).limit(5000),
        supabase.from('transactions').select('*').eq('fiscal_day', today),
      ]);
      setReservations(r || []);
      setTransactions(t || []);
    } catch (e) {
      console.error('[Billing] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  // today's real collections (exclude tagged void-dups + non-payment markers)
  const collected = useMemo(
    () => transactions.filter((t) => !/^\[VOID-DUP\]/.test(t.type || '') && REAL_PAY.test(t.type || '')),
    [transactions],
  );
  const todayRevenue = collected.reduce((a, t) => a + (Number(t.amount) || 0), 0);

  const dues = useMemo(
    () => reservations
      .filter((r) => (r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT') && due(r) > 0)
      .sort((a, b) => due(b) - due(a)),
    [reservations],
  );
  const outstanding = dues.reduce((a, r) => a + due(r), 0);

  const roomOf = (r) => (Array.isArray(r.room_ids) ? r.room_ids.join(', ') : (r.room_number || '—'));
  const goPay = () => { window.location.href = '/crm.html'; };

  return (
    <div>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Billing &amp; Invoices</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Today Revenue</div>
          <div className="iv-stat__val">{loading ? '—' : bdt(todayRevenue)}</div>
          <div className="iv-stat__sub">Collected today · Asia/Dhaka</div>
        </div>
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Outstanding Dues</div>
          <div className="iv-stat__val iv-due">{loading ? '—' : bdt(outstanding)}</div>
          <div className="iv-stat__sub">Across {dues.length} open folio{dues.length === 1 ? '' : 's'}</div>
        </div>
        <div className="iv-card iv-card--hover flex items-center justify-between">
          <div>
            <div className="iv-stat__lbl">Record a Payment</div>
            <div className="iv-stat__sub mt-1">Opens the main CRM folio</div>
          </div>
          <button className="iv-btn" onClick={goPay}>+ Payment</button>
        </div>
      </div>

      {/* Outstanding dues */}
      <div className="iv-card mb-6">
        <h3 className="text-lg mb-6 pb-4 iv-divider">Outstanding Dues</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#8A7F6E', borderBottom: '1px solid #EAE3D6' }}>
                {['Guest', 'Room', 'Check-Out', 'Total', 'Paid', 'Balance', ''].map((h) => (
                  <th key={h} className="text-left py-2 font-normal whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-3 iv-stat__sub">Loading…</td></tr>}
              {!loading && dues.length === 0 && <tr><td colSpan={7} className="py-3 iv-stat__sub">No outstanding dues. 🎉</td></tr>}
              {dues.slice(0, 100).map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F0EBE0' }}>
                  <td className="py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 99,
                        background: 'rgba(139,105,20,0.12)', color: '#8B6914', fontSize: 10, fontWeight: 700 }}>{initials(r.guest_name)}</span>
                      <span style={{ color: '#2B2722' }}>{r.guest_name || 'Guest'}</span>
                    </span>
                  </td>
                  <td className="py-2"><span className="iv-badge">{roomOf(r)}</span></td>
                  <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{(r.check_out || '').slice(0, 10) || '—'}</td>
                  <td className="py-2 text-xs iv-mono" style={{ color: '#8B6914' }}>{bdt(r.total_amount)}</td>
                  <td className="py-2 text-xs iv-mono" style={{ color: '#3C6B4A' }}>{bdt(r.paid_amount)}</td>
                  <td className="py-2 text-xs iv-mono" style={{ color: '#C0566A' }}>{bdt(due(r))}</td>
                  <td className="py-2">
                    <button className="iv-btn iv-btn--ghost" style={{ padding: '3px 12px', fontSize: 12 }} onClick={goPay}>Collect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Today's collections */}
      <div className="iv-card">
        <h3 className="text-lg mb-6 pb-4 iv-divider">Today's Collections</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#8A7F6E', borderBottom: '1px solid #EAE3D6' }}>
                {['Guest', 'Room', 'Type', 'Amount'].map((h) => (
                  <th key={h} className="text-left py-2 font-normal whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && collected.length === 0 && <tr><td colSpan={4} className="py-3 iv-stat__sub">No collections recorded today yet.</td></tr>}
              {collected.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #F0EBE0' }}>
                  <td className="py-2">{t.guest_name || '—'}</td>
                  <td className="py-2"><span className="iv-badge">{t.room_number || '—'}</span></td>
                  <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{t.type || '—'}</td>
                  <td className="py-2 text-xs iv-mono" style={{ color: '#3C6B4A' }}>{bdt(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
