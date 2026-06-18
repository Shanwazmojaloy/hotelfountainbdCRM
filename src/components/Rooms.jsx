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
import { getSnap, warmSnap, setSnap } from '@/lib/snap';
import { useAuth } from './AuthGate';
import { can } from '@/lib/permissions';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');

// Design-system status hues (RoomTile).
const STATUS = {
  AVAILABLE:    { c: '#15803D', label: 'Available' },
  OCCUPIED:     { c: '#1D4ED8', label: 'Occupied' },
  DIRTY:        { c: '#B45309', label: 'Dirty' },
  OUT_OF_ORDER: { c: '#B91C1C', label: 'Out of Order' },
  RESERVED:     { c: '#6D28D9', label: 'Reserved' },
};

// hex (#RRGGBB) → rgba(...) for the status-tinted glass tiles
const tint = (hex, a) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function Rooms() {
  const { user } = useAuth();
  // Housekeeping updates room STATUS only — never opens the folio (guest billing) (RBAC 2026-06-10).
  const canFolio = can(user?.role, 'viewGuestDetails');
  const _cached = getSnap('rooms'); // hot tier — instant tab→tab revisits
  const [rooms, setRooms] = useState(_cached?.rooms || []);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(!_cached);
  const [statusRoom, setStatusRoom] = useState(null);
  const [folioRoom, setFolioRoom] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [reservations, setReservations] = useState(_cached?.reservations || []);
  const [guests, setGuests] = useState(_cached?.guests || []);

  useEffect(() => {
    if (!getSnap('rooms')) {
      const warm = warmSnap('rooms'); // localStorage tier — instant paint after full reload
      if (warm) { setRooms(warm.rooms || []); setReservations(warm.reservations || []); setGuests(warm.guests || []); setLoading(false); }
    }
    fetchRooms();
  }, []);

  async function fetchRooms() {
    if (!getSnap('rooms')) setLoading(true); // revisits refresh silently behind cached tiles
    try {
      const supabase = getSupabaseClient();
      // C3: reservations + guests via session-gated route; rooms stays on anon.
      const [{ data: rm }, resR, gR] = await Promise.all([
        supabase.from('rooms').select('id, room_number, status, category, price').order('room_number', { ascending: true }),
        fetch('/api/crm/data?resource=reservations&status_in=CHECKED_IN,RESERVED&limit=5000'),
        fetch('/api/crm/data?resource=guests&limit=5000'),
      ]);
      const res = (await resR.json().catch(() => ({}))).rows || [];
      const g = (await gR.json().catch(() => ({}))).rows || [];
      setRooms(rm || []);
      setReservations(res);
      setGuests(g);
      setSnap('rooms', { rooms: rm || [], reservations: res, guests: g });
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }} className="iv-stat-grid iv-stagger">
        {statCards.map((s) => (
          <div key={s.k} style={{ background: '#fff', border: '1px solid var(--iv-border)', borderRadius: 12, boxShadow: 'var(--iv-card-shadow)', padding: '14px 18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: s.c, boxShadow: `0 0 0 3px ${s.c}22` }} />
              <span style={{ fontSize: 12, letterSpacing: '.01em', color: '#64748B', fontWeight: 500 }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 26, fontWeight: 700, color: 'var(--iv-ink)', lineHeight: 1.1, marginTop: 8, letterSpacing: '-.02em' }}>{loading ? '—' : (counts[s.k] || 0)}</div>
          </div>
        ))}
      </div>

      {/* Floor plan card */}
      <section style={{ background: '#fff', border: '1px solid var(--iv-border)', borderRadius: 12, boxShadow: 'var(--iv-card-shadow)', overflow: 'hidden' }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--iv-head)', fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)', letterSpacing: '-.01em' }}>Floor <em style={{ fontStyle: 'normal', color: 'var(--iv-gold)', fontWeight: 700 }}>Plan</em></h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', fontFamily: 'var(--iv-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.01em', padding: '3px 10px', borderRadius: 999, color: 'var(--iv-gold)', background: 'rgba(139,105,20,.08)', border: '1px solid rgba(139,105,20,.22)' }}>{filtered.length} rooms</span>
            {canFolio && <button className="iv-btn" onClick={() => setShowAddRoom(true)} style={{ fontSize: 12, padding: '5px 12px' }}>+ Add Room</button>}
          </div>
        </header>
        <div style={{ padding: '16px 18px' }}>
          {/* underline filter tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--iv-border)', marginBottom: 16, overflowX: 'auto' }} className="iv-tabbar">
            {tabs.map((s) => {
              const on = filter === s;
              const label = s === 'ALL' ? `All (${rooms.length})` : `${s.replace('_', ' ')} (${counts[s] || 0})`;
              return (
                <button key={s} onClick={() => setFilter(s)} style={{ padding: '10px 14px', fontFamily: 'var(--iv-body)', fontSize: 13, fontWeight: on ? 600 : 500, color: on ? 'var(--iv-gold)' : 'var(--iv-ink2)', letterSpacing: 0, textTransform: 'capitalize', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: `2px solid ${on ? 'var(--iv-gold)' : 'transparent'}`, marginBottom: -1, whiteSpace: 'nowrap', transition: 'color .2s var(--iv-ease), border-color .2s var(--iv-ease)' }}>{label.toLowerCase()}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--iv-ink3)', marginBottom: 10, letterSpacing: '.02em' }}>
            Tip — click any room to open its folio (occupied) or change its status.
          </div>

          {loading && <div className="iv-stat__sub">Loading rooms…</div>}
          {!loading && filtered.length === 0 && <div className="iv-stat__sub">No rooms in this status.</div>}

          <div className="iv-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
            {filtered.map((room) => {
              const st = STATUS[room.status] || { c: '#94A3B8', label: room.status };
              return (
                <div
                  key={room.id}
                  onClick={() => { if (room.status === 'OCCUPIED' && canFolio) setFolioRoom(room); else setStatusRoom(room); }}
                  style={{
                    background: `linear-gradient(135deg, ${tint(st.c, 0.13)}, ${tint(st.c, 0.04)}), #ffffff`,
                    border: `1px solid ${tint(st.c, 0.28)}`,
                    borderTop: `3px solid ${st.c}`,
                    borderRadius: 8,
                    padding: 12,
                    cursor: 'pointer',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,.55), 0 3px 12px ${tint(st.c, 0.12)}`,
                    transition: 'box-shadow .15s var(--iv-ease), transform .15s var(--iv-ease)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,.6), 0 10px 24px ${tint(st.c, 0.30)}`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,.55), 0 3px 12px ${tint(st.c, 0.12)}`; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="iv-mono" style={{ fontSize: 17, fontWeight: 700, color: 'var(--iv-ink)' }}>{room.room_number}</span>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: st.c, marginTop: 5, boxShadow: `0 0 0 3px ${tint(st.c, 0.18)}` }} />
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
