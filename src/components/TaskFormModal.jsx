'use client';

// TaskFormModal — WRITE flow: add a housekeeping task. Mirrors legacy AddTaskModal.
// Non-money. Writes ONLY through POST /api/crm/task (session-gated, service role).
// No direct Supabase client here - anon holds no privilege on housekeeping_tasks (S-5).
import { useState } from 'react';

const TASK_TYPES = ['Standard Clean', 'Deep Clean', 'Turndown', 'VIP Turndown', 'Inspection', 'Extra Towels', 'Maintenance', 'AC Repair', 'Plumbing'];

export default function TaskFormModal({ rooms = [], onClose, onSaved }) {
  const [f, setF] = useState({
    room_number: rooms[0]?.room_number || '', task_type: 'Standard Clean',
    priority: 'medium', assignee: '', scheduled_time: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!f.room_number) return setErr('Room is required.');
    setErr(''); setSaving(true);
    try {
      // Phase 3: write through the session-gated server route (service role).
      const r = await fetch('/api/crm/task', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_number: f.room_number, task_type: f.task_type, priority: f.priority, assignee: f.assignee, scheduled_time: f.scheduled_time, notes: f.notes }),
      });
      if (r.status === 401) {
        // The direct-insert fallback that used to live here is gone. S-2 (2026-08-17)
        // revoked anon INSERT on housekeeping_tasks, so it could only ever surface a raw
        // "permission denied for table housekeeping_tasks" to a staff member whose session
        // had expired. Say the actual thing instead.
        throw new Error('Your session has expired. Please sign out and sign in again.');
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'Could not create task.');
      onSaved?.();
      onClose?.();
    } catch (e) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  }

  const field = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 10, background: 'rgba(255,255,255,.05)', width: '100%', fontSize: 13, minHeight: 42, color: 'var(--iv-ink)' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-5 pb-4 iv-divider">Add Housekeeping Task</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div><label style={lbl}>Room *</label>
            <select style={field} value={f.room_number} onChange={set('room_number')}>
              {rooms.map((r) => <option key={r.id} value={r.room_number}>{r.room_number} — {String(r.status || '').replace('_', ' ')}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Task Type</label>
            <select style={field} value={f.task_type} onChange={set('task_type')}>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div><label style={lbl}>Priority</label>
            <select style={field} value={f.priority} onChange={set('priority')}>{['low', 'medium', 'high'].map((p) => <option key={p} value={p}>{p}</option>)}</select>
          </div>
          <div><label style={lbl}>Scheduled Time</label><input type="time" style={field} value={f.scheduled_time} onChange={set('scheduled_time')} /></div>
        </div>
        <div className="mb-4"><label style={lbl}>Assignee</label><input style={field} value={f.assignee} onChange={set('assignee')} placeholder="Staff member name" /></div>
        <div className="mb-4"><label style={lbl}>Notes</label><textarea style={{ ...field, minHeight: 56, resize: 'vertical' }} value={f.notes} onChange={set('notes')} placeholder="Optional details" /></div>

        {err && <div className="mb-3 text-sm" style={{ color: '#FF6B6B' }}>{err}</div>}

        <div className="flex justify-end gap-3 iv-foot">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Task'}</button>
        </div>
      </div>
    </div>
  );
}
