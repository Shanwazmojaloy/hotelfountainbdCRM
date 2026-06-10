'use client';

// Dashboard — Hotel Fountain Design System layout (StatCards w/ colored walnut top-borders,
// 14-day revenue bar chart, category-occupancy bars, Today's Guests table). Live Supabase data;
// billing math mirrors BillingPage (due = max(0, total - discount - paid); revenue = today's
// collections excl. Balance Carried Forward, Asia/Dhaka anchor).
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { CountUp, Skeleton } from './dskit';
import { getSnap, warmSnap, setSnap } from '@/lib/snap';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const getDhakaDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

const GRN = '#16A34A', GOLD = '#4F46E5', SKY = '#2563EB', ROSE = '#DC2626', AMB = '#D97706', TEAL = '#0D9488', WALNUT = '#0F172A';

const TONE = {
  green: { fg: GRN, bg: 'rgba(21,128,61,.08)', br: 'rgba(21,128,61,.22)' },
  gold: { fg: GOLD, bg: 'rgba(79,70,229,.08)', br: 'rgba(79,70,229,.22)' },
  sky: { fg: SKY, bg: 'rgba(29,78,216,.08)', br: 'rgba(29,78,216,.22)' },
  rose: { fg: ROSE, bg: 'rgba(185,28,28,.08)', br: 'rgba(185,28,28,.22)' },
  amber: { fg: AMB, bg: 'rgba(180,83,9,.08)', br: 'rgba(180,83,9,.22)' },
  teal: { fg: TEAL, bg: 'rgba(15,118,110,.08)', br: 'rgba(15,118,110,.22)' },
};

function statusTone(s) {
  s = (s || '').toUpperCase();
  if (s === 'CHECKED_IN') return 'green';
  if (s === 'RESERVED' || s === 'CONFIRMED') return 'teal';
  if (s === 'PENDING') return 'amber';
  if (s === 'CHECKED_OUT') return 'sky';
  return 'gold';
}
function statusLabel(s) {
  const m = { CHECKED_IN: 'Checked In', RESERVED: 'Reserved', CONFIRMED: 'Confirmed', PENDING: 'Pending', CHECKED_OUT: 'Checked Out' };
  return m[(s || '').toUpperCase()] || s || '—';
}

function Badge({ tone = 'gold', children }) {
  const t = TONE[tone] || TONE.gold;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--iv-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.01em', textTransform: 'none', padding: '3px 10px', borderRadius: 999, color: t.fg, background: t.bg, border: `1px solid ${t.br}`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Avatar({ name, size = 26 }) {
  const init = (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const palette = [GOLD, TEAL, SKY, '#6D28D9', AMB, ROSE];
  const c = palette[(name || '').length % palette.length];
  return (
    <span style={{ width: size, height: size, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c, color: '#fff', fontSize: size * 0.38, fontWeight: 700, fontFamily: 'var(--iv-body)' }}>{init}</span>
  );
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div
      className="iv-card--hover"
      style={{ background: '#fff', border: '1px solid var(--iv-border)', borderRadius: 12, boxShadow: 'var(--iv-card-shadow)', padding: '16px 18px', transition: 'box-shadow .25s var(--iv-ease), transform .25s var(--iv-ease)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '.01em', color: '#64748B', fontWeight: 500 }}>{label}</div>
        <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: accent, background: `${accent}14` }}>{icon}</div>
      </div>
      <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 29, fontWeight: 700, color: 'var(--iv-ink)', lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{(value == null || value === '—' || value === '') ? <Skeleton w={84} h={30} /> : <CountUp value={value} />}</div>
      <div style={{ fontSize: 11, color: 'var(--iv-ink2)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function DSCard({ title, titleAccent, accent = 'var(--iv-side)', action, bodyStyle, children, sectionStyle }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--iv-border)', borderRadius: 12, boxShadow: 'var(--iv-card-shadow)', overflow: 'hidden', ...sectionStyle }}>
      <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--iv-head)', fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)', letterSpacing: '-.01em' }}>
          {title}{titleAccent && <em style={{ fontStyle: 'normal', color: 'var(--iv-gold)', fontWeight: 700 }}> {titleAccent}</em>}
        </h3>
        {action}
      </header>
      <div style={{ padding: '16px 18px', ...bodyStyle }}>{children}</div>
    </section>
  );
}

function Bar({ h, lbl, peak }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ width: '100%', height: `${h}%`, minHeight: 3, borderRadius: '4px 4px 0 0', background: hover ? '#6366F1' : (peak ? GOLD : '#C7D2FE'), transition: 'background .2s, height .3s' }} />
      <span style={{ fontFamily: 'var(--iv-mono)', fontSize: 8, color: 'var(--iv-ink3)' }}>{lbl}</span>
    </div>
  );
}

