'use client';

// RoomFormModal — WRITE flow: add a room. Mirrors legacy AddRoomModal. Non-money.
import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const CATEGORIES = ['Fountain Deluxe', 'Premium Deluxe', 'Superior Deluxe', 'Twin Deluxe', 'Royal Suite'];

export default function RoomFormModal({ existingRooms = [], onClose, onSaved }) {
  const [f, setF] = useState({ room_number: '', category: 'Fountain Deluxe', price: 4000, status: 'AVAILABLE' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!f.room_number) return setErr('Room number is required.');
    if (existingRooms.some((r) => String(r.room_number) === String(f.room_number))) return setErr(`Room ${f.room_number} already exists.`);
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/crm/room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', room_number: f.room_number, category: f.category, price: +f.price || 0 }),
      });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('rooms').insert({ room_number: f.room_number, category: f.category, price: +f.price || 0, status: f.status, tenant_id: TENANT });
        if (error) throw error;
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not add room.'); }
      onSaved?.(); onClose?.();
    } catch (e) { setErr(e.message || String(e)); setSaving(false); }
  }

  const field = { padding: '8px 12px', border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8', width: '100%', fontSize: 14 };
  const lbl = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A7F6E', marginBottom: 4, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(43,39,34,0.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-5 pb-4 iv-divider">Add New Room</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div><label style={lbl}>Room Number *</label><input style={field} value={f.room_number} onChange={set('room_number')} placeholder="e.g. 601" autoFocus /></div>
          <div><label style={lbl}>Category</label>
            <select style={field} value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div><label style={lbl}>Rate (৳/night)</label><input type="number" style={field} value={f.price} onChange={set('price')} /></div>
          <div><label style={lbl}>Initial Status</label>
            <select style={field} value={f.status} onChange={set('status')}>{['AVAILABLE', 'OUT_OF_ORDER'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
          </div>
        </div>
        {err && <div className="mb-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}
        <div className="flex justify-end gap-3">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Room'}</button>
        </div>
      </div>
    </div>
  );
}
