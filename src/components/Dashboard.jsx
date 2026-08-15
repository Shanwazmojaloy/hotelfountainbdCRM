'use client';

// Dashboard — Hotel Fountain Design System layout (StatCards w/ colored walnut top-borders,
// 14-day revenue bar chart, category-occupancy bars, Today's Guests table). Live Supabase data;
// billing math mirrors BillingPage (due = max(0, total - discount - paid); revenue = today's
// collections excl. Balance Carried Forward, Asia/Dhaka anchor).
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { CountUp, Skeleton } from './dskit';
import { getSnap, warmSnap, setSnap } from '@/lib/snap';
import { useAuth } from './AuthGate';
import { can } from '@/lib/permissions';
import { openBusinessDay } from '@/lib/businessDay';
import { outstandingTotal, outstandingList } from '@/lib/dues';
import RecordPaymentModal from './RecordPaymentModal';
import CheckActionModal from './CheckActionModal';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const getDhakaDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

// Aurora/Orbix palette (2026-07-04) — lime accent + saturated series colors on dark glass.
const LIME = '#DFFF45', LIME_INK = '#171A05';
const GRN = '#7BE04A', GOLD = '#DFFF45', SKY = '#6AA5FF', ROSE = '#FF6B6B', AMB = '#F5A93B', TEAL = '#3ED3C1', PUR = '#C08BFF';

const TONE = {
  green: { fg: '#C9F73A', bg: 'rgba(201,247,58,.10)', br: 'rgba(201,247,58,.28)' },
  gold: { fg: LIME, bg: 'rgba(223,255,69,.10)', br: 'rgba(223,255,69,.28)' },
  sky: { fg: SKY, bg: 'rgba(106,165,255,.11)', br: 'rgba(106,165,255,.3)' },
  rose: { fg: ROSE, bg: 'rgba(255,107,107,.11)', br: 'rgba(255,107,107,.3)' },
  amber: { fg: AMB, bg: 'rgba(245,169,59,.11)', br: 'rgba(245,169,59,.3)' },
  teal: { fg: TEAL, bg: 'rgba(62,211,193,.11)', br: 'rgba(62,211,193,.3)' },
  purple: { fg: PUR, bg: 'rgba(192,139,255,.11)', br: 'rgba(192,139,255,.3)' },
};

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
  const palette = ['#7C4BC9', TEAL, SKY, '#D46B8E', AMB, ROSE]; // no lime here — white initials need dark fills
  const c = palette[(name || '').length % palette.length];
  return (
    <span style={{ width: size, height: size, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c, color: '#fff', fontSize: size * 0.38, fontWeight: 700, fontFamily: 'var(--iv-body)' }}>{init}</span>
  );
}

