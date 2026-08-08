'use client';

// RoomStatusModal — WRITE flow: change a room's housekeeping/maintenance status,
// and (ADMIN ONLY) edit the room's number / category / rate. Only offered for
// NON-occupied rooms (occupied/reserved are reservation-driven). Updates rooms.
import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from './AuthGate';
import { isAdmin, isOwnerAdmin } from '@/lib/permissions';
import { CATEGORIES } from './RoomFormModal';

// Safe, non-reservation statuses only (no OCCUPIED/RESERVED — those follow bookings).
const OPTIONS = [
  { v: 'AVAILABLE', label: 'Available', c: '#7BE04A' },
  { v: 'DIRTY', label: 'Dirty', c: '#F5A93B' },
  { v: 'OUT_OF_ORDER', label: 'Out of Order', c: '#FF6B6B' },
];

export default function RoomStatusModal({ room, onClose, onSaved }) {
  const { user } = useAuth();
  const admin = isAdmin(user?.role);
  const owner = isOwnerAdmin(user?.role); // stricter than `admin` — owner/admin only, NOT manager
  const [status, setStatus] = useState(OPTIONS.some((o) => o.v === room.status) ? room.status : 'AVAILABLE');
  const [roomNumber, setRoomNumber] = useState(room.room_number || '');
  const [category, setCategory] = useState(room.category || 'Fountain Deluxe');
  const [price, setPrice] = useState(room.price ?? 0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  const detailsChanged = admin && (
    String(roomNumber).trim() !== String(room.room_number || '') ||
    category !== (room.category || 'Fountain Deluxe') ||
    Number(price) !== Number(room.price || 0)
  );
  const nothingToSave = status === room.status && !detailsChanged;

  async function save() {
    if (admin && !String(roomNumber).trim()) { setErr('Room number is required.'); return; }
    setErr(''); setSaving(true);
    try {
      const payload = { action: 'update', id: room.id, status };
      if (admin) { payload.room_number = String(roomNumber).trim(); payload.category = category; payload.price = +price || 0; }
      const r = await fetch('/api/crm/room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) {
        // Legacy anon fallback (status only — detail edits require the session route).
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('rooms').update({ status }).eq('id', room.id);
        if (error) throw error;
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not save changes.'); }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  }

  async function deleteRoom() {
    if (!window.confirm(`Delete Room ${room.room_number}? This can't be undone.`)) return;
    setErr(''); setDeleting(true);
    try {
      const r = await fetch('/api/crm/room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: room.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'Could not delete room.');
      onSaved?.();
      onClose?.();
    } catch (e) {
      setErr(e.message || String(e));
      setDeleting(false);
    }
  }

  const field = { width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid var(--iv-border)', borderRadius: 8, padding: '9px 11px', color: 'var(--iv-ink)', fontSize: 14, fontFamily: 'var(--iv-body)' };
  const lbl = { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--iv-ink3)', marginBottom: 5, display: 'block' };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="text-xl mb-1">Room {room.room_number}</h3>
        <div className="iv-stat__sub mb-5 pb-4 iv-divider">{room.category || 'Standard'}{admin ? ' · edit details or set status' : ' · set housekeeping status'}</div>

        {/* ADMIN ONLY — edit room number / category / rate */}
        {admin && (
          <div className="mb-5 pb-5 iv-divider" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Room Number</label>
                <input style={field} value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} />
              </div>
              <div style={{ width: 130 }}>
                <label style={lbl}>Rate (৳/night)</label>
                <input style={field} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={lbl}>Category</label>
              <select style={field} value={category} onChange={(e) => setCategory(e.target.value)}>
                {(CATEGORIES.includes(category) ? CATEGORIES : [category, ...CATEGORIES]).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        <label style={lbl}>Housekeeping Status</label>
        <div className="grid grid-cols-1 gap-2 mb-4" style={{ marginTop: 6 }}>
          {OPTIONS.map((o) => (
            <button key={o.v} onClick={() => setStatus(o.v)}
              className="flex items-center gap-3 text-left"
              style={{ padding: '11px 14px', border: `1px solid ${status === o.v ? o.c : 'var(--iv-border)'}`,
                borderRadius: 10, background: status === o.v ? `${o.c}1f` : 'rgba(255,255,255,.04)', transition: 'border-color .18s var(--iv-ease), background .18s var(--iv-ease)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: o.c, display: 'inline-block' }} />
              <span style={{ color: 'var(--iv-ink)', fontSize: 14 }}>{o.label}</span>
              {status === o.v && <span className="ml-auto" style={{ color: o.c, fontSize: 13 }}>✓</span>}
            </button>
          ))}
        </div>

        {err && <div className="mb-3 text-sm" style={{ color: '#FF6B6B' }}>{err}</div>}

        <div className="flex items-center justify-between gap-3 iv-foot">
          {owner ? (
            <button title="Delete this room permanently" onClick={deleteRoom} disabled={saving || deleting}
              style={{ background: 'none', border: '1px solid rgba(255,107,107,.4)', borderRadius: 8, padding: '9px 14px', color: '#FF6B6B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {deleting ? 'Deleting…' : 'Delete Room'}
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving || deleting}>Cancel</button>
            <button className="iv-btn" onClick={save} disabled={saving || deleting || nothingToSave}>{saving ? 'Saving…' : (admin && detailsChanged ? 'Save Changes' : 'Update Status')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
