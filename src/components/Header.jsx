'use client';

// Header / Topbar — modern SaaS. White bar, per-page title (indigo accent word), live Dhaka
// clock, global "+ New Booking" (opens the Check-In modal from ANY page), notif bell.
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getSnap } from '@/lib/snap';
import NewReservationModal from './NewReservationModal';

const TITLES = {
  '/crm': ['Operations', 'Dashboard'],
  '/crm/rooms': ['Room', 'Management'],
  '/crm/reservations': ['Guest', 'Reservations'],
  '/crm/guests': ['Guests &', 'CRM'],
  '/crm/housekeeping': ['Housekeeping', 'Board'],
  '/crm/billing': ['Billing &', 'Invoices'],
  '/crm/reports': ['Performance', 'Reports'],
  '/crm/settings': ['System', 'Settings'],
};

const NOTIFS = [
  { icon: '✈', tone: 'var(--iv-in-fg)', title: 'Arrival due', body: 'Guest checking in this afternoon — desk ready', time: '8m ago' },
  { icon: '⚠', tone: 'var(--iv-rose-fg)', title: 'Balance due', body: 'Outstanding folio flagged for follow-up', time: '26m ago' },
  { icon: '✦', tone: 'var(--iv-due-fg)', title: 'Housekeeping', body: 'A room is flagged for deep clean — unassigned', time: '1h ago' },
  { icon: '🔑', tone: 'var(--iv-in-fg)', title: 'Checked out', body: 'Folio settled and room released', time: '2h ago' },
];

function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const hit = Object.keys(TITLES).filter((k) => k !== '/crm').find((k) => pathname.startsWith(k));
  return hit ? TITLES[hit] : ['Operations', 'Console'];
}

export default function Header() {
  const pathname = usePathname() || '/crm';
  const router = useRouter();
  const [meta, setMeta] = useState('');
  const [bell, setBell] = useState(false);
  const bellRef = useRef(null);
  const [showNew, setShowNew] = useState(false);
  const [bkRooms, setBkRooms] = useState([]);

  // Global New Booking: on the Reservations page reuse its own modal (event); anywhere else
  // open the modal RIGHT HERE — seeded from the snap cache so it's instant, then refreshed.
  function openNewBooking() {
    if (pathname === '/crm/reservations') { window.dispatchEvent(new CustomEvent('lumea:new-booking')); return; }
    const cached = getSnap('rooms')?.rooms || getSnap('reservations')?.allRooms || [];
    if (cached.length) setBkRooms(cached);
    setShowNew(true);
    getSupabaseClient().from('rooms').select('id, room_number, status, category, price').order('room_number')
      .then(({ data }) => { if (data?.length) setBkRooms(data); });
  }

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const d = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(now);
      const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
      setMeta(`${d} · ${t}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const close = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setBell(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const [t0, t1] = titleFor(pathname);

  return (
    <div className="iv-topbar" style={{ height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px 0 24px', gap: 14, position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ fontFamily: 'var(--iv-head)', fontSize: 18, fontWeight: 700, color: 'var(--iv-ink)', flex: 1, letterSpacing: '.01em', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {t0}{t1 && <em style={{ fontStyle: 'normal', color: 'var(--iv-gold)', fontWeight: 700 }}> {t1}</em>}
      </div>
      <div className="iv-mono" style={{ fontSize: 9, color: 'var(--iv-ink3)', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{meta}</div>
      <button className="iv-btn" onClick={openNewBooking} style={{ fontSize: 12.5, padding: '7px 14px' }}>+ New Booking</button>
      {showNew && (
        <NewReservationModal rooms={bkRooms} onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); router.push('/crm/reservations'); }} />
      )}
      <div ref={bellRef} style={{ position: 'relative' }}>
        <div onClick={() => setBell((v) => !v)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${bell ? 'var(--iv-side)' : 'var(--iv-border)'}`, background: bell ? 'var(--iv-sunken)' : 'transparent', cursor: 'pointer', position: 'relative', fontSize: 15, color: 'var(--iv-ink3)', transition: 'border-color .2s var(--iv-ease), background .2s var(--iv-ease), box-shadow .2s var(--iv-ease)', boxShadow: bell ? '0 0 0 3px var(--iv-glow)' : 'none' }}>
          🔔
          <span style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, background: 'var(--iv-rose-fg)', border: '1.5px solid #fff', borderRadius: '50%', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--iv-body)' }}>{NOTIFS.length}</span>
        </div>
        {bell && (
          <div style={{ position: 'absolute', top: 40, right: 0, width: 320, background: '#fff', border: '1px solid var(--iv-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 48px rgba(15,23,42,.14)', zIndex: 100, animation: 'bellFadeIn .22s var(--iv-ease) both', transformOrigin: 'top right' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)' }}>
              <span style={{ fontFamily: 'var(--iv-head)', fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)' }}>Notifications</span>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.01em', color: 'var(--iv-rose-fg)', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.2)', borderRadius: 999, padding: '2px 9px' }}>{NOTIFS.length} new</span>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {NOTIFS.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--iv-border2)', cursor: 'pointer', transition: 'background .18s var(--iv-ease)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--iv-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: 15, color: n.tone, flexShrink: 0, lineHeight: 1.3 }}>{n.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--iv-ink)' }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--iv-ink2)', marginTop: 1, lineHeight: 1.4 }}>{n.body}</div>
                    <div className="iv-mono" style={{ fontSize: 9, color: 'var(--iv-ink3)', marginTop: 3 }}>{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--iv-ink3)' }}>Hotel Fountain · Dhaka</div>
          </div>
        )}
      </div>
    </div>
  );
}
