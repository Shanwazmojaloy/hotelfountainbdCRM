'use client';

// Reports — Hotel Fountain Design System (Daily / Monthly / Yearly tabs).
// Daily: date-stepped movements (check-ins/outs) + collection ledger w/ opening token.
// Monthly: per-day revenue bars. Yearly: per-month revenue bars. Live, read-only.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Tabs, Card, StatCard, Table, Badge, TD, MONO, C, bdt } from './dskit';

const dhakaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); };
const fmtLong = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); } catch { return d; } };
const notBCF = (t) => !/balance carried forward/i.test(t.type ?? '');
const dueOf = (r) => Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0) - (+r.paid_amount || 0));
const roomOf = (r) => Array.isArray(r.room_ids) ? r.room_ids.join(', ') : (r.room_number || '—');

function FRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 12 }}>
      <span style={{ color: 'var(--iv-ink3)' }}>{label}</span>
      <span className="iv-mono" style={{ color: color || 'var(--iv-ink)' }}>{value}</span>
    </div>
  );
}

export default function Reports() {
  const [data, setData] = useState({ txs: [], rooms: [], res: [] });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('daily');

  useEffect(() => { fetchData(); }, []);
  async function fetchData() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: txs }, { data: rooms }, { data: res }] = await Promise.all([
        supabase.from('transactions').select('amount, type, payment_method, fiscal_day, created_at, reservation_id, room_number, guest_name'),
        supabase.from('rooms').select('id, status, category, price'),
        supabase.from('reservations').select('id, guest_name, room_ids, room_number, check_in, check_out, total_amount, discount_amount, discount, paid_amount, status'),
      ]);
      setData({ txs: txs || [], rooms: rooms || [], res: res || [] });
    } catch (e) { console.error('[Reports] fetch error:', e); } finally { setLoading(false); }
  }

  return (
    <div>
      <Tabs tabs={[{ id: 'daily', label: 'Daily' }, { id: 'monthly', label: 'Monthly' }, { id: 'yearly', label: 'Yearly' }]} value={period} onChange={setPeriod} />
      {period === 'daily' && <Daily {...data} loading={loading} />}
      {period === 'monthly' && <Monthly txs={data.txs} />}
      {period === 'yearly' && <Yearly txs={data.txs} />}
    </div>
  );
}

function Daily({ txs, res, loading }) {
  const [date, setDate] = useState(dhakaToday());
  const [token, setToken] = useState('');
  const collectedFor = (r) => txs.filter((t) => notBCF(t) && t.reservation_id === r.id && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const ins = res.filter((r) => (r.check_in || '').slice(0, 10) === date).map((r) => ({ ...r, _type: 'IN' }));
  const outs = res.filter((r) => (r.check_out || '').slice(0, 10) === date).map((r) => ({ ...r, _type: 'OUT' }));
  const moves = [...ins, ...outs];
  const collected = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const dues = moves.filter((m) => dueOf(m) > 0);
  const totalDue = dues.reduce((a, m) => a + dueOf(m), 0);
  const tok = parseInt(token || '0', 10) || 0;
  const closing = collected - tok;

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button className="iv-btn iv-btn--ghost" onClick={() => setDate(addDays(date, -1))} style={{ fontSize: 11, padding: '6px 11px' }}>‹</button>
          <input type="date" className="iv-input" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '7px 10px', width: 160 }} />
          <button className="iv-btn iv-btn--ghost" onClick={() => setDate(addDays(date, 1))} style={{ fontSize: 11, padding: '6px 11px' }}>›</button>
          <button className="iv-btn iv-btn--ghost" onClick={() => setDate(dhakaToday())} style={{ fontSize: 9.5, padding: '7px 12px' }}>Today</button>
        </div>
        <div className="flex items-center gap-2">
          <input className="iv-input" type="number" placeholder="Opening token ৳" value={token} onChange={(e) => setToken(e.target.value)} style={{ padding: '7px 10px', width: 170 }} />
          <button className="iv-btn" onClick={() => window.print()} style={{ fontSize: 9.5, padding: '7px 12px' }}>⬇ Download</button>
        </div>
      </div>

      <div className="iv-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Movements" value={loading ? '—' : moves.length} accent={C.walnut} sub={fmtLong(date)} />
        <StatCard label="Total Collection" value={loading ? '—' : bdt(collected)} accent={C.gold} />
        <StatCard label="Closing Balance" value={loading ? '—' : bdt(closing)} accent={C.grn} sub="collection − token" />
        <StatCard label="Total Due" value={loading ? '—' : bdt(totalDue)} accent={C.rose} sub={`${dues.length} carried`} />
      </div>

      <Card title="Daily" titleAccent="Movements" bodyStyle={{ padding: 0 }}>
        <Table head={['Guest', 'Room', 'Type', 'Collected', 'Balance', 'Status']}>
          {loading && <tr><td colSpan={6} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>Loading…</td></tr>}
          {!loading && moves.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No check-ins or check-outs on {fmtLong(date)}.</td></tr>}
          {moves.map((m, i) => {
            const due = dueOf(m);
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                <td style={TD}>{m.guest_name || 'Guest'}</td>
                <td style={TD}><Badge tone="blue">{roomOf(m)}</Badge></td>
                <td style={TD}><Badge tone={m._type === 'IN' ? 'green' : 'teal'}>{m._type === 'IN' ? 'Check-In' : 'Check-Out'}</Badge></td>
                <td style={{ ...TD, ...MONO, color: C.grn }}>{bdt(collectedFor(m))}</td>
                <td style={{ ...TD, ...MONO, color: due > 0 ? C.rose : C.ink3 }}>{due > 0 ? bdt(due) : '—'}</td>
                <td style={TD}>{due > 0 ? <Badge tone="amber">Balance Due</Badge> : <Badge tone="green">Settled</Badge>}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="Closing" titleAccent="Ledger" accent={C.gold}>
        <FRow label="Total Collection" value={bdt(collected)} />
        <FRow label="Less — Opening Token / Float" value={'− ' + bdt(tok)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, fontFamily: 'var(--iv-head)', paddingTop: 8 }}>
          <span>Closing Balance</span><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(closing)}</span>
        </div>
        <div style={{ fontSize: 10, color: C.ink3, marginTop: 6, fontStyle: 'italic' }}>Closing Balance = Total Collection − Opening Token. Outstanding due ({bdt(totalDue)}) carries to guest folios.</div>
      </Card>
    </>
  );
}

