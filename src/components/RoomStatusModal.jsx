'use client';

// RoomStatusModal — WRITE flow: change a room's housekeeping/maintenance status.
// Only offered for NON-occupied rooms (occupied/reserved are reservation-driven and
// stay managed in the main CRM). Updates rooms.status. Non-money.
import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

// Safe, non-reservation statuses only (no OCCUPIED/RESERVED — those follow bookings).
const OPTIONS = [
  { v: 'AVAILABLE', label: 'Available', c: '#4A7C59' },
  { v: 'DIRTY', label: 'Dirty', c: '#D9A441' },
  { v: 'OUT_OF_ORDER', label: 'Out of Order', c: '#C0566A' },
];

export default function RoomStatusModal({ room, onClose, onSaved }) {
  const [status, setStatus] = useState(OPTIONS.some((o) => o.v === room.status) ? room.status : 'AVAILABLE');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/crm/room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: room.id, status }),
      });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from('rooms').update({ status }).eq('id', room.id);
        if (error) throw error;
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not update status.'); }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(43,39,34,0.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 420 }}>
        <h3 className="text-xl mb-1">Room {room.room_number}</h3>
        <div className="iv-stat__sub mb-5 pb-4 iv-divider">{room.category || 'Standard'} · set housekeeping status</div>

        <div className="grid grid-cols-1 gap-2 mb-4">
          {OPTIONS.map((o) => (
            <button key={o.v} onClick={() => setStatus(o.v)}
              className="flex items-center gap-3 text-left"
              style={{ padding: '10px 14px', border: `1px solid ${status === o.v ? o.c : '#E0D8C8'}`,
                borderRadius: 8, background: status === o.v ? `${o.c}14` : '#FFFDF8' }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: o.c, display: 'inline-block' }} />
              <span style={{ color: '#2B2722', fontSize: 14 }}>{o.label}</span>
              {status === o.v && <span className="ml-auto" style={{ color: o.c, fontSize: 13 }}>✓</span>}
            </button>
          ))}
        </div>

        {err && <div className="mb-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}

        <div className="flex justify-end gap-3">
          <button className="iv-btn iv-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="iv-btn" onClick={save} disabled={saving || status === room.status}>{saving ? 'Saving…' : 'Update Status'}</button>
        </div>
      </div>
    </div>
  );
}
