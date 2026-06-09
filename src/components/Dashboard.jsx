'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import ProgressRing from './ProgressRing';

// Host-routed singleton (sends x-tenant-host) — RLS scopes rows to the tenant,
// same path /churn uses. Mirrors BillingPage's canonical billing math.
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');

const getDhakaDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

export default function Dashboard() {
  const [stats, setStats] = useState({ revenue: 0, occupancy: 0, occupied: 0, totalRooms: 0, checkins: 0, outstanding: 0 });
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDashboard(); }, []);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: reservations }, { data: transactions }, { data: rooms }] = await Promise.all([
        supabase.from('reservations').select('*').order('check_in', { ascending: false }),
        supabase.from('transactions').select('*'),
        supabase.from('rooms').select('id, room_number, status'),
      ]);

      const res = reservations || [];
      const txs = transactions || [];
      const rms = rooms || [];
      const today = getDhakaDate();

      // Group transactions by reservation UUID first, room+date overlap as fallback
      // (mirrors BillingPage — prevents cross-guest misattribution).
      const groups = {};
      res.forEach((r) => { groups[r.id] = { res: r, txs: [] }; });
      txs.forEach((tx) => {
        if (tx.reservation_id && groups[tx.reservation_id]) { groups[tx.reservation_id].txs.push(tx); return; }
        const roomNum = tx.room_number;
        const txDate = (tx.fiscal_day || tx.created_at || '').slice(0, 10);
        if (!roomNum || !txDate) return;
        const match = res.find((r) => {
          const inRoom = Array.isArray(r.room_ids) ? r.room_ids.includes(roomNum) : r.room_number === roomNum;
          const ci = r.check_in ? r.check_in.slice(0, 10) : null;
          const co = r.check_out ? r.check_out.slice(0, 10) : null;
          return inRoom && ci && co && txDate >= ci && txDate <= co;
        });
        if (match && groups[match.id]) groups[match.id].txs.push(tx);
      });

      // Canonical per-folio figures: due = max(0, total - discount - paid)
      let revenue = 0;
      let outstanding = 0;
      const dueRows = [];
      Object.values(groups).forEach((g) => {
        const inv = g.res;
        const total = Number(inv?.total_amount || 0);
        const discount = Number(inv?.discount_amount || inv?.discount || 0);
        const paid = Number(inv?.paid_amount || 0);
        const balanceDue = Math.max(0, total - discount - paid);
        // Today's collections, excluding "Balance Carried Forward" (accounting, not cash)
        const collectedToday = g.txs
          .filter((t) => !/balance carried forward/i.test(t.type ?? '')
            && (t.fiscal_day || t.created_at || '').slice(0, 10) === today)
          .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        revenue += collectedToday;
        outstanding += balanceDue;
        if (balanceDue > 0) {
          const room = Array.isArray(inv?.room_ids) ? inv.room_ids.join(', ') : (inv?.room_number || '—');
          dueRows.push({ name: inv?.guest_name || 'Guest', sub: `Room ${room} · ${bdt(balanceDue)} due`, kind: 'due' });
        }
      });

      const occupied = rms.filter((r) => r.status === 'OCCUPIED').length;
      const occupancy = rms.length ? Math.round((occupied / rms.length) * 100) : 0;

      const checkinRes = res.filter((r) => (r.check_in || '').slice(0, 10) === today);
      const checkinRows = checkinRes.map((r) => {
        const room = Array.isArray(r.room_ids) ? r.room_ids.join(', ') : (r.room_number || '—');
        return { name: r.guest_name || 'Guest', sub: `Room ${room} · Check-in`, kind: 'in' };
      });

      setStats({ revenue, occupancy, occupied, totalRooms: rms.length, checkins: checkinRes.length, outstanding });
      setActivity([...checkinRows, ...dueRows].slice(0, 8));
    } catch (e) {
      console.error('[Dashboard] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Dashboard Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Today Revenue</div>
          <div className="iv-stat__val">{loading ? '—' : bdt(stats.revenue)}</div>
          <div className="iv-stat__sub">Collected today · Asia/Dhaka</div>
        </div>

        <div className="iv-card iv-card--hover flex items-center gap-5">
          <ProgressRing progress={stats.occupancy} size={64} color="#8B6914" />
          <div>
            <div className="iv-stat__lbl">Occupancy</div>
            <div className="iv-stat__val">{loading ? '—' : `${stats.occupancy}%`}</div>
            <div className="iv-stat__sub">{stats.occupied}/{stats.totalRooms} rooms</div>
          </div>
        </div>

        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Check-ins Today</div>
          <div className="iv-stat__val">{loading ? '—' : stats.checkins}</div>
          <div className="iv-stat__sub">Arrivals scheduled</div>
        </div>

        <div className="iv-card iv-card--hover">
          <div className="iv-stat__lbl">Outstanding Dues</div>
          <div className="iv-stat__val iv-due">{loading ? '—' : bdt(stats.outstanding)}</div>
          <div className="iv-stat__sub">Across open folios</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Activity */}
        <div className="iv-card">
          <h3 className="text-lg mb-6 pb-4 iv-divider">Today's Activity</h3>
          <div className="space-y-3">
            {loading && <div className="iv-stat__sub">Loading…</div>}
            {!loading && activity.length === 0 && <div className="iv-stat__sub">No activity yet today.</div>}
            {activity.map((a, i) => (
              <div key={i} className={`iv-row ${a.kind === 'due' ? 'iv-row--due' : 'iv-row--in'}`}>
                <div>
                  <div className="iv-mono text-sm" style={{ color: 'var(--iv-ink)' }}>{a.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: a.kind === 'due' ? '#8A6A1E' : '#5C5347' }}>{a.sub}</div>
                </div>
                <span className={`iv-badge ${a.kind === 'due' ? 'iv-badge--due' : 'iv-badge--in'}`}>
                  {a.kind === 'due' ? 'Due' : 'Check-in'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="iv-card">
          <h3 className="text-lg mb-6 pb-4 iv-divider">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button className="iv-btn" onClick={() => { window.location.href = '/crm.html'; }}>New Check-in</button>
            <button className="iv-btn iv-btn--ghost" onClick={() => { window.location.href = '/crm.html'; }}>Night Audit</button>
            <button className="iv-btn" onClick={() => { window.location.href = '/billing'; }}>New Payment</button>
            <button className="iv-btn iv-btn--ghost" onClick={() => { window.location.href = '/crm.html'; }}>Room Service</button>
          </div>
        </div>
      </div>
    </div>
  );
}
