'use client';

// AddChargeModal — WRITE flow: add a folio charge to a reservation, then recompute the
// canonical total (non-incremental). Mirrors legacy AddChargeModal. Money-adjacent.
import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { recalcResTotal } from '@/lib/recalcResTotal';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const CATEGORIES = ['Room Charge', 'Room Service', 'Restaurant', 'Spa', 'Minibar', 'Laundry', 'Parking', 'Airport Transfer', 'Phone', 'Misc'];

export default function AddChargeModal({ roomNo, resId, onClose, onDone }) {
  const [cat, setCat] = useState('Room Service');
  const [amt, setAmt] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const a = parseFloat(amt);
    if (!a || a <= 0) return setErr('Enter a valid amount.');
    if (!resId) return setErr('No active reservation — cannot add charge.');
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/crm/folio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', room_number: roomNo, reservation_id: resId, description: desc || cat, category: cat, amount: a }),
      });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('folios').insert({ room_number: roomNo, reservation_id: resId, description: desc || cat, category: cat, amount: a, tenant_id: TENANT });
        if (error) throw error;
        await recalcResTotal(resId); // non-incremental canonical recompute
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not add charge.'); }
      onDone?.();
      onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  const field = { padding: '10px 12px', border: '1px solid var(--iv-border)', borderRadius: 8, background: '#fff', width: '100%', fontSize: 13, minHeight: 42, color: 'var(--iv-ink)' };
  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.6)', zIndex: 110,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-5 pb-4 iv-divider">Add Charge — Room {roomNo || '—'}</h3>
        <div className="mb-4"><label style={lbl}>Category</label>
          <select style={field} value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="mb-4"><label style={lbl}>Amount (৳) *</label><input type="number" style={field} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" autoFocus /></div>
        <div className="mb-4"><label style={lbl}>Description</label><input style={field} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional detail" /></div>
        {err && <div className="mb-3 text-sm" style={{ color: '#DC2626' }}>{err}</div>}
        <div className="flex justify-end gap-3 iv-foot">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add Charge'}</button>
        </div>
      </div>
    </div>
  );
}
