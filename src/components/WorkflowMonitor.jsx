'use client';

// WorkflowMonitor — ported from legacy WorkflowMonitor. Lists the scheduled email/report
// workflows with their last run (from workflow_runs) and a manual "Run" trigger that POSTs
// the matching Supabase edge function.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const BASE = 'https://mynwfkgksqqwlqowlscj.supabase.co';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const WORKFLOWS = [
  { id: 'wf-morning-briefing', label: 'Morning Briefing', slug: 'wf-morning-briefing', time: '7:00 AM daily', body: '{}' },
  { id: 'checkout-reminder', label: 'Checkout Reminder', slug: 'wf-checkout-alerts', time: '10:30 AM daily', body: '{"mode":"reminder"}' },
  { id: 'overdue-alert', label: 'Overdue Alert', slug: 'wf-checkout-alerts', time: '12:30 PM daily', body: '{"mode":"overdue"}' },
  { id: 'evening-revenue', label: 'Evening Revenue Report', slug: 'wf-evening-report', time: '9:00 PM daily', body: '{}' },
  { id: 'weekly-summary', label: 'Weekly Summary', slug: 'wf-period-reports', time: 'Mon 8:00 AM', body: '{"mode":"weekly"}' },
  { id: 'monthly-report', label: 'Monthly Report', slug: 'wf-period-reports', time: '1st of month', body: '{"mode":"monthly"}' },
  { id: 'wf-competitor-monitor', label: 'Competitor Monitor', slug: 'wf-competitor-monitor', time: '6:00 AM daily', body: '{}' },
  { id: 'wf-backup-verify', label: 'Backup Verification', slug: 'wf-backup-verify', time: 'Sunday 11 PM', body: '{}' },
];

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('en', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

export default function WorkflowMonitor() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await getSupabaseClient().from('workflow_runs')
        .select('workflow_name, status, duration_ms, records_processed, ran_at').order('ran_at', { ascending: false }).limit(50);
      setRuns(data || []);
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
            <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: last ? (ok ? '#16A34A' : '#DC2626') : '#CBD5E1' }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: 'var(--iv-ink)' }}>{wf.label}</div>
              <div className="iv-stat__sub" style={{ display: 'flex', gap: 10 }}>
                <span>🕐 {wf.time}</span>
                {last && <span style={{ color: ok ? '#16A34A' : '#DC2626' }}>Last: {fmtTime(last.ran_at)}</span>}
                {last?.duration_ms ? <span>{last.duration_ms}ms</span> : null}
              </div>
            </div>
            {last && <span className="iv-badge" style={{ background: ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', color: ok ? '#16A34A' : '#DC2626' }}>{last.status}</span>}
            <button className="iv-btn iv-btn--ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={!!triggering} onClick={() => triggerNow(wf)}>{triggering === wf.id ? '…' : '▶ Run'}</button>
          </div>
        );
      })}
    </div>
  );
}
