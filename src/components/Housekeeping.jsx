'use client';

// Housekeeping — ported from legacy crm-src.jsx HousekeepingPage.
// Task list + filters + low-risk status update (housekeeping_tasks). Delete + Add-Task
// stay on the legacy modal for now (linked). No billing/money writes.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import TaskFormModal from './TaskFormModal';

const STATUS_STYLE = {
  pending:       { bg: 'rgba(217,164,65,0.15)',  fg: '#8A6A1E', label: 'Pending' },
  'in-progress': { bg: 'rgba(56,132,180,0.15)',  fg: '#2E6A8E', label: 'In Progress' },
  completed:     { bg: 'rgba(74,124,89,0.15)',   fg: '#3C6B4A', label: 'Completed' },
};
const PRIORITY_DOT = { high: '#C0566A', medium: '#D9A441', low: '#7FA46B' };

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return <span className="iv-badge" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

export default function Housekeeping() {
  const [tasks, setTasks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: t }, { data: r }] = await Promise.all([
        supabase.from('housekeeping_tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('rooms').select('id, room_number, status'),
      ]);
      setTasks(t || []);
      setRooms(r || []);
    } catch (e) {
      console.error('[Housekeeping] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    setSaving(id);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('housekeeping_tasks')
        .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch (e) {
      console.error('[Housekeeping] update error:', e);
      alert('Could not update task: ' + (e.message || e));
    } finally {
      setSaving(null);
    }
  }

  const dirty = rooms.filter((r) => r.status === 'DIRTY');

  let list = tasks;
  if (filter === 'DIRTY') {
    list = dirty.map((r) => ({
      id: 'r_' + r.id, room_number: r.room_number, task_type: 'Standard Clean',
      priority: 'high', status: 'pending', assignee: '—', _dirty: true,
    }));
  } else if (filter !== 'ALL') {
    list = tasks.filter((t) => t.status === filter);
  }

  const tabs = [
    ['ALL', 'All Tasks'], ['pending', 'Pending'], ['in-progress', 'In Progress'],
    ['completed', 'Completed'], ['DIRTY', `Dirty Rooms (${dirty.length})`],
  ];

  return (
    <div>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Housekeeping</h1>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {tabs.map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={filter === v ? 'iv-btn' : 'iv-btn iv-btn--ghost'}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {l}
            </button>
          ))}
        </div>
        <button className="iv-btn" onClick={() => setShowAdd(true)}>+ Add Task</button>
      </div>

      <div className="iv-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#8A7F6E', borderBottom: '1px solid #EAE3D6' }}>
                <th className="text-left py-2 font-normal">Room</th>
                <th className="text-left py-2 font-normal">Task</th>
                <th className="text-left py-2 font-normal">Priority</th>
                <th className="text-left py-2 font-normal">Assignee</th>
                <th className="text-left py-2 font-normal">Time</th>
                <th className="text-left py-2 font-normal">Status</th>
                <th className="text-left py-2 font-normal">Update</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-3 iv-stat__sub">Loading…</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={7} className="py-3 iv-stat__sub">No tasks for this filter.</td></tr>}
              {list.slice(0, 60).map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #F0EBE0' }}>
                  <td className="py-2"><span className="iv-mono" style={{ fontWeight: 700, color: '#8B6914' }}>{t.room_number}</span></td>
                  <td className="py-2">{t.task_type}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: PRIORITY_DOT[t.priority] || PRIORITY_DOT.medium, display: 'inline-block' }} />
                      <span className="text-xs">{t.priority || 'medium'}</span>
                    </span>
                  </td>
                  <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{t.assignee || '—'}</td>
                  <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{t.scheduled_time || '—'}</td>
                  <td className="py-2"><StatusBadge status={t.status || 'pending'} /></td>
                  <td className="py-2">
                    {!t._dirty && (
                      <select
                        value={t.status || 'pending'}
                        disabled={saving === t.id}
                        onChange={(e) => updateStatus(t.id, e.target.value)}
                        className="iv-input"
                        style={{ padding: '3px 8px', fontSize: 12, minWidth: 120 }}
                      >
                        {['pending', 'in-progress', 'completed'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <TaskFormModal rooms={rooms} onClose={() => setShowAdd(false)} onSaved={fetchData} />
      )}
    </div>
  );
}
