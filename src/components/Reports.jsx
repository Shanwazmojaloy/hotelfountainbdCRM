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
import { getSnap, warmSnap, setSnap } from '@/lib/snap';
import { openBusinessDay, nextDay } from '@/lib/businessDay';

const dhakaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); };
const fmtLong = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); } catch { return d; } };
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return ''; } };
// POSITIVE payment match (house rule) — exclusion-only filters let charges (Stay Extension,
// Room Service) count as collections. Name kept for the 5 call sites; semantics hardened.
const REAL_PAY = /payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card/i;
const notBCF = (t) => REAL_PAY.test(t.type ?? '') && !/^\[VOID-DUP\]/.test(t.type ?? '') && !/balance carried forward/i.test(t.type ?? '');
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
      // transactions has NO payment_method column — selecting it 400s the whole query (see Billing).
      const [{ data: txs, error: txErr }, { data: rooms, error: rmErr }, { data: res, error: resErr }, { data: closes, error: clErr }] = await Promise.all([
        supabase.from('transactions').select('amount, type, fiscal_day, created_at, reservation_id, room_number, guest_name'),
        supabase.from('rooms').select('id, status, category, price'),
        supabase.from('reservations').select('id, guest_name, room_ids, check_in, check_out, total_amount, discount_amount, discount, paid_amount, status'),
        supabase.from('night_audit_log').select('audit_date, closed_at, closed_by, total_checkins, total_checkouts, total_collections, carried_over_dues').order('closed_at', { ascending: false }),
      ]);
      if (txErr || resErr || rmErr || clErr) console.error('[Reports] query error:', txErr || resErr || rmErr || clErr);
      const next = { txs: txs || [], rooms: rooms || [], res: res || [], closes: closes || [] };
      setData(next); setSnap('reports', next);
    } catch (e) { console.error('[Reports] fetch error:', e); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getSnap('reports')) {
      const warm = warmSnap('reports'); // localStorage tier — instant paint after full reload
      if (warm) { setData(warm); setLoading(false); }
    }
    fetchData();
  }, [fetchData]);

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
  // The OPEN business day = (latest closed + 1), NOT the calendar date. Collections & movements
  // accrue here — across calendar days — until "Closing Complete". `picked` overrides only when
  // the user steps to a historical day; otherwise the report tracks the open day automatically.
  const openDay = openBusinessDay(closes);
  const calToday = dhakaToday();
  const [picked, setPicked] = useState(null);
  const date = picked || openDay;
  const setDate = setPicked;
  const onOpenDay = date === openDay;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const closeRow = (closes || []).find((c) => (c.audit_date || '').slice(0, 10) === date) || null;

  // Open-day movements span openDay→today (so calendar 10-Jun AND 11-Jun show under the open
  // 10-Jun report); a historical day shows only its own date.
  const inDayRange = (d) => onOpenDay ? (d >= date && d <= calToday) : d === date;
  // Collections are stamped with the open day at write-time, so `=== date` already captures
  // every calendar day's payments that belong to this business day.
  const collectedFor = (r) => txs.filter((t) => notBCF(t) && t.reservation_id === r.id && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const ins = res.filter((r) => inDayRange((r.check_in || '').slice(0, 10))).map((r) => ({ ...r, _type: 'IN' }));
  const outs = res.filter((r) => inDayRange((r.check_out || '').slice(0, 10))).map((r) => ({ ...r, _type: 'OUT' }));
  const moves = [...ins, ...outs];
  const collected = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  // Due/Outstanding is ALWAYS the full live book (every reservation with a balance) — visible
  // on every day's report, not just guests who moved today.
  const allDue = res.filter((r) => dueOf(r) > 0).sort((a, b) => dueOf(b) - dueOf(a));
  const totalDue = allDue.reduce((a, r) => a + dueOf(r), 0);
  const tok = parseInt(token || '0', 10) || 0;
  const closing = collected - tok;
  // Payment-method split derived from the composite `type` (no payment_method column exists).
  const PM = [['Cash', /cash/i], ['bKash', /bkash/i], ['Nagad', /nagad/i], ['Card', /card/i], ['Bank', /bank|account|transfer/i]];
  const paySplit = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((acc, t) => { const hit = PM.find(([, re]) => re.test(t.type || '')); const k = hit ? hit[0] : 'Other'; acc[k] = (acc[k] || 0) + (Number(t.amount) || 0); return acc; }, {});

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
      setPicked(nextDay(date)); // jump to the freshly-opened next business day
      setToken('');
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  const Stepper = (
    <div className="flex items-center gap-2">
      <button className="iv-btn iv-btn--ghost" onClick={() => setDate(addDays(date, -1))} style={{ fontSize: 11, padding: '6px 11px' }}>‹</button>
      <input type="date" className="iv-input" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '7px 10px', width: 160 }} />
      <button className="iv-btn iv-btn--ghost" onClick={() => setDate(addDays(date, 1))} style={{ fontSize: 11, padding: '6px 11px' }}>›</button>
      <button className="iv-btn iv-btn--ghost" onClick={() => setPicked(null)} style={{ fontSize: 12, padding: '7px 12px' }}>Open Day</button>
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
            <button className="iv-btn iv-btn--ghost" onClick={handleClose} disabled={busy} style={{ fontSize: 12, padding: '7px 12px' }}>{busy ? 'Re-closing…' : '↻ Re-close'}</button>
            <button className="iv-btn" onClick={() => window.print()} style={{ fontSize: 12, padding: '7px 12px' }}>⬇ Download</button>
          </div>
        </div>
        {err && <div style={{ color: C.rose, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <Card accent={C.grn} bodyStyle={{ padding: '12px 18px' }}>
          <div style={{ fontFamily: 'var(--iv-head)', fontSize: 16, fontWeight: 700, color: 'var(--iv-ink)' }}>
            Day Closed —<em style={{ fontStyle: 'italic', color: 'var(--iv-gold)', fontWeight: 400 }}> {fmtLong(date)}</em>
          </div>
          <div style={{ fontSize: 11, color: C.ink3, marginTop: 4 }}>Locked snapshot. The figures below show only activity recorded <strong>after</strong> the close — the fresh daily report.</div>
        </Card>

        <div className="iv-stat-grid iv-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
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
          <button className="iv-btn iv-btn--ghost" onClick={() => window.print()} style={{ fontSize: 12, padding: '7px 12px' }}>⬇ Download</button>
          <button className="iv-btn" onClick={handleClose} disabled={busy || loading} style={{ fontSize: 12, padding: '7px 12px' }}>{busy ? 'Closing…' : '✓ Closing Complete'}</button>
        </div>
      </div>
      {err && <div style={{ color: C.rose, fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <div className="iv-stat-grid iv-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label="Movements" value={loading ? '—' : moves.length} accent={C.walnut} sub={fmtLong(date)} />
        <StatCard label="Total Collection" value={loading ? '—' : bdt(collected)} accent={C.gold} />
        <StatCard label="Closing Balance" value={loading ? '—' : bdt(closing)} accent={C.grn} sub="collection − token" />
        <StatCard label="Total Due" value={loading ? '—' : bdt(totalDue)} accent={C.rose} sub={`${allDue.length} reservation${allDue.length === 1 ? '' : 's'} outstanding`} />
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
        <div style={{ fontSize: 10, color: C.ink3, marginTop: 6, fontStyle: 'italic' }}>Closing Balance = Total Collection − Opening Token. Collections accrue to this open day until “Closing Complete” locks it and opens the next. Outstanding dues below carry across every day.</div>
      </Card>

      {/* Outstanding dues — always visible on every day's report (full live book) */}
      <Card title="Outstanding" titleAccent="Dues" accent={C.rose} bodyStyle={{ padding: 0 }}>
        <Table head={['Guest', 'Room', 'Status', 'Balance Due']}>
          {!loading && allDue.length === 0 && <tr><td colSpan={4} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No outstanding balances. ✓</td></tr>}
          {allDue.slice(0, 200).map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
              <td style={TD}>{r.guest_name || 'Guest'}</td>
              <td style={TD}><Badge tone="blue">{roomOf(r)}</Badge></td>
              <td style={TD}><Badge tone="neutral">{r.status || '—'}</Badge></td>
              <td style={{ ...TD, ...MONO, color: C.rose }}>{bdt(dueOf(r))}</td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* ── PRINT-ONLY: one-page A4 condensed report (Download → window.print) ── */}
      <div id="print-report" aria-hidden="true">
        <div className="pr-head">
          <div className="pr-brand"><span className="pr-crest">F</span><div><div className="pr-name">Hotel Fountain</div><div className="pr-sub">Management CRM · Powered by Lumea</div></div></div>
          <div className="pr-meta"><div>Daily Performance Report</div><div>Generated: {fmtLong(date)}</div><div className="pr-badge">LIVE — OPEN DAY</div></div>
        </div>
        <div className="pr-grid3">
          <div className="pr-card"><h4>Financial</h4>
            <div className="pr-row"><span>Total Collection</span><b>{bdt(collected)}</b></div>
            <div className="pr-row"><span>Opening Token</span><b>{bdt(tok)}</b></div>
            <div className="pr-row pr-tot"><span>Closing Balance</span><b>{bdt(closing)}</b></div>
          </div>
          <div className="pr-card"><h4>Payment Method</h4>
            {['Cash', 'bKash', 'Nagad', 'Card', 'Bank'].map((k) => (<div className="pr-row" key={k}><span>{k}</span><b>{bdt(paySplit[k] || 0)}</b></div>))}
            {paySplit.Other ? (<div className="pr-row"><span>Other</span><b>{bdt(paySplit.Other)}</b></div>) : null}
          </div>
          <div className="pr-card"><h4>Operational</h4>
            <div className="pr-row"><span>Total Movements</span><b>{moves.length}</b></div>
            <div className="pr-row"><span>Outstanding Dues</span><b>{allDue.length} resv.</b></div>
            <div className="pr-row pr-tot"><span>Total Due Sum</span><b className="pr-due">{bdt(totalDue)}</b></div>
          </div>
        </div>
        <div className="pr-sec">Daily Movements</div>
        <table className="pr-tbl">
          <thead><tr><th>Guest</th><th>Room</th><th>Type</th><th className="r">Collected</th><th className="r">Balance Due</th><th>Status</th></tr></thead>
          <tbody>
            {moves.map((m, i) => { const due = dueOf(m); return (
              <tr key={i}><td>{m.guest_name || 'Guest'}</td><td>{roomOf(m)}</td><td>{m._type === 'IN' ? 'Check-In' : 'Check-Out'}</td><td className="r">{bdt(collectedFor(m))}</td><td className="r">{due > 0 ? bdt(due) : '—'}</td><td>{due > 0 ? 'Balance Due' : 'Settled'}</td></tr>
            ); })}
          </tbody>
        </table>
        <div className="pr-dues">
          <div className="pr-dues-h"><span>Outstanding Dues — {allDue.length} reservation{allDue.length === 1 ? '' : 's'}</span><b>{bdt(totalDue)}</b></div>
          <div className="pr-dues-b">
            {allDue.slice(0, 6).map((r, i) => (<span className="pr-di" key={i}><b>{r.guest_name || 'Guest'}</b> <i>{roomOf(r)}</i> <u>{bdt(dueOf(r))}</u></span>))}
            {allDue.length > 6 ? (<span className="pr-more">+ {allDue.length - 6} more outstanding</span>) : null}
          </div>
        </div>
        <div className="pr-foot"><span>Hotel Fountain · Lumea CRM · /crm/reports</span><span>Generated {fmtLong(date)} · Page 1 of 1</span></div>
      </div>
      <style>{`#print-report{display:none}@media print{@page{size:A4 portrait;margin:10mm}html,body{background:#fff!important}body *{visibility:hidden!important}#print-report,#print-report *{visibility:visible!important}#print-report{display:block;position:absolute;left:0;top:0;width:100%;color:#000;font-family:'DM Sans',system-ui,sans-serif;font-size:10px;line-height:1.25;-webkit-print-color-adjust:exact;print-color-adjust:exact}#print-report .pr-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C5A059;padding-bottom:6px;margin-bottom:8px}#print-report .pr-brand{display:flex;gap:8px;align-items:center}#print-report .pr-crest{width:24px;height:24px;border:1.5px solid #C5A059;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#8B6914;font-family:Georgia,serif;font-size:13px}#print-report .pr-name{font-family:Georgia,'Libre Baskerville',serif;font-size:15px;font-weight:700;color:#2D2A26}#print-report .pr-sub{font-size:7px;letter-spacing:.2em;text-transform:uppercase;color:#7A7268;margin-top:1px}#print-report .pr-meta{text-align:right;font-size:8.5px;line-height:1.5;color:#2D2A26}#print-report .pr-badge{display:inline-block;margin-top:2px;background:#E9F3EE;color:#2F7D5B;border:1px solid #cfe5d9;border-radius:3px;padding:1px 6px;font-size:8px;font-weight:600}#print-report .pr-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:8px}#print-report .pr-card{border:1px solid #EAE6DD;border-radius:5px;padding:6px 8px;background:#fcfbf8}#print-report .pr-card h4{font-family:'IBM Plex Mono',monospace;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:#8B6914;margin:0 0 4px;border-bottom:1px solid #EAE6DD;padding-bottom:3px}#print-report .pr-row{display:flex;justify-content:space-between;align-items:baseline;padding:2px 0;font-size:9.5px;color:#2D2A26}#print-report .pr-row span{color:#7A7268}#print-report .pr-row b{font-family:'IBM Plex Mono',monospace;font-weight:600}#print-report .pr-row.pr-tot{border-top:1px dashed #EAE6DD;margin-top:3px;padding-top:4px}#print-report .pr-row.pr-tot b{font-size:11px;color:#8B6914}#print-report .pr-due{color:#9A6A12!important}#print-report .pr-sec{font-family:Georgia,serif;font-size:11px;font-weight:700;color:#2D2A26;margin:3px 0 4px}#print-report .pr-tbl{width:100%;border-collapse:collapse}#print-report .pr-tbl th{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:#7A7268;text-align:left;border-bottom:1.5px solid #2D2A26;padding:4px 6px}#print-report .pr-tbl td{font-size:9.5px;padding:3px 6px;border-bottom:1px solid #EAE6DD;font-family:'IBM Plex Mono',monospace}#print-report .pr-tbl td:first-child,#print-report .pr-tbl th:first-child{font-family:'DM Sans',sans-serif}#print-report .pr-tbl .r{text-align:right}#print-report .pr-tbl tr{page-break-inside:avoid;break-inside:avoid}#print-report .pr-dues{margin-top:8px;border:1px solid #EAE6DD;border-radius:5px}#print-report .pr-dues-h{display:flex;justify-content:space-between;align-items:center;background:#FBF1DD;border-bottom:1px solid #ecdcb8;padding:5px 8px;font-family:'IBM Plex Mono',monospace;font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#9A6A12;font-weight:600}#print-report .pr-dues-h b{font-size:12px}#print-report .pr-dues-b{display:flex;flex-wrap:wrap;gap:4px 14px;padding:6px 8px}#print-report .pr-di{font-size:9px;color:#2D2A26}#print-report .pr-di i{font-style:normal;color:#7A7268;font-size:7.5px;font-family:'IBM Plex Mono',monospace}#print-report .pr-di u{text-decoration:none;color:#9A6A12;font-weight:600;font-family:'IBM Plex Mono',monospace}#print-report .pr-more{font-size:8.5px;color:#7A7268;align-self:center}#print-report .pr-foot{display:flex;justify-content:space-between;margin-top:7px;border-top:1px solid #EAE6DD;padding-top:5px;font-family:'IBM Plex Mono',monospace;font-size:7.5px;color:#7A7268}#print-report .pr-grid3,#print-report .pr-card,#print-report .pr-tbl,#print-report .pr-dues,#print-report .pr-head{page-break-inside:avoid;break-inside:avoid}}`}</style>
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
