'use client';

// WorkflowMonitor — ported from legacy WorkflowMonitor. Lists the scheduled email/report
// workflows with their last run (from workflow_runs) and a manual "Run" trigger that POSTs
// the matching Supabase edge function.
import { useState, useEffect } from 'react';

const BASE = 'https://mynwfkgksqqwlqowlscj.supabase.co';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// `id` is matched against workflow_runs.workflow_name — it must be the name the edge
// function actually WRITES, which is not always the function slug. The wf-* ids below
// silently stopped resolving around 2026-07-19/20 when the functions switched to
// canonical run names, leaving three cards permanently blank while the jobs ran fine.
// Retired 2026-08-08: Morning Briefing (Vercel cron removed in 349763a) and
// Monthly Report (pg_cron job hf-monthly-report unscheduled) — both schedules deleted.
const WORKFLOWS = [
  { id: 'evening-revenue', label: 'Evening Revenue Report', slug: 'wf-evening-report', time: '9:00 PM daily', body: '{}' },
  { id: 'weekly-summary', label: 'Weekly Summary', slug: 'wf-period-reports', time: 'Mon 8:00 AM', body: '{"mode":"weekly"}' },
  { id: 'competitor-monitor', label: 'Competitor Monitor', slug: 'wf-competitor-monitor', time: 'Mon 6:00 AM', body: '{}' },
  { id: 'backup-verification', label: 'Backup Verification', slug: 'wf-backup-verify', time: 'Sunday 11 PM', body: '{}' },
];

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('en', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

export default function WorkflowMonitor() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      // limit must stay well clear of the busiest workflow's run count: this is a flat
      // "most recent N rows" fetch that we reduce to latest-per-workflow client-side, so a
      // high-frequency job crowds infrequent ones out of the window and blanks their card.
      // At 50, competitor-monitor alone held 14 slots and pushed monthly/weekly reports out.
      // C3: read through the session-gated route, NOT the anon key. The browser has
      // no Supabase identity (AuthGate keeps its own localStorage session), so a
      // direct PostgREST read here was served to anyone holding the publishable key.
      const qs = new URLSearchParams({
        resource: 'workflow_runs',
        cols: 'workflow_name,status,duration_ms,records_processed,ran_at',
        order: 'ran_at.desc',
        limit: '500',
      });
      const r = await fetch(`/api/crm/data?${qs}`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : { rows: [] };
      setRuns(j.rows || []);
    } catch { /* table may be empty */ } finally { setLoading(false); }
  }

  async function triggerNow(wf) {
    setTriggering(wf.id);
    try {
      await fetch(`${BASE}/functions/v1/${wf.slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` }, body: wf.body });
      await load();
    } catch { /* ignore */ } finally { setTriggering(null); }
  }

  const lastRun = (id) => runs.find((r) => r.workflow_name === id);

  return (
    <div className="iv-card">
      <div className="flex items-center justify-between mb-3 pb-3 iv-divider">
        <h3 className="text-lg">⚡ Email Workflows</h3>
        <span className="iv-stat__sub">{runs.length} runs logged</span>
      </div>
      {loading && <div className="iv-stat__sub">Loading workflow history…</div>}
      {!loading && WORKFLOWS.map((wf) => {
        const last = lastRun(wf.id);
        const ok = last?.status === 'success';
        return (
          <div key={wf.id} className="flex items-center gap-3" style={{ padding: '8px 0', borderBottom: '1px solid var(--iv-border2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: last ? (ok ? '#7BE04A' : '#FF6B6B') : '#CBD5E1' }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: 'var(--iv-ink)' }}>{wf.label}</div>
              <div className="iv-stat__sub" style={{ display: 'flex', gap: 10 }}>
                <span>🕐 {wf.time}</span>
                {last && <span style={{ color: ok ? '#7BE04A' : '#FF6B6B' }}>Last: {fmtTime(last.ran_at)}</span>}
                {last?.duration_ms ? <span>{last.duration_ms}ms</span> : null}
              </div>
            </div>
            {last && <span className="iv-badge" style={{ background: ok ? 'rgba(123,224,74,0.12)' : 'rgba(255,107,107,0.12)', color: ok ? '#7BE04A' : '#FF6B6B' }}>{last.status}</span>}
            <button className="iv-btn iv-btn--ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={!!triggering} onClick={() => triggerNow(wf)}>{triggering === wf.id ? '…' : '▶ Run'}</button>
          </div>
        );
      })}
    </div>
  );
}
