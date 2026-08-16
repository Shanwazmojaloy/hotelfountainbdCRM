'use client';

// Growth — Hotel Growth OS sales pipeline (added 2026-08-16).
//
// This is OUR commercial pipeline, not hotel operations: prospect hotels we are selling the
// system to. It reads a SEPARATE Supabase project via /api/growth (owner/admin only), so a
// bug here can never touch guest data.
//
// PERF CONTRACT: no timers, no polling, no COUNT queries on mount. This project lives on
// Vercel Hobby and Fluid Active CPU is the binding constraint — every fetch below is a user
// action or an explicit Refresh. Do not add a setInterval to this file.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthGate';

const TAKA = '৳';
const money = (n) => `${TAKA}${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// BD numbers arrive as +8801XXXXXXXXX / 01XXXXXXXXX / 8801XXXXXXXXX. wa.me wants digits only.
function waNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('880')) return d.length === 13 ? d : null;
  if (d.startsWith('0')) return d.length === 11 ? '88' + d : null;
  if (d.length === 10) return '880' + d;
  return null;
}

// ── WhatsApp first-touch opener ──────────────────────────────────────────────
// Edit the copy HERE, not in the JSX. Mirrors the voice of cold-email step 1 but
// shorter, because WhatsApp is not email. Greeting is deliberately neutral: the
// list includes Bandarban/Rangamati properties, so do not assume a religion.
// Swap GREETING to 'Assalamu alaikum' if you prefer it for a given region.
const WA_GREETING = 'Hello';
const WA_SITE = 'growthos.fountainbd.com';

function waOpener(p) {
  const hotel = p?.hotel_name || 'your hotel';
  // Only name the city if we actually know it — "hotels in Bangladesh asked us"
  // reads like a mail-merge, which is exactly what we are trying not to sound like.
  const nearby = p?.city ? ` in ${p.city}` : '';
  return [
    `${WA_GREETING} — I'm Shan from Hotel Fountain, a 24-room hotel in Dhaka.`,
    '',
    `We got tired of running our front desk across two registers, so we built our own system for it — reservations, check-in, housekeeping and the guest ledger in one place. A few hotels${nearby} asked if they could use it, so we are opening a small pilot.`,
    '',
    `Would 15 minutes be useful for ${hotel}? I would show you the live system, not slides.`,
    '',
    WA_SITE,
  ].join('\n');
}

// opener:true prefills the first-touch pitch; otherwise a blank chat for follow-ups.
function waLink(p, { opener = false } = {}) {
  const n = waNumber(p?.whatsapp || p?.phone);
  if (!n) return null;
  return opener ? `https://wa.me/${n}?text=${encodeURIComponent(waOpener(p))}` : `https://wa.me/${n}`;
}

const STATUS_LABEL = {
  new: 'New', researching: 'Researching', contacted: 'Contacted', replied: 'Replied',
  demo_booked: 'Demo booked', demo_done: 'Demo done', proposal_sent: 'Proposal sent',
  negotiating: 'Negotiating', won: 'Won', lost: 'Lost', unqualified: 'Unqualified',
};
// The columns that represent live work, in the order a deal actually moves.
const BOARD_ORDER = ['new', 'researching', 'contacted', 'replied', 'demo_booked', 'demo_done', 'proposal_sent', 'negotiating'];

// One-tap dispositions. Each writes an activity; the DB trigger moves the prospect's status
// and stamps last_contact_at — the client never patches status for a logged touch.
const QUICK = [
  { key: 'call_connected', label: 'Called — spoke', type: 'call', outcome: 'connected', days: 3 },
  { key: 'call_no_answer', label: 'Called — no answer', type: 'call', outcome: 'no_answer', days: 2 },
  { key: 'wa_sent', label: 'WhatsApp sent', type: 'whatsapp', outcome: 'sent', days: 4 },
  { key: 'email_sent', label: 'Email sent', type: 'email', outcome: 'sent', days: 5 },
  { key: 'interested', label: 'Interested', type: 'call', outcome: 'interested', days: 2 },
  { key: 'demo_done', label: 'Demo delivered', type: 'demo', outcome: 'connected', days: 3 },
  { key: 'not_interested', label: 'Not interested', type: 'call', outcome: 'not_interested', days: null },
  { key: 'inbound', label: 'They replied', type: 'note', outcome: 'replied', days: 1, direction: 'inbound' },
];

