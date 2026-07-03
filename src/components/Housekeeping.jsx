'use client';

// Housekeeping — Hotel Fountain Design System "Board" (3 status StatCards + task table).
// Live housekeeping_tasks + DIRTY-rooms view. Low-risk status update; Add Task via modal.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import TaskFormModal from './TaskFormModal';
import { Card, StatCard, Table, Badge, Avatar, TD, C } from './dskit';
import { getSnap, warmSnap, setSnap } from '@/lib/snap';

const STATUS_TONE = { pending: ['amber', 'Pending'], 'in-progress': ['blue', 'In Progress'], completed: ['green', 'Completed'] };
const PRIORITY_DOT = { high: C.rose, medium: C.amb, low: C.grn };

export default function Housekeeping() {
  const _cached = getSnap('housekeeping'); // hot tier — instant tab→tab revisits
  const [tasks, setTasks] = useState(_cached?.tasks || []);
  const [rooms, setRooms] = useState(_cached?.rooms || []);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(!_cached);
  const [saving, setSaving] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!getSnap('housekeeping')) {
      const warm = warmSnap('housekeeping'); // localStorage tier — instant paint after full reload
      if (warm) { setTasks(warm.tasks || []); setRooms(warm.rooms || []); setLoading(false); }
    }
    fetchData();
  }, []);

  async function fetchData() {
    if (!getSnap('housekeeping')) setLoading(true); // revisits refresh silently behind cached rows
    try {
      const supabase = getSupabaseClient();
      const [{ data: t }, { data: r }] = await Promise.all([
        supabase.from('housekeeping_tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('rooms').select('id, room_number, status'),
      ]);
      setTasks(t || []);
      setRooms(r || []);
      setSnap('housekeeping', { tasks: t || [], rooms: r || [] });
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
      // DB convention is UPPERCASE_UNDERSCORE — lowercase writes broke the auto-AVAILABLE
      // trigger and the housekeeping_dashboard view (audit MED-9, 2026-06-10).
      const dbStatus = status.toUpperCase().replace(/-/g, '_');
      const { error } = await supabase.from('housekeeping_tasks')
        .update({ status: dbStatus, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('id', id);
      if (error) throw error;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch (e) {
      console.error('[Housekeeping] update error:', e);
      alert('Could not update task: ' + (e.message || e));
    } finally {
      setSaving(null);
    }
  }

  // DB stores task statuses UPPERCASE (and sometimes underscored) — normalize for ALL
  // comparisons or the stat cards count 0 while the table is full (live-audit bug 2026-06-10).
  const norm = (s) => String(s || 'pending').toLowerCase().replace(/_/g, '-');
  const count = (s) => tasks.filter((t) => norm(t.status) === s).length;
  const dirty = rooms.filter((r) => r.status === 'DIRTY');

  let list = tasks;
  if (filter === 'DIRTY') {
    list = dirty.map((r) => ({ id: 'r_' + r.id, room_number: r.room_number, task_type: 'Standard Clean', priority: 'high', status: 'pending', assignee: '—', _dirty: true }));
  } else if (filter !== 'ALL') {
    list = tasks.filter((t) => norm(t.status) === filter);
  }

  const filters = [['ALL', 'All'], ['pending', 'Pending'], ['in-progress', 'In Progress'], ['completed', 'Completed'], ['DIRTY', `Dirty (${dirty.length})`]];

  const pillBtns = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {filters.map(([v, l]) => {
        const on = filter === v;
        return (
          <button key={v} onClick={() => setFilter(v)} style={{ padding: '5px 13px', fontFamily: 'var(--iv-body)', fontSize: 12.5, letterSpacing: '.01em', fontWeight: on ? 600 : 500, cursor: 'pointer', borderRadius: 999, color: on ? '#171A05' : 'var(--iv-ink2)', background: on ? 'var(--iv-gold-light)' : 'rgba(255,255,255,.05)', border: `1px solid ${on ? 'var(--iv-gold-light)' : 'var(--iv-border)'}`, transition: 'all .18s var(--iv-ease)' }}>{l}</button>
        );
      })}
      <button className="iv-btn" onClick={() => setShowAdd(true)} style={{ fontSize: 12, padding: '5px 12px' }}>+ Add Task</button>
    </div>
  );

  return (
    <div>
      <div className="iv-stat-grid iv-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard icon="✦" label="Awaiting Service" value={loading ? '—' : count('pending')} sub="rooms flagged for cleaning" accent={C.amb} />
        <StatCard icon="◐" label="In Progress" value={loading ? '—' : count('in-progress')} sub="being serviced now" accent={C.sky} />
        <StatCard icon="✓" label="Completed" value={loading ? '—' : count('completed')} sub="cleared for sale" accent={C.grn} />
      </div>

      <Card title="Housekeeping" titleAccent="Board" action={pillBtns} bodyStyle={{ padding: 0 }}>
        <Table head={['Room', 'Task', 'Priority', 'Assignee', 'Status', 'Update']}>
          {loading && <tr><td colSpan={6} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>Loading…</td></tr>}
          {!loading && list.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No tasks for this filter.</td></tr>}
          {list.slice(0, 80).map((t) => {
            const [tone, label] = STATUS_TONE[norm(t.status)] || ['amber', t.status];
            return (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                <td style={TD}><span className="iv-mono" style={{ fontSize: 15, fontWeight: 500, color: 'var(--iv-ink)' }}>{t.room_number}</span></td>
                <td style={TD}>{t.task_type || 'Standard Clean'}</td>
                <td style={TD}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: PRIORITY_DOT[t.priority] || PRIORITY_DOT.medium }} />
                    <span style={{ fontSize: 11, textTransform: 'capitalize' }}>{t.priority || 'medium'}</span>
                  </span>
                </td>
                <td style={TD}>
                  {t.assignee && t.assignee !== '—' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={t.assignee} size={24} /><span style={{ fontSize: 11.5 }}>{t.assignee}</span></div>
                  ) : <span style={{ fontSize: 11, color: C.amb, fontStyle: 'italic' }}>Unassigned</span>}
                </td>
                <td style={TD}><Badge tone={tone}>{label}</Badge></td>
                <td style={TD}>
                  {!t._dirty && (
                    <select value={norm(t.status)} disabled={saving === t.id} onChange={(e) => updateStatus(t.id, e.target.value)} className="iv-input" style={{ padding: '4px 8px', fontSize: 12, minWidth: 120, width: 'auto' }}>
                      {['pending', 'in-progress', 'completed'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {showAdd && <TaskFormModal rooms={rooms} onClose={() => setShowAdd(false)} onSaved={fetchData} />}
    </div>
  );
}