// 7-day mini trend under a stat value. Values normalize to the sparkline's own min/max;
// flat series draw a midline instead of dividing by zero.
function Spark({ values = [], color = GOLD }) {
  if (!values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1 || 1)) * 120},${22 - ((v - min) / range) * 18}`).join(' ');
  const last = pts.split(' ').pop().split(',');
  return (
    <svg width="100%" height="26" viewBox="0 0 120 26" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', marginTop: 10 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

function Delta({ dir, children }) {
  const up = dir === 'up';
  const c = up ? { fg: '#C9F73A', bg: 'rgba(201,247,58,.1)', br: 'rgba(201,247,58,.28)' } : { fg: ROSE, bg: 'rgba(255,107,107,.1)', br: 'rgba(255,107,107,.28)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--iv-mono)', fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: '2px 8px', marginLeft: 8, verticalAlign: 3, color: c.fg, background: c.bg, border: `1px solid ${c.br}` }}>
      {up ? '▲' : '▼'} {children}
    </span>
  );
}

function StatCard({ icon, label, value, sub, accent, delta, spark, sparkColor, href }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag
      className="iv-card--hover"
      href={href}
      style={{ background: 'var(--iv-card)', border: '1px solid var(--iv-border)', borderRadius: 18, boxShadow: 'var(--iv-card-shadow)', padding: '16px 18px', transition: 'box-shadow .25s var(--iv-ease), transform .25s var(--iv-ease), border-color .25s var(--iv-ease)', display: 'block', textDecoration: 'none', color: 'inherit', cursor: href ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '.01em', color: 'var(--iv-ink2)', fontWeight: 500 }}>{label}</div>
        <div style={{ width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: accent, background: `${accent}1f`, border: `1px solid ${accent}33` }}>{icon}</div>
      </div>
      <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 29, fontWeight: 700, color: 'var(--iv-ink)', lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
        {(value == null || value === '—' || value === '') ? <Skeleton w={84} h={30} /> : <CountUp value={value} />}
        {delta}
      </div>
      <div style={{ fontSize: 11, color: href ? 'var(--iv-gold)' : 'var(--iv-ink2)', marginTop: 6, fontWeight: href ? 600 : 400 }}>{sub}</div>
      {spark && spark.length > 1 ? <Spark values={spark} color={sparkColor || accent} /> : null}
    </Tag>
  );
}

function DSCard({ title, titleAccent, accent = 'var(--iv-side)', action, bodyStyle, children, sectionStyle }) {
  return (
    <section style={{ background: 'var(--iv-card)', border: '1px solid var(--iv-border)', borderRadius: 18, boxShadow: 'var(--iv-card-shadow)', overflow: 'hidden', ...sectionStyle }}>
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

// Bar on the LIME card — dark bars on neon, dark hover tooltip (Orbix signature chart).
function Bar({ h, lbl, peak, tip }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', position: 'relative', height: '100%', justifyContent: 'flex-end' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {hover && tip && (
        <span style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: '#17151C', color: '#F2F1F5', fontSize: 10, fontWeight: 600, borderRadius: 8, padding: '5px 9px', whiteSpace: 'nowrap', zIndex: 6, boxShadow: '0 10px 26px rgba(0,0,0,.45)', pointerEvents: 'none' }}>{tip}</span>
      )}
      <div style={{ width: '68%', height: `${h}%`, minHeight: 4, borderRadius: 6, background: hover ? '#171A05' : (peak ? '#171A05' : 'rgba(23,26,5,.6)'), transition: 'background .2s, height .3s', transformOrigin: 'bottom', animation: 'fxBarGrow .7s cubic-bezier(.22,1,.36,1) backwards' }} />
      <span style={{ fontFamily: 'var(--iv-mono)', fontSize: 8, color: 'rgba(23,26,5,.55)', fontWeight: 600 }}>{lbl}</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  // Housekeeping = operational metrics only, NO guest personal details / money (RBAC 2026-06-10).
  const showGuestDetails = can(user?.role, 'viewGuestDetails');
  // Aggregate revenue metrics are a SEPARATE gate (RBAC 2026-07-21 matrix): owner/admin +
  // manager + front-desk-supervisor only. Receptionist may see guest PII + take payments but
  // NOT the revenue dashboard; housekeeping/restaurant roles see neither.
  const showRevenue = can(user?.role, 'viewRevenue');
  // Day-scoped key: "Today's Revenue/Guests" are date-derived — an unscoped key painted
  // yesterday's money after midnight (audit LOW-17).
  const SNAP_KEY = 'dashboard.' + new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  const _cached = getSnap(SNAP_KEY);
  const [stats, setStats] = useState(_cached?.stats || { revenue: 0, occupancy: 0, occupied: 0, totalRooms: 0, checkins: 0, outstanding: 0, dueCount: 0 });
  const [rev14, setRev14] = useState(_cached?.rev14 || []);
  const [total14, setTotal14] = useState(_cached?.total14 || 0);
  const [desk, setDesk] = useState(_cached?.desk || { arrivals: [], departures: [], inhouse: [] });
  const [roomsList, setRoomsList] = useState(_cached?.roomsList || []);
  const [peakInfo, setPeakInfo] = useState(_cached?.peakInfo || { date: '', val: 0, adr: 0, occupancy: 0 });
  const [loading, setLoading] = useState(!_cached);
  const [deskTab, setDeskTab] = useState('arrivals');
  const [modal, setModal] = useState(null); // {kind:'pay'|'checkin'|'checkout', res}

  useEffect(() => {
    if (!getSnap(SNAP_KEY)) {
      const warm = warmSnap(SNAP_KEY); // localStorage tier — instant paint after full reload
      if (warm) {
        setStats(warm.stats || {}); setRev14(warm.rev14 || []); setTotal14(warm.total14 || 0);
        setDesk(warm.desk || { arrivals: [], departures: [], inhouse: [] });
        setRoomsList(warm.roomsList || []); setPeakInfo(warm.peakInfo || {});
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  // LIVE REFRESH (2026-07-31, owner-flagged): the front desk keeps ONE dashboard tab open
  // all day, but data only loaded on mount — by afternoon the tab showed the morning's
  // world (৳0 "today's revenue" while ৳11,000 sat in the DB; 0 arrivals vs 3 checked-in).
  // Three refresh triggers, all silent (no skeleton — fetchDashboard only shows loading
  // when there's no snapshot):
  //   1. Tab becomes visible again (staff task-switch back) → immediate refetch.
  //   2. Another tab wrote data (lumea:data-changed from snap.invalidateData) → refetch.
  //   3. Gentle 120s poll while the tab is VISIBLE (skipped while hidden — no wasted
  //      function invocations from a minimized tab; visibility trigger covers the return).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchDashboard(); };
    const onDataChanged = () => fetchDashboard();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') fetchDashboard(); }, 120_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('lumea:data-changed', onDataChanged);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('lumea:data-changed', onDataChanged);
    };
  }, []);

  async function fetchDashboard() {
    if (!getSnap(SNAP_KEY)) setLoading(true); // first visit shows skeletons; revisits refresh silently
    try {
      const supabase = getSupabaseClient();
      // C3: reservations + transactions via the session-gated route; rooms + night_audit_log
      // stay on the anon client (not sensitive, anon SELECT retained).
      const [resR, txR, { data: rooms, error: e3 }, { data: closes }] = await Promise.all([
        fetch('/api/crm/data?resource=reservations&order=check_in.desc'),
        // cols= trim (2026-07-30): dashboard only groups/sums txs (type/amount/dates/ids) —
        // same proven column list as Reports. Reservations stay FULL: desk rows feed the
        // check-in/checkout/payment modals which need the whole reservation (see comment below).
        fetch('/api/crm/data?resource=transactions&cols=id,type,amount,reservation_id,fiscal_day,created_at,guest_name,room_number'),
        supabase.from('rooms').select('id, room_number, status, category, price'),
        supabase.from('night_audit_log').select('audit_date, status'),
      ]);
      const resj = await resR.json().catch(() => ({}));
      const txj = await txR.json().catch(() => ({}));
      if (!resR.ok || !txR.ok || e3) console.error('[Dashboard] query error:', resj.error || txj.error || e3); // money page must never fail silently

      const res = resj.rows || [];
      const txs = txj.rows || [];
      const rms = rooms || [];
      const calToday = getDhakaDate();          // arrivals/guests = operational calendar day
      const today = openBusinessDay(closes);    // revenue/collections = open business day
      // POSITIVE match (house rule): exclusion-only filters let charges (Stay Extension,
      // Room Service) count as revenue. A tx is revenue only if it IS a payment.
      const REAL_PAY = /payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card/i;
      const isPay = (t) => REAL_PAY.test(t.type ?? '') && !/^\[VOID-DUP\]/.test(t.type ?? '') && !/balance carried forward/i.test(t.type ?? '');

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

      let revenue = 0;
      Object.values(groups).forEach((g) => {
        revenue += g.txs.filter((t) => isPay(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === today).reduce((s, t) => s + (Number(t.amount) || 0), 0);
      });
      // Outstanding = RECEIVABLES only (CHECKED_IN/CHECKED_OUT) - shared canonical helper (owner decision 2026-06-12)
      const outstanding = outstandingTotal(res);
      const dueCount = outstandingList(res).length;

      const occupied = rms.filter((r) => r.status === 'OCCUPIED').length;
      const occupancy = rms.length ? Math.round((occupied / rms.length) * 100) : 0;
      // Arrivals Today = the OPEN BUSINESS DAY (last close → next close), matching Today's Revenue.
      // The Front-Desk "Arrivals" list below stays on the calendar day (owner decision 2026-07-21).
      const checkinRes = res.filter((r) => (r.check_in || '').slice(0, 10) === today);

      // 14-day revenue series (collected, excl BCF) — anchored on the calendar so the chart axis is real
      const series = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(calToday); d.setDate(d.getDate() - (13 - i));
        const ds = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        const v = txs.filter((t) => isPay(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === ds).reduce((s, t) => s + (Number(t.amount) || 0), 0);
        return { ds, v, lbl: ds.slice(8) };
      });
      const max14 = Math.max(1, ...series.map((d) => d.v));
      const bars = series.map((d, i) => ({ ...d, h: Math.round((d.v / max14) * 100), peak: d.v === max14 && d.v > 0 }));
      const sum14 = series.reduce((a, d) => a + d.v, 0);
      const peak = series.reduce((a, d) => (d.v > a.v ? d : a), series[0] || { v: 0, ds: '' });

      // ——— KPI trends (Concept A) ———
      // last-7 slices of the same series; deltas vs yesterday. Stays-per-day is derived from
      // reservation date ranges (a room-night existed on d if ci<=d<co and the stay is real).
      const last7 = series.slice(7);
      const revToday = series[13]?.v || 0, revYest = series[12]?.v || 0;
      const revDelta = revYest > 0 ? Math.round(((revToday - revYest) / revYest) * 100) : null;
      const isStay = (r) => ['CHECKED_IN', 'CHECKED_OUT'].includes((r.status || '').toUpperCase());
      const staysOn = (d) => res.filter((r) => isStay(r) && (r.check_in || '').slice(0, 10) <= d && d < (r.check_out || '').slice(0, 10)).length;
      const sparkOcc = last7.map((s) => staysOn(s.ds));
      const occDelta = occupied - staysOn(series[12]?.ds || calToday);
      const arrOn = (d) => res.filter((r) => (r.check_in || '').slice(0, 10) === d && (r.status || '').toUpperCase() !== 'CANCELLED').length;
      const sparkArr = last7.map((s) => arrOn(s.ds));
      const arrived = checkinRes.filter((r) => (r.status || '').toUpperCase() === 'CHECKED_IN').length;

      // ——— front-desk lists (Concept C) — raw rows, modals need the full reservation ———
      const dueOf = (r) => Math.max(0, Number(r.total_amount || 0) - Number(r.discount_amount || r.discount || 0) - Number(r.paid_amount || 0));
      const st = (r) => (r.status || '').toUpperCase();
      const arrivalsList = res
        .filter((r) => (r.check_in || '').slice(0, 10) === calToday && !['CANCELLED', 'CHECKED_OUT'].includes(st(r)))
        .sort((a, b) => (st(a) === 'CHECKED_IN') - (st(b) === 'CHECKED_IN'));
      const departuresList = res
        .filter((r) => (r.check_out || '').slice(0, 10) === calToday && ['CHECKED_IN', 'CHECKED_OUT'].includes(st(r)))
        .sort((a, b) => dueOf(b) - dueOf(a));
      const inhouseList = res.filter((r) => st(r) === 'CHECKED_IN').slice(0, 20);
      const deskObj = { arrivals: arrivalsList, departures: departuresList, inhouse: inhouseList };
      const rmList = rms.map((r) => ({ room_number: r.room_number, status: r.status })); // heatmap (Concept D)

      const statsObj = { revenue, occupancy, occupied, totalRooms: rms.length, checkins: checkinRes.length, outstanding, dueCount, revDelta, occDelta, arrived, sparkRev: last7.map((s) => s.v), sparkOcc, sparkArr };
      const peakObj = { date: peak.ds, val: peak.v, adr: rms.length ? Math.round(rms.reduce((a, r) => a + (Number(r.price) || 0), 0) / rms.length) : 0, occupancy };
      setStats(statsObj);
      setRev14(bars); setTotal14(sum14);
      setDesk(deskObj); setRoomsList(rmList);
      setPeakInfo(peakObj);
      setSnap(SNAP_KEY, { stats: statsObj, rev14: bars, total14: sum14, desk: deskObj, roomsList: rmList, peakInfo: peakObj });
    } catch (e) {
      console.error('[Dashboard] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const revPAR = Math.round((peakInfo.adr * peakInfo.occupancy) / 100);

  return (
    <div className="iv-dash-root" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 20 }}>
      {/* Row 1 — Orbix stat strip: wide Rooms card (3 sub-metrics) + stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: showRevenue ? '1.7fr 1fr 1fr 1fr' : '1.7fr 1fr 1fr', gap: 14, flexShrink: 0 }} className="iv-stat-grid iv-stagger">
        {(() => {
          const availCnt = roomsList.filter((r) => (r.status || '').toUpperCase() === 'AVAILABLE').length;
          const dirtyCnt = roomsList.filter((r) => (r.status || '').toUpperCase() === 'DIRTY').length;
          const SUB = [
            { l: 'Occupied', v: loading ? '—' : stats.occupied, d: stats.occDelta, c: GRN },
            { l: 'Available', v: loading ? '—' : availCnt, c: TEAL },
            { l: 'Dirty', v: loading ? '—' : dirtyCnt, c: AMB },
          ];
          return (
            <a href="/crm/rooms" className="iv-card--hover" style={{ background: 'var(--iv-card)', border: '1px solid var(--iv-border)', borderRadius: 18, boxShadow: 'var(--iv-card-shadow)', padding: '16px 18px', textDecoration: 'none', color: 'inherit', display: 'block', transition: 'transform .25s var(--iv-ease), border-color .25s var(--iv-ease)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--iv-ink)' }}>Rooms</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['🏨', '🧹', '🔑'].map((ic, i) => (
                    <span key={i} style={{ width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: 'rgba(255,255,255,.06)', border: '1px solid var(--iv-border2)' }}>{ic}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', marginTop: 12 }}>
                {SUB.map((s, i) => (
                  <div key={s.l} style={{ flex: 1, paddingLeft: i ? 16 : 0, marginLeft: i ? 16 : 0, borderLeft: i ? '1px solid var(--iv-border2)' : 'none' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--iv-ink3)', fontWeight: 600 }}>{s.l}</div>
                    <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 23, fontWeight: 700, color: 'var(--iv-ink)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                      {s.v}
                      {!loading && s.d ? <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 5, color: s.d > 0 ? '#C9F73A' : ROSE }}>{s.d > 0 ? `+${s.d}` : s.d}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--iv-ink3)', marginTop: 9 }}>{loading ? '' : `${stats.occupancy}% occupancy · ${stats.totalRooms} rooms`}</div>
            </a>
          );
        })()}
        {showRevenue && <StatCard icon="৳" label="Today's Revenue" accent={GOLD} value={loading ? '—' : bdt(stats.revenue)} sub="Collected today · Asia/Dhaka" href="/crm/reports"
          delta={!loading && stats.revDelta != null && stats.revDelta !== 0 ? <Delta dir={stats.revDelta > 0 ? 'up' : 'down'}>{Math.abs(stats.revDelta)}% vs yd</Delta> : null}
          spark={stats.sparkRev} />}
        <StatCard icon="✈" label="Arrivals Today" accent={SKY} value={loading ? '—' : stats.checkins} href="/crm/reservations"
          sub={loading ? '' : (stats.checkins > 0 ? `${stats.arrived || 0} arrived · ${Math.max(0, stats.checkins - (stats.arrived || 0))} expected` : 'Scheduled check-ins')}
          spark={stats.sparkArr} />
        {showRevenue
          ? <StatCard icon="⚠" label="Balance Due" accent={ROSE} value={loading ? '—' : bdt(stats.outstanding)} href="/crm/reports"
              sub={loading ? '' : `${stats.dueCount} reservation${stats.dueCount === 1 ? '' : 's'} → open dues`} />
          : <StatCard icon="🧹" label="Rooms to Clean" accent={AMB} value={loading ? '—' : (stats.totalRooms - stats.occupied)} sub="vacant / awaiting service" />}
      </div>

      {/* Revenue growth — full width since the Rooms live-status panel was retired (owner
          decision 2026-08-15); Today's Front Desk now sits directly beneath it. */}
      {showRevenue && <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, flexShrink: 0, alignItems: 'start' }} className="iv-chart-grid">
        {/* 14-day revenue — THE lime card (Orbix signature: neon panel, dark bars & text). Revenue-gated. */}
        <section style={{ background: LIME, border: '1px solid rgba(23,26,5,.1)', borderRadius: 20, padding: '18px 20px', boxShadow: '0 16px 44px rgba(223,255,69,.14), 0 2px 8px rgba(0,0,0,.3)', overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: LIME_INK, letterSpacing: '-.02em' }}>Revenue growth</h3>
            {!loading && stats.revDelta != null && stats.revDelta !== 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: LIME_INK, background: 'rgba(23,26,5,.1)', border: '1px solid rgba(23,26,5,.14)', borderRadius: 999, padding: '3px 10px' }}>
                {stats.revDelta > 0 ? '▲' : '▼'} {Math.abs(stats.revDelta)}% vs yesterday
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: LIME, background: '#17151C', borderRadius: 999, padding: '6px 13px' }}>14 days ▾</span>
          </div>
          <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 26, fontWeight: 800, color: LIME_INK, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{bdt(total14)}<span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,26,5,.55)', marginLeft: 8 }}>collected · last 14 days</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 128, marginTop: 12 }}>
            {rev14.map((b, i) => <Bar key={i} h={b.h} lbl={b.lbl} peak={b.peak} tip={`${b.ds} · ${bdt(b.v)}`} />)}
            {!rev14.length && <div style={{ color: 'rgba(23,26,5,.5)', fontSize: 12 }}>Loading…</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(23,26,5,.6)', fontWeight: 600, marginTop: 10, borderTop: '1px solid rgba(23,26,5,.12)', paddingTop: 9 }}>
            <span>Peak {peakInfo.date ? `${peakInfo.date} · ${bdt(peakInfo.val)}` : '—'}</span>
            <span>ADR {bdt(peakInfo.adr)} · RevPAR {bdt(revPAR)}</span>
          </div>
        </section>
      </div>}

      {/* Front-desk panel (Concept C) — hidden from housekeeping (guest personal details + money) */}
      {showGuestDetails && (() => {
        const dueOfR = (r) => Math.max(0, Number(r.total_amount || 0) - Number(r.discount_amount || r.discount || 0) - Number(r.paid_amount || 0));
        const roomsOf = (r) => (Array.isArray(r.room_ids) ? r.room_ids : (r.room_number ? [r.room_number] : [])).join(', ') || '—';
        const nightsOf = (r) => { const ci = new Date((r.check_in || '').slice(0, 10)), co = new Date((r.check_out || '').slice(0, 10)); const n = Math.round((co - ci) / 86400000); return isNaN(n) || n < 1 ? 1 : n; };
        const stU = (r) => (r.status || '').toUpperCase();
        const rows = desk[deskTab] || [];
        const btn = { fontSize: 11, padding: '4px 11px' };
        const TABS = [['arrivals', 'Arrivals'], ['departures', 'Departures'], ['inhouse', 'In-House']];
        const EMPTY = { arrivals: 'No arrivals scheduled today.', departures: 'No departures today.', inhouse: 'No guests currently in-house.' };
        return (
          <DSCard title="Today's" titleAccent="Front Desk"
            bodyStyle={{ padding: '4px 18px', flex: 1, minHeight: 0, overflowY: 'auto' }}
            sectionStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', gap: 2, background: 'var(--iv-sunken)', border: '1px solid var(--iv-border)', borderRadius: 9, padding: 3 }}>
                  {TABS.map(([k, t]) => (
                    <button key={k} onClick={() => setDeskTab(k)} style={{ fontFamily: 'var(--iv-body)', fontSize: 11.5, fontWeight: 700, padding: '5px 13px', borderRadius: 999, cursor: 'pointer', color: deskTab === k ? LIME_INK : 'var(--iv-ink3)', background: deskTab === k ? LIME : 'transparent', border: '1px solid transparent', transition: 'all .25s var(--iv-ease)' }}>
                      {t} <span style={{ fontFamily: 'var(--iv-mono)', fontSize: 10, color: deskTab === k ? LIME_INK : 'var(--iv-ink3)', opacity: deskTab === k ? .7 : 1 }}>{(desk[k] || []).length}</span>
                    </button>
                  ))}
                </div>
                <a href="/crm/reservations" className="iv-btn iv-btn--ghost" style={{ fontSize: 12, padding: '4px 11px', textDecoration: 'none' }}>View All</a>
              </div>
            }>
            {rows.map((r, i) => {
              const due = dueOfR(r);
              return (
                <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--iv-border2)' : 'none', flexWrap: 'wrap' }}>
                  <Avatar name={r.guest_name || 'Guest'} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--iv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.guest_name || 'Guest'}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--iv-ink3)', fontFamily: 'var(--iv-mono)' }}>
                      <span style={{ color: 'var(--iv-gold)' }}>ID: {String(r.id || '').slice(0, 8) || '—'}</span>
                      {' · '}{(r.check_in || '').slice(0, 10)} → {(r.check_out || '').slice(0, 10)} · {nightsOf(r)}n
                    </div>
                  </div>
                  <Badge tone="purple">{roomsOf(r)}</Badge>
                  <span style={{ fontFamily: 'var(--iv-mono)', fontSize: 12, width: 96, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: due > 0 ? ROSE : '#C9F73A', fontWeight: due > 0 ? 700 : 500 }}>
                    {due > 0 ? `${bdt(due)} due` : 'Settled ✓'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {deskTab === 'arrivals' && (stU(r) === 'CHECKED_IN'
                      ? <Badge tone="green">Arrived</Badge>
                      : <button className="iv-btn" style={btn} onClick={() => setModal({ kind: 'checkin', res: r })}>Check In</button>)}
                    {deskTab === 'departures' && (stU(r) === 'CHECKED_OUT'
                      ? <Badge tone="sky">Checked Out</Badge>
                      : <>
                          {due > 0 && <button className="iv-btn" style={btn} onClick={() => setModal({ kind: 'pay', res: r })}>Record Payment</button>}
                          <button className="iv-btn iv-btn--ghost" style={btn} onClick={() => setModal({ kind: 'checkout', res: r })}>Check Out</button>
                        </>)}
                    {deskTab === 'inhouse' && <>
                      {due > 0 && <button className="iv-btn" style={btn} onClick={() => setModal({ kind: 'pay', res: r })}>Record Payment</button>}
                    </>}
                  </div>
                </div>
              );
            })}
            {!loading && rows.length === 0 && (
              <div style={{ padding: '16px 0', color: 'var(--iv-ink3)', fontSize: 12 }}>{EMPTY[deskTab]}</div>
            )}
          </DSCard>
        );
      })()}

      {modal?.kind === 'pay' && <RecordPaymentModal reservation={modal.res} onClose={() => setModal(null)} onSaved={fetchDashboard} />}
      {(modal?.kind === 'checkin' || modal?.kind === 'checkout') && <CheckActionModal reservation={modal.res} action={modal.kind} onClose={() => setModal(null)} onSaved={fetchDashboard} />}

      <style>{`@media (min-width:901px){.iv-dash-root{height:calc(100dvh - 102px)}}@media (max-width:900px){.iv-stat-grid{grid-template-columns:repeat(2,1fr)!important}.iv-chart-grid{grid-template-columns:1fr!important}.iv-dash-root{height:auto;overflow-y:auto}}`}</style>
    </div>
  );
}
