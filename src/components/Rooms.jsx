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

// Design-system status hues (RoomTile).
const STATUS = {
  AVAILABLE:    { c: '#15803D', label: 'Available' },
  OCCUPIED:     { c: '#1D4ED8', label: 'Occupied' },
  DIRTY:        { c: '#B45309', label: 'Dirty' },
  OUT_OF_ORDER: { c: '#B91C1C', label: 'Out of Order' },
  RESERVED:     { c: '#6D28D9', label: 'Reserved' },
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

  const statCards = [
    { label: 'Available', k: 'AVAILABLE', c: '#15803D' },
    { label: 'Occupied', k: 'OCCUPIED', c: '#1D4ED8' },
    { label: 'Needs Cleaning', k: 'DIRTY', c: '#B45309' },
    { label: 'Out of Order', k: 'OUT_OF_ORDER', c: '#B91C1C' },
  ];

  return (
    <div>
      {/* Status stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }} className="iv-stat-grid">
        {statCards.map((s) => (
          <div key={s.k} style={{ background: '#fff', border: '1px solid var(--iv-border)', borderTop: `3px solid ${s.c}`, padding: '14px 18px 16px' }}>
            <div style={{ fontSize: 8, letterSpacing: '.16em', color: 'var(--iv-ink3)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 26, fontWeight: 600, color: 'var(--iv-ink)', lineHeight: 1.1, marginTop: 8 }}>{loading ? '—' : (counts[s.k] || 0)}</div>
          </div>
        ))}
      </div>

      {/* Floor plan card */}
      <section style={{ background: '#fff', border: '1px solid var(--iv-border)', borderTop: '3px solid var(--iv-side)', overflow: 'hidden' }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--iv-head)', fontSize: 16, fontWeight: 700, color: 'var(--iv-ink)' }}>Floor <em style={{ fontStyle: 'italic', color: 'var(--iv-gold)', fontWeight: 400 }}>Plan</em></h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', fontFamily: 'var(--iv-body)', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 2, color: '#8B6914', background: 'rgba(139,105,20,.08)', border: '1px solid rgba(139,105,20,.24)' }}>{filtered.length} rooms</span>
            <button className="iv-btn" onClick={() => setShowAddRoom(true)} style={{ fontSize: 9.5, padding: '5px 12px' }}>+ Add Room</button>
          </div>
        </header>
        <div style={{ padding: '16px 18px' }}>
          {/* underline filter tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--iv-side)', marginBottom: 16, overflowX: 'auto' }}>
            {tabs.map((s) => {
              const on = filter === s;
              const label = s === 'ALL' ? `All (${rooms.length})` : `${s.replace('_', ' ')} (${counts[s] || 0})`;
              return (
                <button key={s} onClick={() => setFilter(s)} style={{ padding: '9px 16px', fontFamily: 'var(--iv-body)', fontSize: 11, fontWeight: on ? 700 : 500, color: on ? 'var(--iv-ink)' : 'var(--iv-ink3)', letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', background: on ? '#fff' : 'transparent', border: 'none', borderBottom: `2px solid ${on ? 'var(--iv-side)' : 'transparent'}`, marginBottom: -2, whiteSpace: 'nowrap' }}>{label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--iv-ink3)', marginBottom: 10, letterSpacing: '.02em' }}>
            Tip — click any room to open its folio (occupied) or change its status.
          </div>

          {loading && <div className="iv-stat__sub">Loading rooms…</div>}
          {!loading && filtered.length === 0 && <div className="iv-stat__sub">No rooms in this status.</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
            {filtered.map((room) => {
              const st = STATUS[room.status] || { c: '#9A8070', label: room.status };
              return (
                <div
                  key={room.id}
                  onClick={() => { if (room.status === 'OCCUPIED') setFolioRoom(room); else setStatusRoom(room); }}
                  style={{ background: '#fff', border: '1px solid var(--iv-border)', borderTop: `3px solid ${st.c}`, padding: 12, cursor: 'pointer', transition: 'box-shadow .15s var(--iv-ease)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--iv-shadow-stat)')}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="iv-mono" style={{ fontSize: 17, fontWeight: 500, color: 'var(--iv-ink)' }}>{room.room_number}</span>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: st.c, marginTop: 5 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--iv-ink3)', marginTop: 6 }}>{room.category || 'Standard'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                    <span style={{ fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, color: st.c }}>{st.label}</span>
                    <span className="iv-mono" style={{ fontSize: 11, color: 'var(--iv-gold)' }}>{bdt(room.price)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

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
