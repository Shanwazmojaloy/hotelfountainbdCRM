'use client';

// Rooms (Room Matrix) — ported from legacy crm-src.jsx RoomsPage.
// Filters + status legend + room-card grid reading live `rooms`. Clicking an OCCUPIED
// room opens its folio (RoomFolioModal); other rooms open the status changer. Add Room
// opens RoomFormModal. All writes go through the modal components.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import RoomStatusModal from './RoomStatusModal';
import RoomFormModal from './RoomFormModal';
import RoomFolioModal from './RoomFolioModal';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');

const STATUS = {
  AVAILABLE:    { c: '#4A7C59', label: 'Available' },
  OCCUPIED:     { c: '#3884B4', label: 'Occupied' },
  DIRTY:        { c: '#D9A441', label: 'Dirty' },
  OUT_OF_ORDER: { c: '#C0566A', label: 'Out of Order' },
  RESERVED:     { c: '#8B6FB0', label: 'Reserved' },
};

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [statusRoom, setStatusRoom] = useState(null);
  const [folioRoom, setFolioRoom] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [guests, setGuests] = useState([]);

  useEffect(() => { fetchRooms(); }, []);

  async function fetchRooms() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: rm }, { data: res }, { data: g }] = await Promise.all([
        supabase.from('rooms').select('id, room_number, status, category, price').order('room_number', { ascending: true }),
        supabase.from('reservations').select('*').in('status', ['CHECKED_IN', 'RESERVED']).limit(5000),
        supabase.from('guests').select('id, name').limit(5000),
      ]);
      setRooms(rm || []);
      setReservations(res || []);
      setGuests(g || []);
    } catch (e) {
      console.error('[Rooms] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const counts = rooms.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const filtered = filter === 'ALL' ? rooms : rooms.filter((r) => r.status === filter);
  const tabs = ['ALL', 'AVAILABLE', 'OCCUPIED', 'DIRTY', 'OUT_OF_ORDER', 'RESERVED'];

  return (
    <div>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Room Matrix</h1>

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={filter === s ? 'iv-btn' : 'iv-btn iv-btn--ghost'}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {s === 'ALL' ? `All (${rooms.length})` : `${s.replace('_', ' ')} (${counts[s] || 0})`}
            </button>
          ))}
        </div>
        <button className="iv-btn" onClick={() => setShowAddRoom(true)}>+ Add Room</button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-6 flex-wrap text-xs" style={{ color: '#8A7F6E' }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span style={{ width: 9, height: 9, borderRadius: 99, background: v.c, display: 'inline-block' }} />
            {v.label}
          </span>
        ))}
        <span style={{ marginLeft: 2 }}>· Click an occupied room to open its folio</span>
      </div>

      {loading && <div className="iv-stat__sub">Loading rooms…</div>}
      {!loading && filtered.length === 0 && <div className="iv-stat__sub">No rooms in this status.</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {filtered.map((room) => {
          const st = STATUS[room.status] || { c: '#8A7F6E', label: room.status };
          return (
            <button
              key={room.id}
              onClick={() => {
                if (room.status === 'OCCUPIED') { setFolioRoom(room); }
                else { setStatusRoom(room); }
              }}
              className="iv-card iv-card--hover text-left relative"
              style={{ borderTop: `3px solid ${st.c}`, padding: '14px 16px' }}
            >
              {room.status === 'OCCUPIED' && (
                <span className="absolute" style={{ top: 8, right: 8, fontSize: 8, background: 'rgba(56,132,180,0.15)', color: '#2E6A8E', borderRadius: 3, padding: '1px 6px' }}>FOLIO</span>
              )}
              <div className="iv-mono" style={{ fontSize: 22, fontWeight: 700, color: '#2B2722' }}>{room.room_number}</div>
              <div className="inline-flex items-center gap-1.5 mt-1 mb-1">
                <span style={{ width: 8, height: 8, borderRadius: 99, background: st.c, display: 'inline-block' }} />
                <span className="text-xs" style={{ color: st.c }}>{st.label}</span>
              </div>
              <div className="text-xs" style={{ color: '#8A7F6E' }}>{room.category || 'Standard'}</div>
              <div className="text-sm iv-mono mt-1" style={{ color: '#8B6914' }}>{bdt(room.price)}/night</div>
            </button>
          );
        })}
      </div>

      {statusRoom && (
        <RoomStatusModal room={statusRoom} onClose={() => setStatusRoom(null)} onSaved={fetchRooms} />
      )}
      {folioRoom && (
        <RoomFolioModal room={folioRoom} reservations={reservations} rooms={rooms} guests={guests}
          onClose={() => setFolioRoom(null)} onSaved={fetchRooms} />
      )}
      {showAddRoom && (
        <RoomFormModal existingRooms={rooms} onClose={() => setShowAddRoom(false)} onSaved={fetchRooms} />
      )}
    </div>
  );
}