function RevBars({ bars, gap, lastGold, fontSize }) {
  const max = Math.max(1, ...bars.map((b) => b.v));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: 180, padding: '4px 0' }}>
      {bars.map((b, i) => (
        <div key={i} title={`${b.lbl} · ${bdt(b.v)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', height: `${Math.round((b.v / max) * 100)}%`, minHeight: 2, background: (lastGold && i === bars.length - 1) ? 'var(--iv-gold)' : 'var(--iv-side)' }} />
          <span style={{ fontFamily: 'var(--iv-mono)', fontSize, color: 'var(--iv-ink3)' }}>{b.lbl}</span>
        </div>
      ))}
    </div>
  );
}

function Monthly({ txs }) {
  const [month, setMonth] = useState(dhakaToday().slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const bars = Array.from({ length: days }, (_, i) => {
    const ds = `${month}-${String(i + 1).padStart(2, '0')}`;
    const v = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === ds).reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return { v, lbl: String(i + 1) };
  });
  const total = bars.reduce((a, b) => a + b.v, 0);
  return (
    <Card title="Monthly" titleAccent="Revenue" accent={C.gold} action={<input type="month" className="iv-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '6px 10px', width: 160 }} />}>
      <RevBars bars={bars} gap={2} lastGold fontSize={7} />
      <div className="flex justify-between" style={{ fontSize: 11, color: 'var(--iv-ink3)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--iv-border2)' }}>
        <span>Month total</span><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(total)}</span>
      </div>
    </Card>
  );
}

function Yearly({ txs }) {
  const [year, setYear] = useState(() => dhakaToday().slice(0, 4));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const bars = MONTHS.map((ml, i) => {
    const mm = `${year}-${String(i + 1).padStart(2, '0')}`;
    const v = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 7) === mm).reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return { v, lbl: ml };
  });
  const total = bars.reduce((a, b) => a + b.v, 0);
  return (
    <Card title="Yearly" titleAccent="Revenue" accent={C.gold} action={<input className="iv-input" type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ padding: '6px 10px', width: 110 }} />}>
      <RevBars bars={bars} gap={6} lastGold={false} fontSize={8} />
      <div className="flex justify-between" style={{ fontSize: 11, color: 'var(--iv-ink3)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--iv-border2)' }}>
        <span>Year total</span><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(total)}</span>
      </div>
    </Card>
  );
}
