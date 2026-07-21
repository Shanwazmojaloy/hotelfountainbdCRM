'use client';

// Reports — Hotel Fountain Design System (Daily / Monthly / Yearly tabs).
// Daily: date-stepped movements (check-ins/outs) + collection ledger w/ opening token,
//   PLUS "Closing Complete" → snapshots the day into night_audit_log (service-role route)
//   and flips the view to a post-close "fresh" report: only outstanding dues + NEW
//   check-ins/outs (dated after the closed day) + NEW collections (recorded after closed_at).
// Monthly: per-day revenue bars. Yearly: per-month revenue bars. Live, read-only.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Tabs, Card, StatCard, Table, Badge, TD, MONO, C, bdt } from './dskit';
import { getSnap, warmSnap, setSnap } from '@/lib/snap';
import { openBusinessDay, nextDay } from '@/lib/businessDay';
import { outstandingList } from '@/lib/dues';

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

const PRINT_CSS = `#print-report{display:none}@media print{@page{size:A4 portrait;margin:7mm 9mm}html,body{background:#fff!important}body *{visibility:hidden!important}#print-report,#print-report *{visibility:visible!important}#print-report{display:block;position:absolute;left:0;top:0;width:100%;color:#000;font-family:'DM Sans',system-ui,sans-serif;font-size:8px;line-height:1.12;text-rendering:geometricPrecision;font-feature-settings:'tnum' 1,'lnum' 1;-webkit-print-color-adjust:exact;print-color-adjust:exact}#print-report .pr-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C5A059;padding-bottom:6px;margin-bottom:8px}#print-report .pr-brand{display:flex;gap:8px;align-items:center}#print-report .pr-crest{width:30px;height:30px;object-fit:contain;flex:none}#print-report .pr-name{font-family:Georgia,'Libre Baskerville',serif;font-size:15px;font-weight:700;color:#2D2A26}#print-report .pr-sub{font-size:7px;letter-spacing:.2em;text-transform:uppercase;color:#7A7268;margin-top:1px}#print-report .pr-meta{text-align:right;font-size:8.5px;line-height:1.5;color:#2D2A26}#print-report .pr-badge{display:inline-block;margin-top:2px;background:#E9F3EE;color:#2F7D5B;border:1px solid #cfe5d9;border-radius:3px;padding:1px 6px;font-size:8px;font-weight:600}#print-report .pr-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:8px}#print-report .pr-card{border:1px solid #EAE6DD;border-radius:5px;padding:4px 7px;background:#fcfbf8}#print-report .pr-card h4{font-family:'IBM Plex Mono',monospace;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:#8B6914;margin:0 0 4px;border-bottom:1px solid #EAE6DD;padding-bottom:3px}#print-report .pr-row{display:flex;justify-content:space-between;align-items:baseline;padding:1px 0;font-size:8.5px;color:#2D2A26}#print-report .pr-row span{color:#7A7268}#print-report .pr-row b{font-family:'IBM Plex Mono',monospace;font-weight:600}#print-report .pr-row.pr-tot{border-top:1px dashed #EAE6DD;margin-top:3px;padding-top:4px}#print-report .pr-row.pr-tot b{font-size:11px;color:#8B6914}#print-report .pr-due{color:#9A6A12!important}#print-report .pr-sec{font-family:Georgia,serif;font-size:9.5px;font-weight:700;color:#2D2A26;margin:5px 0 3px}#print-report .pr-panel{border:1px solid #E2DCCE;border-radius:6px;overflow:hidden;margin-bottom:6px;background:#fff}#print-report .pr-panel-h{display:flex;justify-content:space-between;align-items:baseline;padding:5px 9px;background:#F7F3EA;border-bottom:1.5px solid #C5A059}#print-report .pr-panel-h--due{background:#FBF1DD;border-bottom-color:#D9A441}#print-report .pr-panel-t{font-family:Georgia,'Libre Baskerville',serif;font-size:11px;font-weight:700;color:#2D2A26}#print-report .pr-panel-s{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#8B6914;letter-spacing:.04em}#print-report .pr-panel .pr-tbl th,#print-report .pr-panel .pr-tbl td{padding-left:9px;padding-right:9px}#print-report .pr-panel .pr-tbl thead tr{background:#FCFBF8}#print-report .pr-panel .pr-tbl tbody tr:last-child td{border-bottom:none}#print-report .pr-tbl{width:100%;border-collapse:collapse}#print-report .pr-tbl th{font-family:'IBM Plex Mono',monospace;font-size:7px;letter-spacing:.06em;text-transform:uppercase;color:#7A7268;text-align:left;border-bottom:1.5px solid #2D2A26;padding:2.5px 5px}#print-report .pr-tbl td{font-size:8px;padding:1px 5px;border-bottom:1px solid #EAE6DD;font-family:'IBM Plex Mono',monospace}#print-report .pr-tbl td:first-child,#print-report .pr-tbl th:first-child{font-family:'DM Sans',sans-serif}#print-report .pr-tbl .r{text-align:right}#print-report .pr-tbl tr{page-break-inside:avoid;break-inside:avoid}#print-report .pr-tbl tr.pr-tot-row td{border-top:1.5px solid #2D2A26;font-weight:700;color:#9A6A12;padding-top:5px;font-family:'IBM Plex Mono',monospace}#print-report .pr-dues{margin-top:8px;border:1px solid #EAE6DD;border-radius:5px}#print-report .pr-dues-h{display:flex;justify-content:space-between;align-items:center;background:#FBF1DD;border-bottom:1px solid #ecdcb8;padding:5px 8px;font-family:'IBM Plex Mono',monospace;font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#9A6A12;font-weight:600}#print-report .pr-dues-h b{font-size:12px}#print-report .pr-dues-b{display:flex;flex-wrap:wrap;gap:4px 14px;padding:6px 8px}#print-report .pr-di{font-size:9px;color:#2D2A26}#print-report .pr-di i{font-style:normal;color:#7A7268;font-size:7.5px;font-family:'IBM Plex Mono',monospace}#print-report .pr-di u{text-decoration:none;color:#9A6A12;font-weight:600;font-family:'IBM Plex Mono',monospace}#print-report .pr-more{font-size:8.5px;color:#7A7268;align-self:center}#print-report .pr-foot{display:flex;justify-content:space-between;margin-top:4px;border-top:1px solid #EAE6DD;padding-top:5px;font-family:'IBM Plex Mono',monospace;font-size:7.5px;color:#7A7268}#print-report .pr-grid3,#print-report .pr-card,#print-report .pr-head{page-break-inside:avoid;break-inside:avoid}}`;

