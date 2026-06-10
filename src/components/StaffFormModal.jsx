'use client';

// StaffFormModal — ported from legacy AddStaffModal + EditStaffModal. Add inserts a staff
// row (integer PK = max(existing)+1, activated:false, pwh:null — staff self-activates via
// OTP on the login page). Edit patches name/email/role/device, with force-reactivate (clears
// pwh) and remove. Owner rows are never editable/removable here.
import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const ROLE_OPTS = [['manager', 'Manager'], ['receptionist', 'Receptionist'], ['housekeeping', 'Housekeeping'], ['accountant', 'Accountant']];
const initials = (n) => String(n || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();

export default function StaffFormModal({ user, existing, onClose, onSaved }) {
  const isEdit = !!user;
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', role: user?.role || 'receptionist', device: user?.device || '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!f.name || !f.email) return setErr('Name and email are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setErr('Enter a valid email address.');
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/crm/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isEdit ? 'update' : 'create', id: user?.id, name: f.name, email: f.email, role: f.role, device: f.device }),
      });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        if (isEdit) {
          const patch = { name: f.name, email: f.email.trim().toLowerCase(), role: f.role, device: f.device };
          const { error } = await supabase.from('staff').update(patch).eq('id', user.id); if (error) throw error;
        } else {
          const nextId = Math.max(0, ...(existing || []).map((s) => +s.id || 0)) + 1;
          const { error } = await supabase.from('staff').insert({
            id: nextId, name: f.name, email: f.email.trim().toLowerCase(), role: f.role,
            device: f.device || f.name + ' Terminal', av: initials(f.name),
            tenant_id: TENANT, activated: false, pwh: null, session_v: 1,
          }); if (error) throw error;
        }
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not save staff.'); }
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  async function forceReactivate() {
    if (!window.confirm(`Reset ${user.name}'s password? They must re-activate via the login page.`)) return;
    setSaving(true);
    try {
      const r = await fetch('/api/crm/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', id: user.id }) });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('staff').update({ pwh: null, activated: false, otp_hash: null, otp_expires: null, session_v: 1 }).eq('id', user.id);
        if (error) throw error;
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not reset.'); }
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  async function remove() {
    if (!window.confirm(`Remove staff account for ${user.name}?`)) return;
    setSaving(true);
    try {
      const r = await fetch('/api/crm/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: user.id }) });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('staff').delete().eq('id', user.id);
        if (error) throw error;
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not remove.'); }
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  const field = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 4, background: '#FFFDF8', width: '100%', fontSize: 13, minHeight: 42, color: 'var(--iv-ink)' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(43,39,34,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-5 pb-4 iv-divider">{isEdit ? `Edit — ${user.name}` : 'Add Staff Account'}</h3>
        {!isEdit && <div className="mb-4 text-sm" style={{ color: '#3C6B4A', background: 'rgba(60,107,74,0.07)', border: '1px solid rgba(60,107,74,0.18)', borderRadius: 8, padding: '8px 12px' }}>
          Staff set their own password via <strong>Activate Account</strong> on the login page.</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div><label style={lbl}>Full Name *</label><input style={field} value={f.name} onChange={set('name')} autoFocus /></div>
          <div><label style={lbl}>Role *</label><select style={field} value={f.role} onChange={set('role')}>{ROLE_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <div className="mb-4"><label style={lbl}>Work Email *</label><input type="email" style={field} value={f.email} onChange={set('email')} placeholder="staff@hotel.com" /></div>
        <div className="mb-4"><label style={lbl}>Device / Terminal</label><input style={field} value={f.device} onChange={set('device')} placeholder="e.g. Front Desk Terminal" /></div>
        {err && <div className="mb-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}
        <div className="flex items-center justify-between gap-2 flex-wrap iv-foot">
          <div className="flex gap-2">
            {isEdit && <button className="iv-btn iv-btn--ghost" style={{ color: '#A23B4E' }} onClick={remove} disabled={saving}>Remove</button>}
            {isEdit && <button className="iv-btn iv-btn--ghost" onClick={forceReactivate} disabled={saving}>Reset Password</button>}
          </div>
          <div className="flex gap-2">
            <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save' : 'Add Staff'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
