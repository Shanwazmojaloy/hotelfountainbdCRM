'use client';

// Reports — Hotel Fountain Design System (Daily / Monthly / Yearly tabs).
// Daily: date-stepped movements (check-ins/outs) + collection ledger w/ opening token,
//   PLUS "Closing Complete" → snapshots the day into night_audit_log (service-role route)
//   and flips the view to a post-close "fresh" report: only outstanding dues + NEW
//   check-ins/outs (dated after the closed day) + NEW collections (recorded after closed_at).
// Monthly: per-day revenue bars. Yearly: per-month revenue bars. Live, read-only.
import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Tabs, Card, StatCard, Table, Badge, TD, MONO, C, bdt } from './dskit';
import { getSnap, setSnap } from '@/lib/snap';

const dhakaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); };
const fmtLong = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); } catch { return d; } };
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return ''; } };
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
  const _cached = getSnap('reports');
  const [data, setData] = useState(_cached || { txs: [], rooms: [], res: [], closes: [] });
  const [loading, setLoading] = useState(!_cached);
  const [period, setPeriod] = useState('daily');

  const fetchData = useCallback(async () => {
    if (!getSnap('reports')) setLoading(true); // revisits refresh silently behind cached data
    try {
      const supabase = getSupabaseClient();
      const [{ data: txs }, { data: rooms }, { data: res }, { data: closes }] = await Promise.all([
        supabase.from('transactions').select('amount, type, payment_method, fiscal_day, created_at, reservation_id, room_number, guest_name'),
        supabase.from('rooms').select('id, status, category, price'),
        supabase.from('reservations').select('id, guest_name, room_ids, room_number, check_in, check_out, total_amount, discount_amount, discount, paid_amount, status'),
        supabase.from('night_audit_log').select('audit_date, closed_at, closed_by, total_checkins, total_checkouts, total_collections, carried_over_dues').order('closed_at', { ascending: false }),
      ]);
      const next = { txs: txs || [], rooms: rooms || [], res: res || [], closes: closes || [] };
      setData(next); setSnap('reports', next);
    } catch (e) { console.error('[Reports] fetch error:', e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <Tabs tabs={[{ id: 'daily', label: 'Daily' }, { id: 'monthly', label: 'Monthly' }, { id: 'yearly', label: 'Yearly' }]} value={period} onChange={setPeriod} />
      {period === 'daily' && <Daily {...data} loading={loading} onClosed={fetchData} />}
      {period === 'monthly' && <Monthly txs={data.txs} />}
      {period === 'yearly' && <Yearly txs={data.txs} />}
    </div>
  );
}

function Daily({ txs, res, closes, loading, onClosed }) {
  const [date, setDate] = useState(dhakaToday());
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const closeRow = (closes || []).find((c) => (c.audit_date || '').slice(0, 10) === date) || null;

  const collectedFor = (r) => txs.filter((t) => notBCF(t) && t.reservation_id === r.id && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const ins = res.filter((r) => (r.check_in || '').slice(0, 10) === date).map((r) => ({ ...r, _type: 'IN' }));
  const outs = res.filter((r) => (r.check_out || '').slice(0, 10) === date).map((r) => ({ ...r, _type: 'OUT' }));
  const moves = [...ins, ...outs];
  const collected = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const dues = moves.filter((m) => dueOf(m) > 0);
  const totalDue = dues.reduce((a, m) => a + dueOf(m), 0);
  const tok = parseInt(token || '0', 10) || 0;
  const closing = collected - tok;

  async function handleClose() {
    setErr('');
    const ok = window.confirm(`Close the day for ${fmtLong(date)}?\n\nThis snapshots today's figures and switches Reports to the post-close view (outstanding dues + new check-ins/outs + new collections recorded after now).`);
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/crm/close-day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audit_date: date }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not close the day.');
      await onClosed();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  const Stepper = (
    <div className="flex items-center gap-2">
      <button className="iv-btn iv-btn--ghost" onClick={() => setDate(addDays(date, -1))} style={{ fontSize: 11, padding: '6px 11px' }}>‹</button>
      <input type="date" className="iv-input" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '7px 10px', width: 160 }} />
      <button className="iv-btn iv-btn--ghost" onClick={() => setDate(addDays(date, 1))} style={{ fontSize: 11, padding: '6px 11px' }}>›</button>
      <button className="iv-btn iv-btn--ghost" onClick={() => setDate(dhakaToday())} style={{ fontSize: 9.5, padding: '7px 12px' }}>Today</button>
    </div>
  );

  // ── POST-CLOSE "FRESH" REPORT ──────────────────────────────────────────────
  if (closeRow) {
    const cutoff = new Date(closeRow.closed_at).getTime();
    const newCollTx = txs.filter((t) => notBCF(t) && t.created_at && new Date(t.created_at).getTime() > cutoff);
    const newCollected = newCollTx.reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const newIns = res.filter((r) => (r.check_in || '').slice(0, 10) > date).map((r) => ({ ...r, _type: 'IN' }));
    const newOuts = res.filter((r) => (r.check_out || '').slice(0, 10) > date).map((r) => ({ ...r, _type: 'OUT' }));
    const newMoves = [...newIns, ...newOuts].sort((a, b) => ((a._type === 'IN' ? a.check_in : a.check_out) || '').localeCompare((b._type === 'IN' ? b.check_in : b.check_out) || ''));
    const outstanding = res.filter((r) => dueOf(r) > 0).sort((a, b) => dueOf(b) - dueOf(a));
    const totalOutstanding = outstanding.reduce((a, r) => a + dueOf(r), 0);

    return (
      <>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          {Stepper}
          <div className="flex items-center gap-2">
            <Badge tone="green">✓ Closed {fmtTime(closeRow.closed_at)} · {closeRow.closed_by || 'Staff'}</Badge>
            <button className="iv-btn iv-btn--ghost" onClick={handleClose} disabled={busy} style={{ fontSize: 9.5, padding: '7px 12px' }}>{busy ? 'Re-closing…' : '↻ Re-close'}</button>
            <button className="iv-btn" onClick={() => window.print()} style={{ fontSize: 9.5, padding: '7px 12px' }}>⬇ Download</button>
          </div>
        </div>
        {err && <div style={{ color: C.rose, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <Card accent={C.grn} bodyStyle={{ padding: '12px 18px' }}>
          <div style={{ fontFamily: 'var(--iv-head)', fontSize: 16, fontWeight: 700, color: 'var(--iv-ink)' }}>
            Day Closed —<em style={{ fontStyle: 'italic', color: 'var(--iv-gold)', fontWeight: 400 }}> {fmtLong(date)}</em>
          </div>
          <div style={{ fontSize: 11, color: C.ink3, marginTop: 4 }}>Locked snapshot. The figures below show only activity recorded <strong>after</strong> the close — the fresh daily report.</div>
        </Card>

        <div className="iv-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
          <StatCard label="Closed Collection" value={bdt(closeRow.total_collections)} accent={C.walnut} sub="locked at close" />
          <StatCard label="New Collection" value={bdt(newCollected)} accent={C.gold} sub="recorded after close" />
          <StatCard label="New Movements" value={newMoves.length} accent={C.sky} sub="check-ins / outs after close" />
          <StatCard label="Outstanding Due" value={bdt(totalOutstanding)} accent={C.rose} sub={`${outstanding.length} reservation${outstanding.length === 1 ? '' : 's'}`} />
        </div>

        <Card title="New" titleAccent="Movements" accent={C.sky} bodyStyle={{ padding: 0 }}>
          <Table head={['Guest', 'Room', 'Type', 'Date', 'Balance', 'Status']}>
            {newMoves.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No new check-ins or check-outs after this close.</td></tr>}
            {newMoves.map((m, i) => {
              const due = dueOf(m);
              const dt = (m._type === 'IN' ? m.check_in : m.check_out || '').slice(0, 10);
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                  <td style={TD}>{m.guest_name || 'Guest'}</td>
                  <td style={TD}><Badge tone="blue">{roomOf(m)}</Badge></td>
                  <td style={TD}><Badge tone={m._type === 'IN' ? 'green' : 'teal'}>{m._type === 'IN' ? 'Check-In' : 'Check-Out'}</Badge></td>
                  <td style={{ ...TD, ...MONO, color: C.ink3 }}>{dt}</td>
                  <td style={{ ...TD, ...MONO, color: due > 0 ? C.rose : C.ink3 }}>{due > 0 ? bdt(due) : '—'}</td>
                  <td style={TD}>{due > 0 ? <Badge tone="amber">Balance Due</Badge> : <Badge tone="green">Settled</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card title="New" titleAccent="Collections" accent={C.gold} bodyStyle={{ padding: 0 }}>
          <Table head={['Guest', 'Room', 'Type', 'Recorded', 'Amount']}>
            {newCollTx.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No new collections recorded since the close.</td></tr>}
            {newCollTx.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                <td style={TD}>{t.guest_name || '—'}</td>
                <td style={TD}><Badge tone="blue">{t.room_number || '—'}</Badge></td>
                <td style={{ ...TD, fontSize: 11, color: C.ink3 }}>{t.type || '—'}</td>
                <td style={{ ...TD, ...MONO, color: C.ink3 }}>{fmtTime(t.created_at)}</td>
                <td style={{ ...TD, ...MONO, color: C.grn }}>{bdt(t.amount)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Outstanding" titleAccent="Due (carried)" accent={C.rose} bodyStyle={{ padding: 0 }}>
          <Table head={['Guest', 'Room', 'Status', 'Balance Due']}>
            {outstanding.length === 0 && <tr><td colSpan={4} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No outstanding balances. ✓</td></tr>}
            {outstanding.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                <td style={TD}>{r.guest_name || 'Guest'}</td>
                <td style={TD}><Badge tone="blue">{roomOf(r)}</Badge></td>
                <td style={TD}><Badge tone="neutral">{r.status || '—'}</Badge></td>
                <td style={{ ...TD, ...MONO, color: C.rose }}>{bdt(dueOf(r))}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </>
    );
  }

  // ── LIVE (not-yet-closed) REPORT ───────────────────────────────────────────
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {Stepper}
        <div className="flex items-center gap-2">
          <input className="iv-input" type="number" placeholder="Opening token ৳" value={token} onChange={(e) => setToken(e.target.value)} style={{ padding: '7px 10px', width: 170 }} />
          <button className="iv-btn iv-btn--ghost" onClick={() => window.print()} style={{ fontSize: 9.5, padding: '7px 12px' }}>⬇ Download</button>
          <button className="iv-btn" onClick={handleClose} disabled={busy || loading} style={{ fontSize: 9.5, padding: '7px 12px' }}>{busy ? 'Closing…' : '✓ Closing Complete'}</button>
        </div>
      </div>
      {err && <div style={{ color: C.rose, fontSize: 12, marginBottom: 10 }}>{err}</div>}

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
        <div style={{ fontSize: 10, color: C.ink3, marginTop: 6, fontStyle: 'italic' }}>Closing Balance = Total Collection − Opening Token. Outstanding due ({bdt(totalDue)}) carries to guest folios. Press “Closing Complete” to lock the day and open the fresh post-close report.</div>
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