export default function Reports() {
  const _cached = getSnap('reports');
  const [data, setData] = useState(_cached || { txs: [], rooms: [], res: [], closes: [] });
  const [loading, setLoading] = useState(!_cached);
  const [period, setPeriod] = useState('daily');

  const fetchData = useCallback(async () => {
    if (!getSnap('reports')) setLoading(true); // revisits refresh silently behind cached data
    try {
      const supabase = getSupabaseClient();
      // C3: PII/financial reads (transactions, reservations) via the session-gated route; rooms +
      // night_audit_log stay on the anon client (not sensitive, anon SELECT retained).
      const [txR, resR, { data: rooms, error: rmErr }, { data: closes, error: clErr }, fbR] = await Promise.all([
        fetch('/api/crm/data?resource=transactions&cols=id,type,amount,reservation_id,fiscal_day,created_at,guest_name,room_number'),
        // PERF (2026-07-21): project ONLY the columns the Daily/dues/movement math reads.
        // The unprojected fetch pulled every column (incl. room_details jsonb, notes, ota_*, fbp/fbc)
        // = ~1.56MB / ~3s on prod. These 12 cover every money + display field Reports uses.
        // room_number is intentionally omitted (not a reservations column — it lives in room_ids).
        fetch('/api/crm/data?resource=reservations&cols=id,room_ids,status,total_amount,paid_amount,discount_amount,discount,check_in,check_out,checked_in_at,checked_out_at,guest_name'),
        supabase.from('rooms').select('id, status, category, price'),
        supabase.from('night_audit_log').select('audit_date, closed_at, closed_by, total_checkins, total_checkouts, total_collections, carried_over_dues, opening_token, payouts').order('closed_at', { ascending: false }),
        // F&B (restaurant) sales for the open business day — 403s (→ empty) for roles without
        // restaurant access, so managers see no F&B card while owner/admin do.
        fetch('/api/crm/restaurant?resource=orders'),
      ]);
      const txj = await txR.json().catch(() => ({}));
      const resj = await resR.json().catch(() => ({}));
      const fbj = await fbR.json().catch(() => ({}));
      if (!txR.ok || !resR.ok || rmErr || clErr) console.error('[Reports] query error:', txj.error || resj.error || rmErr || clErr);
      const next = { txs: txj.rows || [], rooms: rooms || [], res: resj.rows || [], closes: closes || [], fb: fbj.rows || [] };
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

function Daily({ txs, res, closes, fb, loading, onClosed }) {
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
  const [payouts, setPayouts] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // PERF: index eligible (non-BCF) txs by reservation_id ONCE. Previously collectedFor() and
  // _txTimeFor() each scanned the FULL transactions array for every reservation, and the movement
  // sort comparator called _txTimeFor() per comparison — O(res×txs) / O(n·log n·txs), re-run on
  // every render (incl. every keystroke in the close-day fields). Now each lookup is that
  // reservation's short tx list. Mathematically identical: notBCF + reservation_id are pre-applied,
  // the per-call date filter and sum are unchanged.
  const _txByRes = useMemo(() => {
    const mp = new Map();
    for (const t of txs) {
      if (!notBCF(t)) continue;
      const k = t.reservation_id;
      if (k == null) continue;
      let arr = mp.get(k); if (!arr) { arr = []; mp.set(k, arr); }
      arr.push(t);
    }
    return mp;
  }, [txs]);

  const closeRow = (closes || []).find((c) => (c.audit_date || '').slice(0, 10) === date) || null;

  // Open-day movements span openDay→today (so calendar 10-Jun AND 11-Jun show under the open
  // 10-Jun report). A CLOSED day must keep the SAME span it had while live: business days close
  // after midnight (03-Jul closed 07:33 am on the 04th), so pending Due-Out/Check-Out rows whose
  // stay date is the close morning belong to it. Narrowing a closed day to `d === date` made
  // those rows vanish after Closing Complete — the owner's printed live report (12 movements)
  // no longer matched the CRM's closed view (9). Boundary = Dhaka calendar date of closed_at.
  const dhakaDateOf = (ts) => { try { return ts ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)) : null; } catch { return null; } };
  const closeBoundary = dhakaDateOf(closeRow?.closed_at) || date;
  const inDayRange = (d) => onOpenDay ? (d >= date && d <= calToday) : (d >= date && d <= closeBoundary);
  // …but the DATE span alone over-includes: actions taken AFTER the close moment on the same
  // calendar morning (e.g. a 10:08 am check-in when the day closed 07:33) belong to the NEXT
  // business day. On a closed day, gate rows by the ACTUAL action timestamp vs closed_at —
  // the closed report then reads exactly as it did at the moment of Closing Complete.
  const closedAtMs = !onOpenDay && closeRow?.closed_at ? new Date(closeRow.closed_at).getTime() : null;
  const beforeClose = (ts) => closedAtMs == null || !ts || new Date(ts).getTime() <= closedAtMs;
  // Collections are stamped with the open day at write-time, so `=== date` already captures
  // every calendar day's payments that belong to this business day.
  const collectedFor = (r) => (_txByRes.get(r.id) || []).filter((t) => (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const ins = res.filter((r) => inDayRange((r.check_in || '').slice(0, 10)) && beforeClose(r.checked_in_at)).map((r) => ({ ...r, _type: 'IN' }));
  const outs = res.filter((r) => inDayRange((r.check_out || '').slice(0, 10))).map((r) => ({ ...r, _type: 'OUT' }));
  const _mv = [...ins, ...outs];
  const _movedIds = new Set(_mv.map((m) => m.id));
  const payOnly = res.filter((r) => !_movedIds.has(r.id) && collectedFor(r) > 0).map((r) => ({ ...r, _type: 'PAY' }));
  const _moves = [..._mv, ...payOnly];
  // Collection is PER-RESERVATION. A guest who checks in AND out on the same open day yields two
  // movement rows; attribute the day's collection to the FIRST row only (Check-In before Check-Out)
  // so the Collected column reconciles to Total Collection and isn't double-counted.
  const _collSeen = new Set();
  const _movesColl = _moves.map((m) => { if (_collSeen.has(m.id)) return 0; _collSeen.add(m.id); return collectedFor(m); });
  // Daily Movements shows only rows that NEED attention or actually moved money in THIS open day:
  // a live balance due, OR the row that OWNS today's collection. The redundant Check-Out row of an
  // already-settled guest (collection shown on its Check-In row, nothing owed) is hidden — without
  // this it renders as a blank "—/—/Settled" ghost row. The filter MUST use the DEDUPED collection
  // (`_movesColl`), not the raw per-reservation `collectedFor`, or the duplicate row slips through.
  const _keep = _moves.map((m, i) => dueOf(m) > 0 || _movesColl[i] > 0);
  // A row whose check_out DATE is in range is only a real "Check-Out" once the guest actually
  // departed WITHIN this business day. On the open day that's live status; on a CLOSED day it's
  // checked_out_at ≤ closed_at — a guest who left AFTER the close stays "Due Out" here forever
  // (that was the truth at close; the departure lists on the next day's report instead).
  const isDeparted = (m) => closedAtMs != null
    ? !!(m.checked_out_at && new Date(m.checked_out_at).getTime() <= closedAtMs)
    : String(m.status || '').toUpperCase() === 'CHECKED_OUT';
  // Action time per movement: IN→checked_in_at, OUT→checked_out_at (only if departed within the
  // day — a post-close departure shows the blank "Due Out" it had at close), PAY→latest tx today.
  const _txTimeFor = (r) => { const l = (_txByRes.get(r.id) || []).filter((t) => t.created_at && (t.fiscal_day || t.created_at || '').slice(0, 10) === date); return l.length ? l.map((t) => t.created_at).sort().slice(-1)[0] : null; };
  const timeOf = (m) => m._type === 'IN' ? (m.checked_in_at || null) : m._type === 'OUT' ? (isDeparted(m) ? (m.checked_out_at || null) : null) : _txTimeFor(m);
  const typeLabel = (m) => m._type === 'IN' ? 'Check-In' : m._type === 'PAY' ? 'Payment' : (isDeparted(m) ? 'Check-Out' : 'Due Out');
  const typeTone = (m) => m._type === 'IN' ? 'green' : m._type === 'PAY' ? 'gold' : (isDeparted(m) ? 'teal' : 'amber');
  // Keep the attention/money rows, then sort chronologically by action time (nulls last) so staff
  // read today's sequence top-down. Indices keep `moves`/`moveColl` aligned through the sort.
  const _keptIdx = _moves.map((_, i) => i).filter((i) => _keep[i]).sort((a, b) => { const ta = timeOf(_moves[a]), tb = timeOf(_moves[b]); if (!ta && !tb) return 0; if (!ta) return 1; if (!tb) return -1; return new Date(ta) - new Date(tb); });
  const moves = _keptIdx.map((i) => _moves[i]);
  const moveColl = _keptIdx.map((i) => _movesColl[i]);
  const collected = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  // Due/Outstanding is ALWAYS the full live book (every reservation with a balance) — visible
  // on every day's report, not just guests who moved today.
  const allDue = outstandingList(res); // receivables only (CHECKED_IN/CHECKED_OUT) - owner decision 2026-06-12
  const totalDue = allDue.reduce((a, r) => a + dueOf(r), 0);
  const tok = parseInt(token || (closeRow && closeRow.opening_token) || '0', 10) || 0;
  const payout = parseInt(payouts || (closeRow && closeRow.payouts) || '0', 10) || 0;
  // Closing Balance = Opening Token (float) + Cash Collection − Payouts (owner spec 2026-06-24).
  // "Cash Collection" = the day's FULL collection — the sum of ALL payment methods (cash, bKash, card, …),
  // i.e. it equals Total Collection. No digital-method exclusion.
  const cashIn = collected;
  const closing = tok + cashIn - payout;
  // Payment-method split derived from the composite `type` (no payment_method column exists).
  const PM = [['Cash', /cash/i], ['bKash', /bkash/i], ['Nagad', /nagad/i], ['Card', /card/i], ['Bank', /bank|account|transfer/i]];
  const paySplit = txs.filter((t) => notBCF(t) && (t.fiscal_day || t.created_at || '').slice(0, 10) === date).reduce((acc, t) => { const hit = PM.find(([, re]) => re.test(t.type || '')); const k = hit ? hit[0] : 'Other'; acc[k] = (acc[k] || 0) + (Number(t.amount) || 0); return acc; }, {});

  // 3-bucket collection split for the on-screen cards (owner spec 2026-07-21): Cash / bKash /
  // Bank+Card. Cash absorbs Advance Payment + any un-tagged 'Other' so the three ALWAYS sum to
  // Total Collection. Bank/Card bucket = card + bank transfer.
  const pmBkash = paySplit.bKash || 0;
  const pmBankCard = (paySplit.Card || 0) + (paySplit.Bank || 0);
  const pmCash = Math.max(0, collected - pmBkash - pmBankCard);

  // Shared A4 print report — full day detail (used by BOTH the live and the closed-day Download).
  // Uses the day's own computed figures (collected/moves/paySplit/allDue), so a closed/historical
  // day prints that day's complete report, NOT the post-close "new activity" view.
  const renderPrint = (badgeText, o = {}) => {
    const _collected = o.collected ?? collected;
    const _tok = o.tok ?? tok;
    const _cashIn = o.cashIn ?? cashIn;
    const _payout = o.payout ?? payout;
    const _closing = o.closing ?? closing;
    return (
    <div id="print-report" aria-hidden="true">
      <div className="pr-head">
        <div className="pr-brand"><img className="pr-crest" src="/logo-crest.png" alt="Hotel Fountain" /><div><div className="pr-name">Hotel Fountain</div><div className="pr-sub">Management CRM · Powered by Lumea</div></div></div>
        <div className="pr-meta"><div>Daily Performance Report</div><div>Generated: {fmtLong(date)}</div><div className="pr-badge">{badgeText}</div></div>
      </div>
      <div className="pr-grid3">
        <div className="pr-card"><h4>Financial</h4>
          <div className="pr-row"><span>Total Collection</span><b>{bdt(_collected)}</b></div>
          <div className="pr-row"><span>Opening Token</span><b>{bdt(_tok)}</b></div>
          <div className="pr-row"><span>Cash Collected</span><b>{bdt(_cashIn)}</b></div>
          <div className="pr-row"><span>Payouts</span><b>{bdt(_payout)}</b></div>
          <div className="pr-row pr-tot"><span>Closing Balance</span><b>{bdt(_closing)}</b></div>
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
      <div className="pr-panel">
        <div className="pr-panel-h"><span className="pr-panel-t">Daily Movements</span><span className="pr-panel-s">{moves.length} movement{moves.length === 1 ? '' : 's'} · {bdt(_collected)} collected</span></div>
        <table className="pr-tbl">
          <thead><tr><th>Guest</th><th>Room</th><th>Type</th><th className="r">Collected</th><th className="r">Balance Due</th><th>Status</th></tr></thead>
          <tbody>
            {moves.map((m, i) => { const due = dueOf(m); return (
              <tr key={i}><td>{m.guest_name || 'Guest'}</td><td>{roomOf(m)}</td><td>{typeLabel(m)}{timeOf(m) ? <><br /><span style={{ fontSize: '0.82em', color: '#8a7d6a' }}>{fmtTime(timeOf(m))}</span></> : ''}</td><td className="r">{moveColl[i] > 0 ? bdt(moveColl[i]) : '—'}</td><td className="r">{due > 0 ? bdt(due) : '—'}</td><td>{due > 0 ? 'Balance Due' : 'Settled'}</td></tr>
            ); })}
          </tbody>
        </table>
      </div>
      <div className="pr-panel">
        <div className="pr-panel-h pr-panel-h--due"><span className="pr-panel-t">Outstanding Dues</span><span className="pr-panel-s">{allDue.length} reservation{allDue.length === 1 ? '' : 's'} · {bdt(totalDue)} due</span></div>
        <table className="pr-tbl">
          <thead><tr><th>Guest</th><th>Room</th><th>Status</th><th className="r">Balance Due</th></tr></thead>
          <tbody>
            {allDue.map((r, i) => (
              <tr key={i}><td>{r.guest_name || 'Guest'}</td><td>{roomOf(r)}</td><td>{r.status || '—'}</td><td className="r">{bdt(dueOf(r))}</td></tr>
            ))}
            <tr className="pr-tot-row"><td colSpan={3}>Total Outstanding</td><td className="r">{bdt(totalDue)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="pr-foot"><span>Hotel Fountain · Lumea CRM · /crm/reports</span><span>Generated {fmtLong(date)} · Page 1 of 1</span></div>
    </div>
    );
  };

  async function handleClose() {
    setErr('');
    const ok = window.confirm(`Close the day for ${fmtLong(date)}?\n\nThis snapshots today's figures and switches Reports to the post-close view (outstanding dues + new check-ins/outs + new collections recorded after now).`);
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/crm/close-day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audit_date: date, opening_token: tok, payouts: payout }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not close the day.');
      await onClosed();
      setPicked(nextDay(date)); // jump to the freshly-opened next business day
      setToken('');
      setPayouts('');
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
    const outstanding = outstandingList(res); // receivables only - shared helper
    const totalOutstanding = outstanding.reduce((a, r) => a + dueOf(r), 0);

    return (
      <>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          {Stepper}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="green">✓ Closed {fmtTime(closeRow.closed_at)} · {closeRow.closed_by || 'Staff'}</Badge>
            <input className="iv-input" type="number" placeholder={`Token ৳${+closeRow.opening_token || 0}`} value={token} onChange={(e) => setToken(e.target.value)} style={{ padding: '7px 10px', width: 120 }} />
            <input className="iv-input" type="number" placeholder={`Payouts ৳${+closeRow.payouts || 0}`} value={payouts} onChange={(e) => setPayouts(e.target.value)} style={{ padding: '7px 10px', width: 120 }} />
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
                  <td style={TD}><Badge tone={typeTone(m)}>{typeLabel(m)}</Badge></td>
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

                {/* ── PRINT-ONLY: full day-closing detail report (same template as the live report) ── */}
        {renderPrint('CLOSED · ' + fmtTime(closeRow.closed_at))}
        <style>{PRINT_CSS}</style>
      </>
    );
  }

  // ── LIVE (not-yet-closed) REPORT ───────────────────────────────────────────
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {Stepper}
        <div className="flex items-center gap-2 flex-wrap">
          <input className="iv-input" type="number" placeholder="Opening token ৳" value={token} onChange={(e) => setToken(e.target.value)} style={{ padding: '7px 10px', width: 150 }} />
          <input className="iv-input" type="number" placeholder="Payouts ৳" value={payouts} onChange={(e) => setPayouts(e.target.value)} style={{ padding: '7px 10px', width: 130 }} />
          <button className="iv-btn iv-btn--ghost" onClick={() => window.print()} style={{ fontSize: 12, padding: '7px 12px' }}>⬇ Download</button>
          <button className="iv-btn" onClick={handleClose} disabled={busy || loading} data-testid="close-day-submit" style={{ fontSize: 12, padding: '7px 12px' }}>{busy ? 'Closing…' : '✓ Closing Complete'}</button>
        </div>
      </div>
      {err && <div style={{ color: C.rose, fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <div className="iv-stat-grid iv-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label="Cash" value={loading ? '—' : bdt(pmCash)} accent={C.grn} sub="collected today" />
        <StatCard label="bKash" value={loading ? '—' : bdt(pmBkash)} accent={C.gold} sub="collected today" />
        <StatCard label="Bank / Card" value={loading ? '—' : bdt(pmBankCard)} accent={C.sky} sub="collected today" />
        <StatCard label="Total Collection" value={loading ? '—' : bdt(collected)} accent={C.gold} />
        <StatCard label="Closing Balance" value={loading ? '—' : bdt(closing)} accent={C.grn} sub="token + cash − payouts" />
        <StatCard label="Total Due" value={loading ? '—' : bdt(totalDue)} accent={C.rose} sub={`${allDue.length} reservation${allDue.length === 1 ? '' : 's'} outstanding`} />
        {(fb || []).length > 0 && <StatCard label="F&B (Restaurant)" value={bdt((fb || []).filter((o) => o.payment_status !== 'VOID').reduce((a, o) => a + (Number(o.grand_total_bdt) || 0), 0))} accent={C.gold} sub="restaurant sales today" />}
      </div>

      <Card title="Daily" titleAccent="Movements" bodyStyle={{ padding: 0 }}>
        <Table head={['Guest', 'Room', 'Type', 'Time', 'Collected', 'Balance', 'Status']}>
          {/* Skeleton rows reserve realistic height during load so the fill-in doesn't shift
              the cards below (Outstanding Dues / Closing Ledger) — fixes the /crm/reports CLS. */}
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <tr key={`skm${i}`} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
              <td colSpan={7} style={{ padding: '13px 12px' }}><div style={{ height: 12, borderRadius: 6, background: 'var(--iv-border2)', opacity: 0.5 }} /></td>
            </tr>
          ))}
          {!loading && moves.length === 0 && <tr><td colSpan={7} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No movements or collections on {fmtLong(date)}.</td></tr>}
          {moves.map((m, i) => {
            const due = dueOf(m);
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                <td style={TD}>{m.guest_name || 'Guest'}</td>
                <td style={TD}><Badge tone="blue">{roomOf(m)}</Badge></td>
                <td style={TD}><Badge tone={typeTone(m)}>{typeLabel(m)}</Badge></td>
                <td style={{ ...TD, ...MONO, color: C.ink3 }}>{timeOf(m) ? fmtTime(timeOf(m)) : '—'}</td>
                <td style={{ ...TD, ...MONO, color: moveColl[i] > 0 ? C.grn : C.ink3 }}>{moveColl[i] > 0 ? bdt(moveColl[i]) : '—'}</td>
                <td style={{ ...TD, ...MONO, color: due > 0 ? C.rose : C.ink3 }}>{due > 0 ? bdt(due) : '—'}</td>
                <td style={TD}>{due > 0 ? <Badge tone="amber">Balance Due</Badge> : <Badge tone="green">Settled</Badge>}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {/* Outstanding dues — always visible on every day's report (full live book) */}
      <Card title="Outstanding" titleAccent="Dues" accent={C.rose} bodyStyle={{ padding: 0 }}>
        <Table head={['Guest', 'Room', 'Status', 'Balance Due']}>
          {/* Loading skeleton (this table had none) — the 0→N-row jump was the main CLS driver. */}
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <tr key={`skd${i}`} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
              <td colSpan={4} style={{ padding: '13px 12px' }}><div style={{ height: 12, borderRadius: 6, background: 'var(--iv-border2)', opacity: 0.5 }} /></td>
            </tr>
          ))}
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

      <Card title="Closing" titleAccent="Ledger" accent={C.gold}>
        <FRow label="Opening Token / Float" value={bdt(tok)} />
        <FRow label="Add — Cash Collected" value={'+ ' + bdt(cashIn)} />
        <FRow label="Less — Payouts" value={'− ' + bdt(payout)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, fontFamily: 'var(--iv-head)', paddingTop: 8 }}>
          <span>Closing Balance</span><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(closing)}</span>
        </div>
        <div style={{ fontSize: 10, color: C.ink3, marginTop: 6, fontStyle: 'italic' }}>Closing Balance = Opening Token + Cash Collection − Payouts. Cash Collection = the full day’s collection (sum of all payment methods, = Total Collection). Collections accrue to this open day until “Closing Complete” locks it and opens the next. Outstanding dues carry across every day.</div>
      </Card>

            {/* ── PRINT-ONLY: one-page A4 day report (Download → window.print) ── */}
      {renderPrint(onOpenDay ? 'LIVE — OPEN DAY' : 'HISTORICAL')}
      <style>{PRINT_CSS}</style>
    </>
  );
}

const REV_CSS = `
.rev-chart{position:relative;padding:14px 0 0 48px}
.rev-plot{position:relative;height:165px}
.rev-gl{position:absolute;left:0;right:0;border-top:1px dashed var(--iv-border2)}
.rev-gl>span{position:absolute;left:-48px;top:-6px;width:42px;text-align:right;font:600 8px var(--iv-mono,monospace);color:var(--iv-ink3)}
.rev-bars{position:absolute;inset:0;display:flex;align-items:flex-end;gap:var(--rev-gap,4px);z-index:1}
.rev-col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.rev-bar{width:80%;max-width:26px;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#EAFF7A,#B8D62E);transition:filter .15s ease}
.rev-bar--gold{background:linear-gradient(180deg,#F4FFA6,#DFFF45);box-shadow:0 0 0 1px rgba(223,255,69,.3)}
.rev-col:hover .rev-bar{filter:brightness(1.1)}
.rev-val{font:600 8px var(--iv-mono,monospace);color:var(--iv-gold2,#6B4E0A);margin-bottom:3px;white-space:nowrap}
.rev-xlabels{display:flex;gap:var(--rev-gap,4px);padding-left:48px;margin-top:6px}
.rev-xlabels>span{flex:1;text-align:center;font:8px var(--iv-mono,monospace);color:var(--iv-ink3)}
`;

const revK = (v) => v >= 1000 ? '৳' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : '৳' + (v || 0);

function RevBars({ bars, gap, showValues }) {
  const max = Math.max(1, ...bars.map((b) => b.v));
  const H = 150, ticks = 4;
  return (
    <>
      <style>{REV_CSS}</style>
      <div className="rev-chart" style={{ '--rev-gap': (gap || 4) + 'px' }}>
        <div className="rev-plot">
          {Array.from({ length: ticks + 1 }).map((_, i) => (
            <div className="rev-gl" key={i} style={{ top: `${(i / ticks) * 100}%` }}><span>{revK(Math.round(max * (1 - i / ticks)))}</span></div>
          ))}
          <div className="rev-bars">
            {bars.map((b, i) => {
              const h = b.v > 0 ? Math.max(2, Math.round((b.v / max) * H)) : 0;
              const gold = b.v > 0 && b.v === max;
              return (
                <div className="rev-col" key={i} title={`${b.lbl} · ${bdt(b.v)}`}>
                  {showValues && b.v > 0 ? <span className="rev-val">{revK(b.v)}</span> : null}
                  <div className={'rev-bar' + (gold ? ' rev-bar--gold' : '')} style={{ height: h }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="rev-xlabels">{bars.map((b, i) => <span key={i}>{b.lbl}</span>)}</div>
      </div>
    </>
  );
}

// Branded, printable revenue report (Monthly / Yearly). Reuses PRINT_CSS (#print-report).
function RevReportPrint({ kind, periodLabel, rows, total }) {
  const active = rows.filter((r) => r.v > 0);
  const peak = rows.reduce((a, r) => (r.v > a.v ? r : a), { v: 0, lbl: '—' });
  const avg = active.length ? Math.round(total / active.length) : 0;
  const unit = kind === 'Monthly' ? 'Day' : 'Month';
  return (
    <>
      <div id="print-report" aria-hidden="true">
        <div className="pr-head">
          <div className="pr-brand"><img className="pr-crest" src="/logo-crest.png" alt="Hotel Fountain" /><div><div className="pr-name">Hotel Fountain</div><div className="pr-sub">Management CRM · Powered by Lumea</div></div></div>
          <div className="pr-meta"><div>{kind} Revenue Report</div><div>Generated: {periodLabel}</div><div className="pr-badge">{kind.toUpperCase()}</div></div>
        </div>
        <div className="pr-grid3">
          <div className="pr-card"><h4>Summary</h4>
            <div className="pr-row"><span>Total Revenue</span><b>{bdt(total)}</b></div>
            <div className="pr-row"><span>Active {unit.toLowerCase()}s</span><b>{active.length}</b></div>
            <div className="pr-row pr-tot"><span>Avg / active {unit.toLowerCase()}</span><b>{bdt(avg)}</b></div>
          </div>
          <div className="pr-card"><h4>Peak {unit}</h4>
            <div className="pr-row"><span>{unit}</span><b>{peak.lbl}</b></div>
            <div className="pr-row pr-tot"><span>Revenue</span><b className="pr-due">{bdt(peak.v)}</b></div>
          </div>
          <div className="pr-card"><h4>Scope</h4>
            <div className="pr-row"><span>Report</span><b>{kind}</b></div>
            <div className="pr-row"><span>Period</span><b>{periodLabel}</b></div>
          </div>
        </div>
        <div className="pr-panel">
          <div className="pr-panel-h"><span className="pr-panel-t">{kind} Breakdown</span><span className="pr-panel-s">{active.length} active {unit.toLowerCase()}s · {bdt(total)}</span></div>
          <table className="pr-tbl">
            <thead><tr><th>{unit}</th><th className="r">Revenue</th><th className="r">Share</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{r.lbl}</td><td className="r">{r.v > 0 ? bdt(r.v) : '—'}</td><td className="r">{total > 0 && r.v > 0 ? ((r.v / total) * 100).toFixed(1) + '%' : '—'}</td></tr>
              ))}
              <tr className="pr-tot-row"><td>Total</td><td className="r">{bdt(total)}</td><td className="r">100%</td></tr>
            </tbody>
          </table>
        </div>
        <div className="pr-foot"><span>Hotel Fountain · Lumea CRM · /crm/reports</span><span>Generated {periodLabel}</span></div>
      </div>
      <style>{PRINT_CSS}</style>
    </>
  );
}

function Monthly({ txs }) {
  const [month, setMonth] = useState(dhakaToday().slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  // PERF: sum revenue by fiscal-day ONCE (was O(days×txs) — a full txs scan per day of the month).
  const byDay = useMemo(() => {
    const acc = new Map();
    for (const t of txs) { if (!notBCF(t)) continue; const d = (t.fiscal_day || t.created_at || '').slice(0, 10); if (!d) continue; acc.set(d, (acc.get(d) || 0) + (Number(t.amount) || 0)); }
    return acc;
  }, [txs]);
  const bars = Array.from({ length: days }, (_, i) => {
    const ds = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { v: byDay.get(ds) || 0, lbl: String(i + 1) };
  });
  const total = bars.reduce((a, b) => a + b.v, 0);
  const periodLabel = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return (
    <>
      <Card title="Monthly" titleAccent="Revenue" accent={C.gold} action={
        <div className="flex items-center gap-2">
          <input type="month" className="iv-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '6px 10px', width: 160 }} />
          <button className="iv-btn iv-btn--ghost" onClick={() => window.print()} style={{ fontSize: 12, padding: '7px 12px' }}>⬇ Download</button>
        </div>
      }>
        <RevBars bars={bars} gap={3} showValues={false} />
        <div className="flex justify-between" style={{ fontSize: 11, color: 'var(--iv-ink3)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--iv-border2)' }}>
          <span>Month total</span><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(total)}</span>
        </div>
      </Card>
      <RevReportPrint kind="Monthly" periodLabel={periodLabel} rows={bars} total={total} />
    </>
  );
}

function Yearly({ txs }) {
  const [year, setYear] = useState(() => dhakaToday().slice(0, 4));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // PERF: sum revenue by fiscal-month ONCE (was O(12×txs) — a full txs scan per month).
  const byMonth = useMemo(() => {
    const acc = new Map();
    for (const t of txs) { if (!notBCF(t)) continue; const mm = (t.fiscal_day || t.created_at || '').slice(0, 7); if (!mm) continue; acc.set(mm, (acc.get(mm) || 0) + (Number(t.amount) || 0)); }
    return acc;
  }, [txs]);
  const bars = MONTHS.map((ml, i) => {
    const mm = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { v: byMonth.get(mm) || 0, lbl: ml };
  });
  const total = bars.reduce((a, b) => a + b.v, 0);
  return (
    <>
      <Card title="Yearly" titleAccent="Revenue" accent={C.gold} action={
        <div className="flex items-center gap-2">
          <input className="iv-input" type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ padding: '6px 10px', width: 110 }} />
          <button className="iv-btn iv-btn--ghost" onClick={() => window.print()} style={{ fontSize: 12, padding: '7px 12px' }}>⬇ Download</button>
        </div>
      }>
        <RevBars bars={bars} gap={8} showValues />
        <div className="flex justify-between" style={{ fontSize: 11, color: 'var(--iv-ink3)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--iv-border2)' }}>
          <span>Year total</span><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(total)}</span>
        </div>
      </Card>
      <RevReportPrint kind="Yearly" periodLabel={String(year)} rows={bars} total={total} />
    </>
  );
}
