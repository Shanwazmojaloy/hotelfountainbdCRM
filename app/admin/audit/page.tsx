// ─────────────────────────────────────────────────────────────────────────────
// Lumea — /admin/audit
//
// Browser-accessible Audit Log viewer for owner/manager. Authenticates by
// pasting ADMIN_SECRET once per session (stored in sessionStorage, scrubbed
// when the tab closes). All data fetched from /api/admin/logs.
//
// Routing: this page lives at /admin/audit on every Lumea tenant subdomain
// AND on the marketing root domain. The page itself is host-agnostic — it
// just talks to /api/admin/logs relative to whichever host serves it.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';

export const dynamic = 'force-dynamic';

type AuditRow = {
  id:            string;
  ts:            string;
  tenant_id:     string | null;
  request_id:    string | null;
  event_type:    string;
  user_id:       string | null;
  role:          string | null;
  action_target: string | null;
  status_code:   number | null;
  result:        'success' | 'failure' | 'partial' | 'denied';
  duration_ms:   number | null;
  ip:            string | null;
  user_agent:    string | null;
  payload_summary: Record<string, unknown> | null;
  error:         string | null;
};

type WindowKey = '1h' | '24h' | '7d' | '30d' | 'all';

const SECRET_KEY  = 'lumea-admin-secret';
const FILTERS_KEY = 'lumea-audit-filters-v1';