const inDays = (n) => {
  if (n == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function Growth() {
  const { user } = useAuth();
  const [tab, setTab] = useState('queue');
  const [kpis, setKpis] = useState(null);
  const [summary, setSummary] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState(null);
  const [filters, setFilters] = useState({ q: '', city: '', status: '' });

  const loadKpis = useCallback(async () => {
    try {
      const r = await fetch('/api/growth?view=kpis', { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load KPIs.');
      setKpis(j.kpis); setSummary(j.summary || []);
    } catch (e) { setErr(e.message); }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      let url = '/api/growth?view=queue';
      if (tab === 'board') url = '/api/growth?view=board';
      if (tab === 'all') {
        const p = new URLSearchParams({ view: 'list' });
        if (filters.q) p.set('q', filters.q);
        if (filters.city) p.set('city', filters.city);
        if (filters.status) p.set('status', filters.status);
        url = `/api/growth?${p}`;
      }
      const r = await fetch(url, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load prospects.');
      setRows(j.rows || []);
    } catch (e) { setErr(e.message || 'Could not load prospects.'); }
    finally { setLoading(false); }
  }, [tab, filters]);

  useEffect(() => { loadKpis(); }, [loadKpis]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const cities = useMemo(
    () => Array.from(new Set(rows.map((r) => r.city).filter(Boolean))).sort(),
    [rows],
  );

  const refreshAll = () => { loadKpis(); loadRows(); };

  const overdue = useMemo(() => rows.filter((r) => r.due_bucket === 'overdue').length, [rows]);
  const today = useMemo(() => rows.filter((r) => r.due_bucket === 'today').length, [rows]);

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>

      {/* ── KPI header ─────────────────────────────────────────────── */}
      <div className="iv-card" style={{ padding: '1.75rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div className="iv-eyebrow">Hotel Growth OS</div>
            <h2 style={{ margin: '.15rem 0 0' }}>Sales pipeline</h2>
            <p style={{ margin: '.35rem 0 0', opacity: .7, fontSize: '.9rem' }}>
              Week starting {kpis?.week_start ? fmtDate(kpis.week_start) : '—'}. Everything here is our own
              prospect list — no guest data.
            </p>
          </div>
          <button className="iv-btn iv-btn--ghost" onClick={refreshAll}>Refresh</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '1.25rem', marginTop: '1.5rem' }}>
          <Kpi label="New leads" value={kpis?.new_leads} target={100} />
          <Kpi label="Calls" value={kpis?.calls} target={50} />
          <Kpi label="WhatsApps" value={kpis?.whatsapps} target={50} />
          <Kpi label="Emails" value={kpis?.emails} target={100} />
          <Kpi label="Demos" value={kpis?.demos} target={10} />
          <Kpi label="Proposals" value={kpis?.proposals} target={5} />
          <Kpi label="Live MRR" value={money(kpis?.live_mrr_bdt)} raw />
          <Kpi label="Weighted pipeline" value={money(kpis?.weighted_pipeline_mrr_bdt)} raw />
        </div>
        {summary.length > 0 && (
          <p style={{ margin: '1.25rem 0 0', fontSize: '.78rem', opacity: .6 }}>
            Weighted pipeline = sum of open deals × their probability. It is a forecast, not revenue.
          </p>
        )}
      </div>

      {/* ── tabs ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          ['queue', `Today${overdue + today ? ` (${overdue + today})` : ''}`],
          ['board', 'Pipeline'],
          ['all', 'All prospects'],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`iv-btn ${tab === k ? '' : 'iv-btn--ghost'}`}
            onClick={() => { setTab(k); setOpenId(null); }}
          >{label}</button>
        ))}
        {tab === 'all' && (
          <>
            <input
              className="fi" placeholder="Search hotel name…" value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              style={{ maxWidth: 220, padding: '9px 12px', borderRadius: 8 }}
            />
            <select
              className="fi" value={filters.city}
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
              style={{ maxWidth: 170, padding: '9px 12px', borderRadius: 8 }}
            >
              <option value="">All cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              className="fi" value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              style={{ maxWidth: 170, padding: '9px 12px', borderRadius: 8 }}
            >
              <option value="">Any status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </>
        )}
      </div>

      {err && <div className="iv-card" style={{ padding: '1rem 1.5rem', borderColor: '#D97706' }}>{err}</div>}

      {loading ? (
        <div className="iv-card" style={{ padding: '2rem', opacity: .7 }}>Loading…</div>
      ) : tab === 'board' ? (
        <Board rows={rows} onOpen={setOpenId} />
      ) : (
        <Table rows={rows} showDue={tab === 'queue'} onOpen={setOpenId} />
      )}

      {openId && (
        <Detail
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refreshAll}
          actor={user?.name || 'staff'}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, target, raw }) {
  const n = raw ? null : Number(value || 0);
  const hit = target != null && n != null && n >= target;
  return (
    <div>
      <div className="iv-stat__lbl">{label}</div>
      <div className="iv-stat__val" style={{ fontSize: raw ? 20 : 29 }}>{raw ? value : (n ?? 0)}</div>
      {target != null && (
        <div className="iv-stat__sub" style={{ color: hit ? 'var(--iv-in-fg)' : undefined }}>
          {hit ? 'target met' : `target ${target}/wk`}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const cls = status === 'won' ? 'iv-badge--in'
    : status === 'lost' || status === 'unqualified' ? ''
      : ['replied', 'demo_booked', 'demo_done', 'proposal_sent', 'negotiating'].includes(status) ? 'iv-badge--due'
        : '';
  return <span className={`iv-badge ${cls}`}>{STATUS_LABEL[status] || status}</span>;
}

function Board({ rows, onOpen }) {
  const cols = BOARD_ORDER.map((s) => ({ status: s, items: rows.filter((r) => r.status === s) }))
    .filter((c) => c.items.length > 0);
  if (!cols.length) return <div className="iv-card" style={{ padding: '2rem', opacity: .7 }}>No open prospects.</div>;
  return (
    <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(230px,1fr)', gap: '1rem', overflowX: 'auto', paddingBottom: '.5rem' }}>
      {cols.map((c) => (
        <div key={c.status} className="iv-card" style={{ padding: '1rem', alignSelf: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
            <span className="iv-eyebrow">{STATUS_LABEL[c.status]}</span>
            <span className="iv-mono" style={{ fontSize: 12, opacity: .6 }}>{c.items.length}</span>
          </div>
          <div style={{ display: 'grid', gap: '.5rem', maxHeight: 460, overflowY: 'auto' }}>
            {c.items.map((r) => (
              <button
                key={r.id} onClick={() => onOpen(r.id)}
                style={{
                  textAlign: 'left', background: 'var(--iv-sunken)', border: '1px solid var(--iv-border)',
                  borderRadius: 8, padding: '.6rem .7rem', cursor: 'pointer', font: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{r.hotel_name}</div>
                <div style={{ fontSize: '.75rem', opacity: .65, marginTop: 2 }}>
                  {r.city}{r.rooms ? ` · ${r.rooms} rooms` : ''} · <span className="iv-mono">{r.score}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Table({ rows, showDue, onOpen }) {
  if (!rows.length) {
    return (
      <div className="iv-card" style={{ padding: '2rem', opacity: .7 }}>
        {showDue ? 'Nothing due today. Open Pipeline to pull work forward.' : 'No prospects match these filters.'}
      </div>
    );
  }
  const th = { padding: '.9rem 1.1rem', textAlign: 'left', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .6, fontWeight: 500 };
  const td = { padding: '.85rem 1.1rem', verticalAlign: 'middle' };
  return (
    <div className="iv-card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
        <thead>
          <tr>
            <th style={th}>Hotel</th>
            <th style={th}>City</th>
            <th style={th}>Rooms</th>
            <th style={th}>Contact</th>
            <th style={th}>Status</th>
            {showDue && <th style={th}>Due</th>}
            <th style={th}>Score</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // Cold list → prefill the opener, so a touch is tap-review-send, not retype.
            const wa = waLink(r, { opener: r.status === 'new' || r.status === 'researching' });
            return (
              <tr key={r.id} style={{ borderTop: '1px solid var(--iv-border)' }}>
                <td style={{ ...td, fontWeight: 600 }}>{r.hotel_name}</td>
                <td style={td}>{r.city}{r.area ? <span style={{ opacity: .55 }}> · {r.area}</span> : null}</td>
                <td style={{ ...td, fontFamily: 'var(--iv-mono)' }}>{r.rooms || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {r.phone ? <a href={`tel:${r.phone}`} className="iv-mono" style={{ fontSize: '.82rem' }}>{r.phone}</a> : <span style={{ opacity: .45 }}>no number</span>}
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontSize: '.78rem' }}>WA</a>}
                  {r.email && <a href={`mailto:${r.email}`} style={{ marginLeft: 8, fontSize: '.78rem' }}>mail</a>}
                </td>
                <td style={td}><StatusBadge status={r.status} /></td>
                {showDue && (
                  <td style={{ ...td, whiteSpace: 'nowrap', color: r.due_bucket === 'overdue' ? 'var(--iv-rose-fg)' : undefined }}>
                    {fmtDate(r.next_follow_up_at)}{r.due_bucket === 'overdue' ? ' · overdue' : ''}
                  </td>
                )}
                <td style={{ ...td, fontFamily: 'var(--iv-mono)' }}>{r.score}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button className="iv-btn iv-btn--ghost" onClick={() => onOpen(r.id)}>Open</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ id, onClose, onChanged, actor }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [dealPlan, setDealPlan] = useState('growth');

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch(`/api/growth?view=prospect&id=${encodeURIComponent(id)}`, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load prospect.');
      setData(j);
    } catch (e) { setErr(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function post(payload, tag) {
    setBusy(tag); setErr('');
    try {
      const r = await fetch('/api/growth', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, prospect_id: id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save.');
      await load(); onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  const p = data?.prospect;
  const wa = waLink(p);                          // blank chat — for a conversation already running
  const waPitch = waLink(p, { opener: true });   // prefilled opener — for a first touch

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px,100%)', background: 'var(--iv-card)', height: '100%', overflowY: 'auto',
          padding: '2rem', borderLeft: '1px solid var(--iv-border)',
          animation: 'ivFade .22s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {!p ? (
          <div style={{ opacity: .7 }}>{err || 'Loading…'}</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>{p.hotel_name}</h3>
                <p style={{ margin: '.3rem 0 0', fontSize: '.85rem', opacity: .7 }}>
                  {[p.area, p.city, p.rooms ? `${p.rooms} rooms` : null, p.category].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button className="iv-btn iv-btn--ghost" onClick={onClose}>Close</button>
            </div>

            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
              <StatusBadge status={p.status} />
              <span className="iv-badge">score {p.score}</span>
              {p.do_not_contact && <span className="iv-badge iv-badge--due">do not contact</span>}
            </div>

            <div style={{ display: 'grid', gap: '.4rem', fontSize: '.88rem', marginBottom: '1.5rem' }}>
              <Field label="Phone">{p.phone ? <a href={`tel:${p.phone}`} className="iv-mono">{p.phone}</a> : '—'}</Field>
              <Field label="WhatsApp">
                {wa ? (
                  <>
                    <a href={wa} target="_blank" rel="noopener noreferrer">open chat</a>
                    <span style={{ opacity: .35 }}> · </span>
                    <a href={waPitch} target="_blank" rel="noopener noreferrer">send opener</a>
                  </>
                ) : '—'}
              </Field>
              <Field label="Email">{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : '—'}</Field>
              <Field label="Website">{p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, '')}</a> : '—'}</Field>
              <Field label="Owner">{p.owner_name || <span style={{ opacity: .5 }}>unknown — ask on the call</span>}</Field>
              <Field label="Last contact">{fmtDateTime(p.last_contact_at)}</Field>
              <Field label="Next follow-up">{fmtDateTime(p.next_follow_up_at)}</Field>
              <Field label="Source">{p.source || '—'}</Field>
            </div>

            <div className="iv-eyebrow" style={{ marginBottom: '.6rem' }}>Log a touch</div>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {QUICK.map((q) => (
                <button
                  key={q.key} className="iv-btn iv-btn--ghost" disabled={!!busy}
                  style={{ fontSize: 12, padding: '7px 11px' }}
                  onClick={() => post({
                    action: 'log', type: q.type, outcome: q.outcome,
                    direction: q.direction || 'outbound',
                    subject: q.label, body: note || null,
                    next_follow_up_at: inDays(q.days),
                  }, q.key)}
                >{busy === q.key ? '…' : q.label}</button>
              ))}
            </div>
            <textarea
              className="fi" rows={2} placeholder="Note for this touch (optional)"
              value={note} onChange={(e) => setNote(e.target.value)}
              style={{ borderRadius: 8, marginBottom: '1.5rem' }}
            />

            <div className="iv-eyebrow" style={{ marginBottom: '.6rem' }}>Move the deal</div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
              <select className="fi" value={dealPlan} onChange={(e) => setDealPlan(e.target.value)} style={{ maxWidth: 150, padding: '9px 12px', borderRadius: 8 }}>
                <option value="starter">Starter — {money(5000)}</option>
                <option value="growth">Growth — {money(15000)}</option>
                <option value="managed">Managed — {money(30000)}</option>
              </select>
              <button
                className="iv-btn" disabled={!!busy}
                onClick={() => post({
                  action: 'deal', plan: dealPlan, stage: 'proposal',
                  mrr_bdt: { starter: 5000, growth: 15000, managed: 30000 }[dealPlan],
                  setup_fee_bdt: 20000, probability: 30,
                }, 'deal')}
              >{busy === 'deal' ? 'Saving…' : 'Create proposal'}</button>
              <button className="iv-btn iv-btn--ghost" disabled={!!busy} onClick={() => post({ action: 'update', status: 'unqualified' }, 'dq')}>
                Disqualify
              </button>
            </div>

            {data.deals.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                {data.deals.map((d) => (
                  <div key={d.id} className="iv-row" style={{ marginBottom: '.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{d.plan} · {d.stage}</div>
                      <div style={{ fontSize: '.78rem', opacity: .65 }}>
                        <span className="iv-mono">{money(d.mrr_bdt)}</span>/mo + <span className="iv-mono">{money(d.setup_fee_bdt)}</span> setup · {d.probability}%
                      </div>
                    </div>
                    {d.stage !== 'won' && d.stage !== 'lost' && (
                      <div style={{ display: 'flex', gap: '.4rem' }}>
                        <button className="iv-btn" style={{ fontSize: 12, padding: '6px 10px' }} disabled={!!busy}
                          onClick={() => post({ action: 'deal', deal_id: d.id, stage: 'won' }, 'w' + d.id)}>Won</button>
                        <button className="iv-btn iv-btn--danger" style={{ fontSize: 12, padding: '6px 10px' }} disabled={!!busy}
                          onClick={() => post({ action: 'deal', deal_id: d.id, stage: 'lost' }, 'l' + d.id)}>Lost</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {err && <div className="iv-card" style={{ padding: '.75rem 1rem', borderColor: '#D97706', marginBottom: '1rem' }}>{err}</div>}

            <div className="iv-eyebrow" style={{ marginBottom: '.6rem' }}>History</div>
            {data.activities.length === 0 ? (
              <p style={{ fontSize: '.85rem', opacity: .6 }}>No touches logged yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '.5rem' }}>
                {data.activities.map((a) => (
                  <div key={a.id} style={{ borderLeft: '2px solid var(--iv-gold-light)', paddingLeft: '.8rem' }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 600 }}>
                      {a.subject || a.type}{a.direction === 'inbound' ? ' · inbound' : ''}
                    </div>
                    <div style={{ fontSize: '.74rem', opacity: .6 }}>{fmtDateTime(a.occurred_at)}</div>
                    {a.body && <div style={{ fontSize: '.82rem', opacity: .8, marginTop: 2 }}>{a.body}</div>}
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: '.75rem', opacity: .55, marginTop: '1.5rem' }}>
              Logging a touch moves the status automatically. Signed in as {actor}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: '.75rem' }}>
      <span style={{ minWidth: 110, opacity: .55, fontSize: '.8rem' }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}
