'use client';

// GuestFormModal — first WRITE flow ported to the Next.js app.
// Add (insert) or Edit (update) a guest. Non-money, low-risk. Mirrors legacy
// AddGuestModal / EditGuestModal. Uses the host-routed supabase client (RLS-scoped).
import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const ID_TYPES = ['NID', 'Passport', 'Driving License', 'Birth Certificate', 'Other'];

export default function GuestFormModal({ guest, onClose, onSaved }) {
  const isEdit = Boolean(guest && guest.id);
  const [f, setF] = useState({
    name: guest?.name || '', phone: guest?.phone || '', email: guest?.email || '',
    id_type: guest?.id_type || 'NID', id_number: guest?.id_number || guest?.id_card || '',
    nationality: guest?.nationality || '', city: guest?.city || '', address: guest?.address || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) return setErr('Full name is required.');
    if (!isEdit && !f.phone.trim()) return setErr('Contact number is required.');
    setErr(''); setSaving(true);
    try {
      const payload = {
        name: f.name.trim(),
        phone: f.phone?.trim() || null,
        email: f.email?.trim() || null,
        id_type: f.id_type,
        id_number: f.id_number?.trim() || null,
        nationality: f.nationality?.trim() || null,
        city: f.city?.trim() || null,
        address: f.address?.trim() || null,
      };
      // Phase 3: write through the session-gated server route (service role).
      const r = await fetch('/api/crm/guest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isEdit ? 'update' : 'create', id: guest?.id, ...payload }),
      });
      if (r.status === 401) {
        // Transition: session predates the cookie — fall back to direct write (allowed until anon revoke).
        const supabase = getSupabaseClient();
        if (isEdit) { const { error } = await supabase.from('guests').update(payload).eq('id', guest.id); if (error) throw error; }
        else { const { error } = await supabase.from('guests').insert({ ...payload, tenant_id: TENANT }); if (error) throw error; }
      } else {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || 'Could not save guest.');
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!isEdit) return;
    if (!window.confirm(`Delete guest "${guest.name}"? This cannot be undone.`)) return;
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/crm/guest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: guest.id }),
      });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('guests').delete().eq('id', guest.id);
        if (error) {
          if (/23503|foreign key|violates/i.test(error.message || '')) throw new Error('Cannot delete — this guest has billing, ledger or payment history. Remove or reassign those first.');
          throw error;
        }
      } else {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || 'Could not delete guest.');
      }
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  const field = { padding: '8px 12px', border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8', width: '100%', fontSize: 14 };
  const lbl = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A7F6E', marginBottom: 4, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(43,39,34,0.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-5 pb-4 iv-divider">{isEdit ? `Edit — ${guest.name}` : 'Add New Guest'}</h3>

        <div className="mb-3">
          <label style={lbl}>Full Name *</label>
          <input style={field} value={f.name} onChange={set('name')} placeholder="Guest full name" autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label style={lbl}>Contact Number {isEdit ? '' : '*'}</label><input style={field} value={f.phone} onChange={set('phone')} placeholder="+880…" /></div>
          <div><label style={lbl}>Email</label><input style={field} type="email" value={f.email} onChange={set('email')} placeholder="guest@email.com" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label style={lbl}>ID Type</label>
            <select style={field} value={f.id_type} onChange={set('id_type')}>{ID_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div><label style={lbl}>ID Number</label><input style={field} value={f.id_number} onChange={set('id_number')} placeholder="ID number" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label style={lbl}>Nationality</label><input style={field} value={f.nationality} onChange={set('nationality')} placeholder="e.g. Bangladeshi" /></div>
          <div><label style={lbl}>City</label><input style={field} value={f.city} onChange={set('city')} placeholder="Dhaka" /></div>
        </div>
        <div className="mb-4">
          <label style={lbl}>Address</label>
          <textarea style={{ ...field, minHeight: 56, resize: 'vertical' }} value={f.address} onChange={set('address')} placeholder="Full address" />
        </div>

        {err && <div className="mb-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}

        <div className="flex items-center justify-between gap-3">
          <div>
            {isEdit && (
              <button onClick={doDelete} disabled={saving}
                style={{ padding: '8px 14px', fontSize: 13, color: '#C0566A', background: 'transparent', border: '1px solid rgba(192,86,106,0.4)', borderRadius: 8 }}>
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Guest')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