function windowToSince(w: WindowKey): string | null {
  if (w === 'all') return null;
  const ms = { '1h': 36e5, '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 }[w];
  return new Date(Date.now() - ms).toISOString();
}

function fmtTs(ts: string) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function fmtFullTs(ts: string) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
function statusClass(code: number | null) {
  if (code == null) return '';
  if (code >= 500) return 'status-5xx';
  if (code >= 400) return 'status-4xx';
  if (code >= 200) return 'status-2xx';
  return '';
}


// ── Humanize event for the Stream view ────────────────────────────────────────
function humanize(r: AuditRow): { icon: string; headline: string; subline: string; tone: 'success' | 'failure' | 'denied' | 'partial' | 'info' | 'money' } {
  const p: Record<string, unknown> = (r.payload_summary ?? {}) as Record<string, unknown>;
  const fmtMoney = (v: unknown) => typeof v === 'number' ? '৳' + v.toLocaleString('en-IN') : String(v ?? '');
  const tone: 'success' | 'failure' | 'denied' | 'partial' | 'info' | 'money' =
    r.result === 'failure' ? 'failure'
    : r.result === 'denied' ? 'denied'
    : r.result === 'partial' ? 'partial' : 'info';

  // db_<table>_<op>
  if (r.event_type.startsWith('db_')) {
    const m = r.event_type.match(/^db_(.+)_(insert|update|delete)$/);
    const table = m?.[1] ?? '';
    const op    = m?.[2] ?? '';
    const changed = (p.changed ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
    const newRow  = (p.new     ?? {}) as Record<string, unknown>;
    const target  = (r.action_target ?? '').split(':').slice(1).join(':');

    if (table === 'reservations') {
      if (op === 'insert') return { icon: '🛌', headline: 'New reservation created', subline: `${newRow.guest_name ?? 'Guest'} · Room ${newRow.room_number ?? '?'}`, tone: 'info' };
      if (op === 'update') {
        const keys = Object.keys(changed);
        if (keys.includes('status')) {
          return { icon: '🔄', headline: `Reservation status → ${changed.status.to}`, subline: `was ${changed.status.from} · ${target.slice(0,8)}`, tone: 'info' };
        }
        if (keys.includes('paid_amount')) {
          return { icon: '💰', headline: `Payment recorded: ${fmtMoney(changed.paid_amount.to)}`, subline: `was ${fmtMoney(changed.paid_amount.from)} · reservation ${target.slice(0,8)}`, tone: 'money' };
        }
        if (keys.includes('total_amount')) {
          return { icon: '📝', headline: `Reservation total updated: ${fmtMoney(changed.total_amount.to)}`, subline: `was ${fmtMoney(changed.total_amount.from)}`, tone: 'info' };
        }
        return { icon: '✏️', headline: 'Reservation edited', subline: `Changed: ${keys.join(', ')}`, tone: 'info' };
      }
      if (op === 'delete') return { icon: '🗑️', headline: 'Reservation deleted', subline: target, tone: 'failure' };
    }

    if (table === 'rooms' && op === 'update' && changed.status) {
      const to = String(changed.status.to);
      const icon = to === 'OCCUPIED' ? '🛏️' : to === 'AVAILABLE' ? '✨' : to === 'CHECKOUT_CLEAN' ? '🧹' : '🔄';
      return { icon, headline: `Room → ${to}`, subline: `was ${changed.status.from}`, tone: 'info' };
    }

    if (table === 'payment_transactions' && op === 'insert') {
      return { icon: '💵', headline: `${newRow.notes ?? 'Payment'}: ${fmtMoney(newRow.amount)}`, subline: `${newRow.method ?? ''} · ${target.slice(0,8)}`, tone: 'money' };
    }
    if (table === 'transactions' && op === 'insert') {
      return { icon: '💵', headline: `${newRow.type ?? 'Transaction'}: ${fmtMoney(newRow.amount)}`, subline: `${newRow.method ?? ''}`, tone: 'money' };
    }

    if (table === 'folios' && op === 'insert') {
      return { icon: '📃', headline: `Folio added: ${fmtMoney(newRow.amount)}`, subline: `${newRow.category ?? ''} · ${newRow.description ?? ''}`, tone: 'money' };
    }
    if (table === 'guest_ledger' && op === 'insert') {
      return { icon: '📒', headline: 'Guest ledger entry', subline: `${newRow.description ?? ''}`, tone: 'info' };
    }
    if (table === 'guests' && op === 'insert') {
      return { icon: '👤', headline: `Guest added: ${newRow.guest_name ?? newRow.name ?? 'New guest'}`, subline: String(newRow.phone ?? newRow.email ?? ''), tone: 'info' };
    }
    if (table === 'guests' && op === 'update') {
      const keys = Object.keys(changed);
      return { icon: '✏️', headline: 'Guest profile updated', subline: `Changed: ${keys.join(', ')}`, tone: 'info' };
    }

    if (table === 'staff') {
      if (op === 'insert') return { icon: '👥', headline: `Staff added: ${newRow.name ?? newRow.email}`, subline: String(newRow.role ?? ''), tone: 'info' };
      if (op === 'update' && changed.session_v) return { icon: '🔑', headline: 'Staff login (new session)', subline: target, tone: 'info' };
    }

    if (table === 'housekeeping_tasks' && op === 'update' && changed.status) {
      return { icon: '🧹', headline: `Housekeeping → ${changed.status.to}`, subline: `was ${changed.status.from}`, tone: 'info' };
    }

    if (table === 'b2b_bookings' && op === 'insert') return { icon: '🏢', headline: 'B2B booking created', subline: String(newRow.partner_id ?? ''), tone: 'info' };
    if (table === 'leads' && op === 'insert')        return { icon: '📩', headline: 'New lead', subline: String(newRow.email ?? newRow.name ?? ''), tone: 'info' };
    if (table === 'council_sessions' && op === 'insert') return { icon: '🧠', headline: 'AI Council deliberation started', subline: String((newRow.prompt ?? '')).slice(0, 80), tone: 'info' };

    // Fallback for any unmapped db_* event
    return {
      icon: op === 'insert' ? '➕' : op === 'delete' ? '🗑️' : '✏️',
      headline: `${table} ${op}`,
      subline: target ? `id: ${target.slice(0, 12)}…` : '',
      tone: 'info',
    };
  }

  // App-level events
  if (r.event_type === 'llm_execution') {
    const tokens = (p.input_tokens as number | undefined ?? 0) + (p.output_tokens as number | undefined ?? 0);
    return { icon: '🤖', headline: 'AI assistant called', subline: tokens ? `${tokens} tokens · ${r.duration_ms}ms` : `${r.duration_ms ?? '?'}ms`, tone };
  }
  if (r.event_type === 'admin_onboard_tenant') {
    return { icon: '🏨', headline: 'New tenant onboarded', subline: `${p.hotel_name ?? ''} (${p.plan_tier ?? ''})`, tone };
  }
  if (r.event_type === 'status_change') {
    return { icon: '✅', headline: 'Tenant activated', subline: String(p.hotel_name ?? p.slug ?? ''), tone };
  }
  if (r.event_type === 'admin_logs_read') {
    return { icon: '👁️', headline: 'Audit log read', subline: `${r.role} · ${r.status_code}`, tone };
  }
  if (r.event_type === 'cron_audit_purge') {
    return { icon: '🧹', headline: 'Audit purge cron', subline: `Deleted ${p.rows_deleted ?? 0} expired rows`, tone };
  }

  return { icon: 'ℹ️', headline: r.event_type, subline: r.action_target ?? '', tone };
}


export default function AdminAuditPage() {
  const [secret, setSecret]       = useState<string>('');
  const [authed, setAuthed]       = useState<boolean>(false);
  const [authErr, setAuthErr]     = useState<string>('');
  const [secretInput, setSecretInput] = useState<string>('');

  const [rows, setRows]           = useState<AuditRow[]>([]);
  const [loading, setLoading]     = useState<boolean>(false);
  const [fetchMeta, setFetchMeta] = useState<string>('');
  const [err, setErr]             = useState<string>('');
  const [selected, setSelected]   = useState<AuditRow | null>(null);

  // Filters
  const [winSel, setWinSel]   = useState<WindowKey>('24h');
  const [evtSel, setEvtSel]   = useState<string>('');
  const [resSel, setResSel]   = useState<string>('');
  const [search, setSearch]   = useState<string>('');

  // Live mode: poll every 3s, flash newly-arrived rows
  const [liveMode, setLiveMode] = useState<boolean>(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  // Hide noise (dashboard polling itself, scheduled crons) by default.
  // Toggle in filter bar to bring them back.
  const [showInternal, setShowInternal] = useState<boolean>(false);

  // View mode — stream is default (visual cards), table for power use
  const [viewMode, setViewMode] = useState<'stream' | 'table'>('stream');

  // Hydrate from sessionStorage / localStorage on mount
  useEffect(() => {
    const s = sessionStorage.getItem(SECRET_KEY);
    if (s) { setSecret(s); setAuthed(true); }
    try {
      const f = JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}');
      if (f.window) setWinSel(f.window);
      if (f.event)  setEvtSel(f.event);
      if (f.result) setResSel(f.result);
      if (f.search) setSearch(f.search);
      if (typeof f.showInternal === 'boolean') setShowInternal(f.showInternal);
    } catch {}
  }, []);

  // Persist filters
  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      window: winSel, event: evtSel, result: resSel, search, showInternal,
    }));
  }, [winSel, evtSel, resSel, search, showInternal]);

  const fetchRows = useCallback(async (override?: { secret?: string; window?: WindowKey; silent?: boolean }) => {
    const s   = override?.secret ?? secret;
    const win = override?.window ?? winSel;
    const silent = override?.silent === true;
    if (!s) return;
    if (!silent) setLoading(true);
    setErr('');
    const since = windowToSince(win);
    const params = new URLSearchParams();
    params.set('limit', '500');
    if (since) params.set('since', since);
    const t0 = Date.now();
    try {
      const r = await fetch(`/api/admin/logs?${params}`, {
        headers: { Authorization: `Bearer ${s}` },
        cache: 'no-store',
      });
      if (r.status === 401) {
        setAuthed(false);
        sessionStorage.removeItem(SECRET_KEY);
        setAuthErr('Secret rejected. Try again.');
        return;
      }
      if (!r.ok) {
        setErr(`HTTP ${r.status} — ${await r.text()}`);
        return;
      }
      const j = await r.json();
      const newRows: AuditRow[] = j.rows ?? [];
      // Flash rows whose id wasn't in the previous fetch
      setRows(prev => {
        const prevIds = new Set(prev.map(p => p.id));
        const arrived = newRows.filter(n => !prevIds.has(n.id)).map(n => n.id);
        if (arrived.length && prev.length > 0) {
          setFlashIds(new Set(arrived));
          setTimeout(() => setFlashIds(new Set()), 1800);
        }
        return newRows;
      });
      setFetchMeta(`Refreshed ${new Date().toLocaleTimeString()} · ${newRows.length} rows · ${Date.now() - t0}ms`);
    } catch (e) {
      setErr(`Network error: ${(e as Error).message}`);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [secret, winSel]);

  useEffect(() => {
    if (authed) void fetchRows();
  }, [authed, winSel, fetchRows]);

  // Live polling — every 3s while liveMode is on
  useEffect(() => {
    if (!authed || !liveMode) return;
    const handle = setInterval(() => { void fetchRows({ silent: true }); }, 3000);
    return () => clearInterval(handle);
  }, [authed, liveMode, fetchRows]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretInput.trim()) return;
    setAuthErr('');
    setLoading(true);
    try {
      const r = await fetch('/api/admin/logs?limit=1', {
        headers: { Authorization: `Bearer ${secretInput.trim()}` },
      });
      if (r.status === 401) { setAuthErr('Invalid admin secret.'); return; }
      if (!r.ok) { setAuthErr(`Server returned HTTP ${r.status}.`); return; }
      sessionStorage.setItem(SECRET_KEY, secretInput.trim());
      setSecret(secretInput.trim());
      setAuthed(true);
      setSecretInput('');
    } catch (e) {
      setAuthErr(`Network error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem(SECRET_KEY);
    setSecret(''); setAuthed(false); setRows([]); setSelected(null);
  };

  // Event-type options derived from current row set
  const eventTypes = useMemo(
    () => [...new Set(rows.map(r => r.event_type).filter(Boolean))].sort(),
    [rows],
  );

  // Client-side filter pass
  const INTERNAL_EVENTS = new Set(['admin_logs_read', 'cron_audit_purge']);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(r => {
      if (!showInternal && INTERNAL_EVENTS.has(r.event_type)) return false;
      if (evtSel && r.event_type !== evtSel) return false;
      if (resSel && r.result !== resSel)     return false;
      if (q) {
        const hay = [
          r.action_target, r.user_id, r.role, r.ip,
          r.request_id, r.error, JSON.stringify(r.payload_summary ?? {}),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, evtSel, resSel, search, showInternal]);

  const kpis = useMemo(() => {
    const c = { total: filtered.length, success: 0, failure: 0, denied: 0, partial: 0 };
    for (const r of filtered) if ((c as Record<string, number>)[r.result] != null) (c as Record<string, number>)[r.result]++;
    return c;
  }, [filtered]);

  // ── LOGIN PANE ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{CSS}</style>
        <div className="wrap" style={{ maxWidth: 460, marginTop: 80 }}>
          <header>
            <div>
              <h1>Audit Log</h1>
              <div className="sub">Hotel Fountain · Lumea CRM</div>
            </div>
          </header>
          <form onSubmit={handleLogin} className="login">
            <label htmlFor="secret">Admin secret</label>
            <input
              id="secret"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={secretInput}
              onChange={e => setSecretInput(e.target.value)}
              placeholder="Paste ADMIN_SECRET"
            />
            {authErr && <div className="err">{authErr}</div>}
            <button className="btn" type="submit" disabled={loading || !secretInput.trim()}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <p className="note">
              Secret is held in <span className="mono">sessionStorage</span> for this tab only.
              Closing the tab clears it.
            </p>
          </form>
        </div>
      </>
    );
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="wrap">
        <header>
          <div>
            <h1>Audit Log</h1>
            <div className="sub">Hotel Fountain · Lumea CRM</div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fetchMeta}</span>
            <div className="view-tabs">
              <button
                className={`view-tab ${viewMode === 'stream' ? 'active' : ''}`}
                onClick={() => { setViewMode('stream'); setLiveMode(true); }}
                title="Live visual feed"
              >Stream</button>
              <button
                className={`view-tab ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Detailed table view"
              >Table</button>
            </div>
            <button
              className={`btn live-toggle ${liveMode ? 'live-on' : 'secondary'}`}
              onClick={() => setLiveMode(v => !v)}
              title="Auto-refresh every 3 seconds"
            >
              {liveMode ? (<><span className="live-dot" />LIVE</>) : 'Go live'}
            </button>
            <button className="btn secondary" onClick={() => fetchRows()}>Reload</button>
            <button className="btn secondary" onClick={handleSignOut}>Sign out</button>
          </div>
        </header>

        <div className="kpis">
          <div className="kpi"><div className="label">Total events</div><div className="val">{kpis.total}</div></div>
          <div className="kpi success"><div className="label">Success</div><div className="val">{kpis.success}</div></div>
          <div className="kpi failure"><div className="label">Failure</div><div className="val">{kpis.failure}</div></div>
          <div className="kpi denied"><div className="label">Denied</div><div className="val">{kpis.denied}</div></div>
          <div className="kpi"><div className="label">Partial</div><div className="val">{kpis.partial}</div></div>
        </div>

        <div className="filters">
          <div>
            <label>Window</label>
            <select value={winSel} onChange={e => setWinSel(e.target.value as WindowKey)}>
              <option value="1h">Last 1 hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div>
            <label>Event type</label>
            <select value={evtSel} onChange={e => setEvtSel(e.target.value)}>
              <option value="">All</option>
              {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label>Result</label>
            <select value={resSel} onChange={e => setResSel(e.target.value)}>
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="partial">Partial</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div>
            <label>Search (target / user / ip)</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchRows()}
              placeholder="e.g. council, shan@, 401"
            />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="btn" onClick={() => fetchRows()}>Apply</button>
          </div>
          <div>
            <label>&nbsp;</label>
            <button
              className="btn secondary"
              onClick={() => { setWinSel('24h'); setEvtSel(''); setResSel(''); setSearch(''); }}
            >Reset</button>
          </div>
          <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showInternal}
                onChange={e => setShowInternal(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--gold)' }}
              />
              <span style={{ fontSize: 11, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Show internal events (admin_logs_read, cron_audit_purge)
              </span>
            </label>
          </div>
        </div>

        {err && <div className="err">{err}</div>}

        {loading ? (
          <div className="loading">Loading audit events…</div>
        ) : filtered.length === 0 ? (
          <div className="tbl-wrap"><div className="empty">No events match the current filters.</div></div>
        ) : viewMode === 'stream' ? (
          <div className="stream">
            {filtered.map(r => {
              const h = humanize(r);
              return (
                <div
                  key={r.id}
                  className={`stream-card tone-${h.tone}${flashIds.has(r.id) ? ' card-flash' : ''}`}
                  onClick={() => setSelected(r)}
                >
                  <div className="stream-icon">{h.icon}</div>
                  <div className="stream-body">
                    <div className="stream-headline">{h.headline}</div>
                    <div className="stream-subline">{h.subline}</div>
                  </div>
                  <div className="stream-meta">
                    <div className="stream-time" title={fmtFullTs(r.ts)}>{fmtTs(r.ts)}</div>
                    <div className="stream-tag mono">{r.role ?? '—'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>UTC</th><th>Event</th><th>Result</th><th>Status</th>
                  <th>Role</th><th>User</th><th>Target</th>
                  <th style={{ textAlign: 'right' }}>Dur</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className={`row-clickable${flashIds.has(r.id) ? ' row-flash' : ''}`} onClick={() => setSelected(r)}>
                    <td className="ts" title={fmtFullTs(r.ts)}>{fmtTs(r.ts)}</td>
                    <td>{r.event_type}</td>
                    <td><span className={`badge ${r.result}`}>{r.result}</span></td>
                    <td className={statusClass(r.status_code)}><span className="mono">{r.status_code ?? '—'}</span></td>
                    <td>{r.role ?? '—'}</td>
                    <td>{r.user_id ?? '—'}</td>
                    <td className="target" title={r.action_target ?? ''}>
                      {(r.action_target ?? '').slice(0, 60)}{(r.action_target ?? '').length > 60 ? '…' : ''}
                    </td>
                    <td className="duration">{r.duration_ms != null ? `${r.duration_ms}ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="footer-note">
          {filtered.length > 0 && `Showing ${filtered.length} of ${rows.length} fetched · click any row for full detail`}
        </div>
      </div>

      {selected && (
        <div className="drawer-back" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="drawer">
            <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
            <h2>{selected.event_type}</h2>
            {([
              ['Timestamp',     fmtFullTs(selected.ts)],
              ['Result',        selected.result],
              ['Status code',   selected.status_code ?? '—'],
              ['Action target', selected.action_target ?? '—'],
              ['Role',          selected.role ?? '—'],
              ['User',          selected.user_id ?? '—'],
              ['Tenant',        selected.tenant_id ?? '—'],
              ['Request ID',    selected.request_id ?? '—'],
              ['IP',            selected.ip ?? '—'],
              ['User agent',    selected.user_agent ?? '—'],
              ['Duration',      selected.duration_ms != null ? `${selected.duration_ms} ms` : '—'],
              ['Audit row ID',  selected.id],
            ] as [string, unknown][]).map(([k, v]) => (
              <div key={k} className="meta-row">
                <div className="k">{k}</div>
                <div className="v">{String(v)}</div>
              </div>
            ))}
            {selected.error && (
              <>
                <div className="meta-row" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="k">Error</div>
                </div>
                <pre style={{ color: 'var(--red)' }}>{selected.error}</pre>
              </>
            )}
            <div className="meta-row" style={{ gridTemplateColumns: '1fr' }}>
              <div className="k">Payload (sanitized)</div>
            </div>
            <pre>{JSON.stringify(selected.payload_summary ?? {}, null, 2)}</pre>
          </div>
        </div>
      )}
    </>
  );
}

// ── Styles (Gilded Threshold) ───────────────────────────────────────────────
const CSS = `
:root {
  --ivory: #FAFAF7; --ivory-2: #F4F1E8; --border: #EAE6DD;
  --ink: #1A1209; --ink-2: #2D2D2D; --muted: #9A907C; --muted-2: #7A7060;
  --gold: #C8A96E; --gold-dark: #8E7847;
  --green: #2f7a2f; --red: #b03030; --amber: #b07c1f;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--ivory); color: var(--ink-2);
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; line-height: 1.5; }
h1, h2 { font-family: 'Libre Baskerville', Georgia, serif; font-weight: 400; color: var(--ink); letter-spacing: -0.01em; }
.mono { font-family: 'IBM Plex Mono', 'SF Mono', Menlo, monospace; }
.wrap { max-width: 1400px; margin: 0 auto; padding: 24px 28px 48px; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; margin-bottom: 8px; }
h1 { margin: 0; font-size: 22px; }
.sub { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--muted); margin-bottom: 24px; }
.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 20px; }
.kpi { background: #fff; border: 1px solid var(--border); padding: 14px 16px; }
.kpi .label { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.kpi .val { font-family: 'IBM Plex Mono', monospace; font-size: 22px; color: var(--ink); font-weight: 500; }
.kpi.success .val { color: var(--green); }
.kpi.failure .val { color: var(--red); }
.kpi.denied  .val { color: var(--amber); }
.filters { background: #fff; border: 1px solid var(--border); padding: 16px;
  display: grid; grid-template-columns: 160px 130px 130px 1fr 110px 90px; gap: 10px; align-items: end; margin-bottom: 18px; }
.filters label { display: block; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
.filters select, .filters input { width: 100%; padding: 7px 9px; font-size: 12px;
  border: 1px solid var(--border); background: var(--ivory); color: var(--ink-2); font-family: inherit;
  transition: border-color 160ms cubic-bezier(0.4, 0, 0.2, 1); }
.filters select:focus, .filters input:focus { outline: none; border-color: var(--gold); }
.btn { padding: 7px 14px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; cursor: pointer;
  border: 1px solid var(--ink); background: var(--ink); color: #fff;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1); }
.btn:hover { background: var(--gold-dark); border-color: var(--gold-dark); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn.secondary { background: transparent; color: var(--ink); border-color: var(--border); }
.btn.secondary:hover { background: var(--ivory-2); border-color: var(--ink); }
.tbl-wrap { background: #fff; border: 1px solid var(--border); overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 12px; font-size: 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { background: var(--ivory-2); font-weight: 500; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted-2); position: sticky; top: 0; }
tr:last-child td { border-bottom: none; }
tr.row-clickable { cursor: pointer; }
tr.row-clickable:hover td { background: var(--ivory); }
td.ts { font-family: 'IBM Plex Mono', monospace; color: var(--muted-2); white-space: nowrap; }
td.target { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
td.duration { font-family: 'IBM Plex Mono', monospace; text-align: right; color: var(--muted-2); }
.badge { display: inline-block; padding: 2px 8px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 500; border: 1px solid; }
.badge.success { color: var(--green); border-color: rgba(47,122,47,.4); background: rgba(47,122,47,.06); }
.badge.failure { color: var(--red);   border-color: rgba(176,48,48,.4); background: rgba(176,48,48,.06); }
.badge.partial { color: var(--amber); border-color: rgba(176,124,31,.4); background: rgba(176,124,31,.06); }
.badge.denied  { color: var(--amber); border-color: rgba(176,124,31,.4); background: rgba(176,124,31,.06); }
.status-2xx { color: var(--green); }
.status-4xx { color: var(--amber); }
.status-5xx { color: var(--red); }
.drawer-back { position: fixed; inset: 0; background: rgba(26,18,9,.5); display: flex; align-items: stretch; justify-content: flex-end; z-index: 100; }
.drawer { background: #fff; width: min(640px, 90vw); height: 100vh; overflow-y: auto; padding: 28px 28px 80px; border-left: 1px solid var(--border);
  animation: slidein 200ms cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
@keyframes slidein { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.drawer h2 { margin: 0 0 4px; font-size: 18px; }
.meta-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px 12px; padding: 14px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.meta-row .k { color: var(--muted); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
.meta-row .v { font-family: 'IBM Plex Mono', monospace; word-break: break-all; }
pre { background: var(--ivory-2); border: 1px solid var(--border); padding: 14px; font-size: 11px; line-height: 1.6; overflow-x: auto;
  font-family: 'IBM Plex Mono', monospace; color: var(--ink-2); margin: 14px 0; white-space: pre-wrap; word-break: break-word; }
.drawer-close { position: absolute; top: 16px; right: 16px; background: transparent; border: none; font-size: 24px; color: var(--muted); cursor: pointer; line-height: 1; }
.drawer-close:hover { color: var(--ink); }
.empty { padding: 60px 20px; text-align: center; color: var(--muted); font-family: 'Libre Baskerville', Georgia, serif; font-style: italic; }
.err { padding: 16px; border: 1px solid var(--red); background: rgba(176,48,48,.04); color: var(--red); margin-bottom: 18px; font-size: 12px; }
.loading { padding: 40px; text-align: center; color: var(--muted); }
.footer-note { margin-top: 16px; font-size: 11px; color: var(--muted); text-align: right; }
.login { background: #fff; border: 1px solid var(--border); padding: 32px; margin-top: 12px; }
.login label { display: block; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.login input { width: 100%; padding: 10px 12px; font-size: 13px; border: 1px solid var(--border); background: var(--ivory); color: var(--ink-2);
  font-family: 'IBM Plex Mono', monospace; margin-bottom: 16px; transition: border-color 160ms cubic-bezier(0.4, 0, 0.2, 1); }
.login input:focus { outline: none; border-color: var(--gold); }
.login .btn { width: 100%; }
.login .note { font-size: 11px; color: var(--muted); margin: 16px 0 0; line-height: 1.6; }
.live-toggle { display: inline-flex; align-items: center; gap: 6px; }
.live-on { background: var(--green) !important; border-color: var(--green) !important; color: #fff !important; letter-spacing: .14em; }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 0 rgba(255,255,255,0.7); animation: live-pulse 1.4s infinite cubic-bezier(0.4, 0, 0.2, 1); }
@keyframes live-pulse {
  0%   { box-shadow: 0 0 0 0   rgba(255,255,255,0.85); }
  70%  { box-shadow: 0 0 0 9px rgba(255,255,255,0);    }
  100% { box-shadow: 0 0 0 0   rgba(255,255,255,0);    }
}
@keyframes row-flash-anim {
  0%   { background: rgba(200,169,110,0.32); }
  100% { background: transparent; }
}
tr.row-flash td { animation: row-flash-anim 1.8s cubic-bezier(0.4, 0, 0.2, 1); }

/* View-mode tabs */
.view-tabs { display: inline-flex; border: 1px solid var(--border); background: #fff; }
.view-tab { background: transparent; border: none; padding: 7px 14px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); cursor: pointer; transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1); font-family: inherit; }
.view-tab:hover { color: var(--ink); }
.view-tab.active { background: var(--ink); color: #fff; }

/* Stream view */
.stream { display: flex; flex-direction: column; gap: 10px; }
.stream-card { display: grid; grid-template-columns: 56px 1fr 130px; gap: 16px; align-items: center; background: #fff; border: 1px solid var(--border); padding: 16px 18px; cursor: pointer; transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1), border-color 160ms cubic-bezier(0.4, 0, 0.2, 1); animation: card-slide-in 360ms cubic-bezier(0.4, 0, 0.2, 1); }
.stream-card:hover { transform: translateY(-1px); border-color: var(--gold); }
.stream-icon { font-size: 28px; line-height: 1; text-align: center; }
.stream-body { min-width: 0; }
.stream-headline { font-family: 'Libre Baskerville', Georgia, serif; font-size: 16px; color: var(--ink); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stream-subline { font-size: 12px; color: var(--muted-2); font-family: 'IBM Plex Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stream-meta { text-align: right; }
.stream-time { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--ink); }
.stream-tag { font-size: 10px; color: var(--muted); letter-spacing: .08em; margin-top: 4px; }

.tone-money   { border-left: 3px solid var(--green); }
.tone-failure { border-left: 3px solid var(--red);   }
.tone-denied  { border-left: 3px solid var(--amber); }
.tone-partial { border-left: 3px solid var(--amber); }
.tone-info    { border-left: 3px solid var(--gold);  }

@keyframes card-slide-in {
  from { transform: translateY(-12px); opacity: 0; }
  to   { transform: translateY(0);     opacity: 1; }
}
@keyframes card-flash-anim {
  0%   { box-shadow: inset 0 0 0 9999px rgba(200,169,110,0.28); border-color: var(--gold); }
  100% { box-shadow: inset 0 0 0 9999px transparent;             border-color: var(--border); }
}
.stream-card.card-flash { animation: card-slide-in 360ms cubic-bezier(0.4, 0, 0.2, 1), card-flash-anim 1.8s cubic-bezier(0.4, 0, 0.2, 1); }
`;