export default function Dashboard() {
  const _cached = getSnap('dashboard');
  const [stats, setStats] = useState(_cached?.stats || { revenue: 0, occupancy: 0, occupied: 0, totalRooms: 0, checkins: 0, outstanding: 0, dueCount: 0 });
  const [rev14, setRev14] = useState(_cached?.rev14 || []);
  const [total14, setTotal14] = useState(_cached?.total14 || 0);
  const [catOcc, setCatOcc] = useState(_cached?.catOcc || []);
  const [guests, setGuests] = useState(_cached?.guests || []);
  const [peakInfo, setPeakInfo] = useState(_cached?.peakInfo || { date: '', val: 0, adr: 0, occupancy: 0 });
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    if (!getSnap('dashboard')) {
      const warm = warmSnap('dashboard'); // localStorage tier — instant paint after full reload
      if (warm) {
        setStats(warm.stats || {}); setRev14(warm.rev14 || []); setTotal14(warm.total14 || 0);
        setCatOcc(warm.catOcc || []); setGuests(warm.guests || []); setPeakInfo(warm.peakInfo || {});
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    if (!getSnap('dashboard')) setLoading(true); // first visit shows skeletons; revisits refresh silently
    try {
      const supabase = getSupabaseClient();
      const [{ data: reservations }, { data: transactions }, { data: rooms }] = await Promise.all([
        supabase.from('reservations').select('id, guest_name, room_ids, check_in, check_out, status, total_amount, discount_amount, discount, paid_amount').order('check_in', { ascending: false }),
        supabase.from('transactions').select('amount, type, fiscal_day, created_at, reservation_id, room_number'),
        supabase.from('rooms').select('id, room_number, status, category, price'),
      ]);

      const res = reservations || [];
      const txs = transactions || [];
      const rms = rooms || [];
      const today = getDhakaDate();
      const notBCF = (t) => !/balance carried forward/i.test(t.type ?? '');

      // group txs by reservation_id first, room+date overlap fallback
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

      let revenue = 0, outstanding = 0, dueCount = 0;
      Object.values(groups).forEach((g) => {
        const inv = g.res;
        const balanceDue = Math.max(0, Number(inv?.total_amount || 0) - Number(inv?.discount_amount || inv?.discount || 0) - Number(inv?.paid_amount || 0));
        revenue += g.txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === today).reduce((s, t) => s + (Number(t.amount) || 0), 0);
        outstanding += balanceDue;
        if (balanceDue > 0) dueCount++;
      });

      const occupied = rms.filter((r) => r.status === 'OCCUPIED').length;
      const occupancy = rms.length ? Math.round((occupied / rms.length) * 100) : 0;
      const checkinRes = res.filter((r) => (r.check_in || '').slice(0, 10) === today);

      // 14-day revenue series (collected, excl BCF)
      const series = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today); d.setDate(d.getDate() - (13 - i));
        const ds = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        const v = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === ds).reduce((s, t) => s + (Number(t.amount) || 0), 0);
        return { ds, v, lbl: ds.slice(8) };
      });
      const max14 = Math.max(1, ...series.map((d) => d.v));
      const bars = series.map((d, i) => ({ ...d, h: Math.round((d.v / max14) * 100), peak: d.v === max14 && d.v > 0 }));
      const sum14 = series.reduce((a, d) => a + d.v, 0);
      const peak = series.reduce((a, d) => (d.v > a.v ? d : a), series[0] || { v: 0, ds: '' });

      // per-category occupancy
      const catMap = {};
      rms.forEach((r) => { const c = r.category || 'Uncategorized'; (catMap[c] = catMap[c] || { total: 0, occ: 0 }).total++; if (r.status === 'OCCUPIED') catMap[c].occ++; });
      const palette = [GOLD, GRN, SKY, AMB, '#7C3AED', TEAL];
      const cats = Object.entries(catMap).map(([name, v], i) => ({ name, pct: v.total ? Math.round((v.occ / v.total) * 100) : 0, color: palette[i % palette.length] })).sort((a, b) => b.pct - a.pct).slice(0, 6);

      // today's guests (checking in today or currently in-house)
      const roomByNum = {}; rms.forEach((r) => { roomByNum[String(r.room_number)] = r; });
      const todays = res
        .filter((r) => (r.check_in || '').slice(0, 10) === today || (r.status || '').toUpperCase() === 'CHECKED_IN')
        .slice(0, 8)
        .map((r) => {
          const roomArr = Array.isArray(r.room_ids) ? r.room_ids : (r.room_number ? [r.room_number] : []);
          const net = Math.max(0, Number(r.total_amount || 0) - Number(r.discount_amount || r.discount || 0));
          return { name: r.guest_name || 'Guest', room: roomArr.join(', ') || '—', cat: roomByNum[String(roomArr[0])]?.category || '—', ci: (r.check_in || '').slice(0, 10) || '—', co: (r.check_out || '').slice(0, 10) || '—', total: bdt(net), status: r.status || '—' };
        });

      const statsObj = { revenue, occupancy, occupied, totalRooms: rms.length, checkins: checkinRes.length, outstanding, dueCount };
      const peakObj = { date: peak.ds, val: peak.v, adr: rms.length ? Math.round(rms.reduce((a, r) => a + (Number(r.price) || 0), 0) / rms.length) : 0, occupancy };
      setStats(statsObj);
      setRev14(bars); setTotal14(sum14);
      setCatOcc(cats); setGuests(todays);
      setPeakInfo(peakObj);
      setSnap('dashboard', { stats: statsObj, rev14: bars, total14: sum14, catOcc: cats, guests: todays, peakInfo: peakObj });
    } catch (e) {
      console.error('[Dashboard] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const revPAR = Math.round((peakInfo.adr * peakInfo.occupancy) / 100);

  return (
    <div className="iv-dash-root" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 14 }}>
      {/* Stat cards — colored walnut top-borders + icons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, flexShrink: 0 }} className="iv-stat-grid iv-stagger">
        <StatCard icon="🏨" label="Occupied Rooms" accent={GRN} value={loading ? '—' : stats.occupied} sub={loading ? '' : `of ${stats.totalRooms} · ${stats.occupancy}% occupancy`} />
        <StatCard icon="৳" label="Today's Revenue" accent={GOLD} value={loading ? '—' : bdt(stats.revenue)} sub="Collected today · Asia/Dhaka" />
        <StatCard icon="✈" label="Arrivals Today" accent={SKY} value={loading ? '—' : stats.checkins} sub="Scheduled check-ins" />
        <StatCard icon="⚠" label="Balance Due" accent={ROSE} value={loading ? '—' : bdt(stats.outstanding)} sub={loading ? '' : `${stats.dueCount} reservation${stats.dueCount === 1 ? '' : 's'}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, flexShrink: 0, alignItems: 'start' }} className="iv-chart-grid">
        {/* 14-day revenue */}
        <DSCard title="Revenue —" titleAccent="Last 14 Days" accent={GOLD} action={<Badge tone="gold">{bdt(total14)} total</Badge>}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, padding: '4px 0' }}>
            {rev14.map((b, i) => <Bar key={i} h={b.h} lbl={b.lbl} peak={b.peak} />)}
            {!rev14.length && <div style={{ color: 'var(--iv-ink3)', fontSize: 12 }}>Loading…</div>}
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--iv-border2)', margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--iv-ink3)' }}>
            <span>Peak: {peakInfo.date ? `${peakInfo.date} · ${bdt(peakInfo.val)}` : '—'}</span>
            <span style={{ color: 'var(--iv-gold)' }}>ADR {bdt(peakInfo.adr)} · RevPAR {bdt(revPAR)}</span>
          </div>
        </DSCard>

        {/* category occupancy */}
        <DSCard title="Category" titleAccent="Occupancy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!loading && catOcc.length === 0 && <div style={{ color: 'var(--iv-ink3)', fontSize: 12 }}>No room categories.</div>}
            {catOcc.map((o) => (
              <div key={o.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: 'var(--iv-ink)' }}>{o.name}</span>
                  <span style={{ fontFamily: 'var(--iv-mono)', color: o.color, fontSize: 10 }}>{o.pct}%</span>
                </div>
                <div style={{ height: 7, background: 'var(--iv-border2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${o.pct}%`, background: o.color, borderRadius: 99, transition: 'width .4s var(--iv-ease)' }} />
                </div>
              </div>
            ))}
          </div>
        </DSCard>
      </div>

      {/* Today's guests */}
      <DSCard title="Today's" titleAccent="Guests"
        bodyStyle={{ padding: 0, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        sectionStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        action={<a href="/crm/reservations" className="iv-btn iv-btn--ghost" style={{ fontSize: 12, padding: '4px 11px', textDecoration: 'none' }}>View All</a>}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Guest', 'Room', 'Category', 'Check-In', 'Check-Out', 'Total', 'Status'].map((h) => (
                  <th key={h} style={{ fontFamily: 'var(--iv-body)', fontSize: 12, letterSpacing: '.01em', color: '#64748B', textTransform: 'none', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--iv-border)', background: 'var(--iv-sunken)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guests.map((g, i) => (
                <tr key={i} style={{ borderBottom: i < guests.length - 1 ? '1px solid var(--iv-border2)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--iv-ink)', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={g.name} />{g.name}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}><Badge tone="sky">{g.room}</Badge></td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--iv-ink3)' }}>{g.cat}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--iv-mono)', fontSize: 11, color: 'var(--iv-ink3)' }}>{g.ci}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--iv-mono)', fontSize: 11, color: 'var(--iv-ink3)' }}>{g.co}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--iv-mono)', fontSize: 12, color: 'var(--iv-gold)' }}>{g.total}</td>
                  <td style={{ padding: '10px 14px' }}><Badge tone={statusTone(g.status)}>{statusLabel(g.status)}</Badge></td>
                </tr>
              ))}
              {!loading && guests.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '16px 14px', color: 'var(--iv-ink3)', fontSize: 12 }}>No guests checking in or in-house today.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DSCard>

      <style>{`@media (min-width:901px){.iv-dash-root{height:calc(100dvh - 102px)}}@media (max-width:900px){.iv-stat-grid{grid-template-columns:repeat(2,1fr)!important}.iv-chart-grid{grid-template-columns:1fr!important}.iv-dash-root{height:auto;overflow-y:auto}}`}</style>
    </div>
  );
}
