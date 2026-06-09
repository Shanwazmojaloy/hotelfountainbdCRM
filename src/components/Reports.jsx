'use client';

// Reports — ported from the legacy crm-src.jsx ReportsPage (read-only analytics).
// Same metrics (Total Revenue, Occupancy, ADR, RevPAR, 14-day revenue, revenue-by-category,
// room-category performance) rendered in the Warm Ivory design system. No writes.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const getDhakaDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

export default function Reports() {
  const [data, setData] = useState({ txs: [], rooms: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: txs }, { data: rooms }] = await Promise.all([
        supabase.from('transactions').select('amount, type, fiscal_day'),
        supabase.from('rooms').select('id, status, category, price'),
      ]);
      setData({ txs: txs || [], rooms: rooms || [] });
    } catch (e) {
      console.error('[Reports] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const { txs, rooms } = data;

  // --- metrics (mirror legacy ReportsPage) ---
  const totalRev = txs.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const occ = rooms.filter((r) => r.status === 'OCCUPIED').length;
  const occPct = rooms.length ? Math.round((occ / rooms.length) * 100) : 0;
  const avgRate = rooms.length ? Math.round(rooms.reduce((a, r) => a + (Number(r.price) || 0), 0) / rooms.length) : 0;
  const revPAR = Math.round((avgRate * occPct) / 100);

  // last 14 days (Dhaka), revenue per fiscal_day
  const today = getDhakaDate();
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    const ds = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return { ds, v: txs.filter((t) => t.fiscal_day === ds).reduce((a, t) => a + (Number(t.amount) || 0), 0) };
  });
  const max14 = Math.max(1, ...last14.map((d) => d.v));
  const total14 = last14.reduce((a, d) => a + d.v, 0);

  // revenue by category (transaction type)
  const catMap = txs.reduce((a, t) => { if (t.type) a[t.type] = (a[t.type] || 0) + (Number(t.amount) || 0); return a; }, {});
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topCatMax = topCats[0]?.[1] || 1;

  // room category performance
  const cats = [...new Set(rooms.map((r) => r.category).filter(Boolean))];

  return (
    <div>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Reports & Analytics</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Total Revenue</div>
          <div className="iv-stat__val">{loading ? '—' : bdt(totalRev)}</div>
          <div className="iv-stat__sub">All recorded transactions</div>
        </div>
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Occupancy</div>
          <div className="iv-stat__val">{loading ? '—' : `${occPct}%`}</div>
          <div className="iv-stat__sub">{occ}/{rooms.length} rooms</div>
        </div>
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">ADR</div>
          <div className="iv-stat__val">{loading ? '—' : bdt(avgRate)}</div>
          <div className="iv-stat__sub">Avg Daily Rate</div>
        </div>
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">RevPAR</div>
          <div className="iv-stat__val">{loading ? '—' : bdt(revPAR)}</div>
          <div className="iv-stat__sub">Revenue / Available Room</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 14-day revenue */}
        <div className="iv-card">
          <h3 className="text-lg mb-6 pb-4 iv-divider">Daily Revenue — Last 14 Days</h3>
          <div className="flex items-end gap-1.5" style={{ height: 140 }}>
            {last14.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${d.ds} · ${bdt(d.v)}`}>
                <div style={{ width: '100%', height: `${Math.round((d.v / max14) * 110)}px`, minHeight: 2,
                  background: 'rgba(139,105,20,0.45)', borderRadius: '3px 3px 0 0' }} />
                <div className="text-xs mt-1" style={{ color: '#8A7F6E' }}>{d.ds.slice(8)}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs mt-4 pt-4 iv-divider" style={{ color: '#5C5347' }}>
            <span>14-day total</span><span className="iv-mono" style={{ color: '#8B6914' }}>{bdt(total14)}</span>
          </div>
        </div>

        {/* revenue by category */}
        <div className="iv-card">
          <h3 className="text-lg mb-6 pb-4 iv-divider">Revenue by Category</h3>
          <div className="space-y-2">
            {!loading && topCats.length === 0 && <div className="iv-stat__sub">No transactions yet.</div>}
            {topCats.map(([cat, rev]) => (
              <div key={cat} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #EAE3D6' }}>
                <span className="text-sm" style={{ color: 'var(--iv-ink)' }}>{cat}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs iv-mono" style={{ color: '#8B6914' }}>{bdt(rev)}</span>
                  <div style={{ height: 5, width: Math.round((rev / topCatMax) * 70), background: 'rgba(139,105,20,0.4)', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* room category performance */}
      <div className="iv-card">
        <h3 className="text-lg mb-6 pb-4 iv-divider">Room Category Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#8A7F6E', borderBottom: '1px solid #EAE3D6' }}>
                <th className="text-left py-2 font-normal">Category</th>
                <th className="text-left py-2 font-normal">Rooms</th>
                <th className="text-left py-2 font-normal">Rate/Night</th>
                <th className="text-left py-2 font-normal">Occupied</th>
                <th className="text-left py-2 font-normal">Occupancy %</th>
                <th className="text-left py-2 font-normal">RevPAR</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((cat) => {
                const cr = rooms.filter((r) => r.category === cat);
                const rate = Number(cr[0]?.price || 0);
                const occN = cr.filter((r) => r.status === 'OCCUPIED').length;
                const pct = cr.length ? Math.round((occN / cr.length) * 100) : 0;
                return (
                  <tr key={cat} style={{ borderBottom: '1px solid #F0EBE0' }}>
                    <td className="py-2"><span className="iv-badge">{cat}</span></td>
                    <td className="py-2">{cr.length}</td>
                    <td className="py-2 iv-mono" style={{ color: '#8B6914' }}>{bdt(rate)}</td>
                    <td className="py-2">{occN}</td>
                    <td className="py-2">{pct}%</td>
                    <td className="py-2 iv-mono" style={{ color: '#8B6914' }}>{bdt(Math.round((rate * pct) / 100))}</td>
                  </tr>
                );
              })}
              {!loading && cats.length === 0 && (
                <tr><td colSpan={6} className="py-3 iv-stat__sub">No room categories found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
