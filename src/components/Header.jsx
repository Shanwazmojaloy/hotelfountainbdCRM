'use client';

// Header / Topbar — Aurora/Orbix shell (2026-07-04). Replaces the old sidebar entirely:
// brand mark, RBAC pill nav (active = lime pill w/ label, others icon-only), live Dhaka
// clock, notif bell (web-booking requests), lime "+ New Booking" (works from ANY page),
// user chip + sign-out. Mobile keeps BottomNav; pills hide below md.
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getSnap } from '@/lib/snap';
import { useAuth } from './AuthGate';
import { canAccess } from '@/lib/permissions';
import NewReservationModal from './NewReservationModal';

const TITLES = {
  '/crm': ['Operations', 'Dashboard'],
  '/crm/rooms': ['Room', 'Management'],
  '/crm/reservations': ['Guest', 'Reservations'],
  '/crm/guests': ['Guests &', 'CRM'],
  '/crm/housekeeping': ['Housekeeping', 'Board'],
  '/crm/restaurant': ['Restaurant', ''],
  '/crm/reports': ['Performance', 'Reports'],
  '/crm/growth': ['Growth', 'Pipeline'],
  '/crm/settings': ['System', 'Settings'],
};

// Pill nav — all 8 sections, RBAC-filtered. Active page renders as the lime pill with
// its label; the rest collapse to icon pills with tooltips (Orbix top-nav pattern).
const PILLS = [
  { href: '/crm', icon: '⌂', label: 'Dashboard', exact: true },
  { href: '/crm/rooms', icon: '▦', label: 'Rooms' },
  { href: '/crm/reservations', icon: '◈', label: 'Reservations' },
  { href: '/crm/guests', icon: '◉', label: 'Guests' },
  { href: '/crm/housekeeping', icon: '✦', label: 'Housekeeping' },
  { href: '/crm/restaurant', icon: '🍽', label: 'Restaurant' },
  // Billing tab REMOVED (owner decision 2026-07-31): redundant — payments are recorded
  // from Dashboard/Rooms/Reservations modals, reports cover the numbers. Route
  // /crm/billing now redirects to /crm (bookmarks safe).
  { href: '/crm/reports', icon: '▤', label: 'Reports' },
  // Growth = OUR sales pipeline (Hotel Growth OS), not hotel ops. canAccess() only clears it
  // for owner/admin, so this pill is invisible to every operational role.
  { href: '/crm/growth', icon: '◎', label: 'Growth' },
  // Subscriber Access = who is paying, across every tenant. PLATFORM route: canAccess()
  // requires the home tenant, not merely an owner role — see permissions.js.
  { href: '/crm/subscribers', icon: '❖', label: 'Subscriber Access' },
  { href: '/crm/settings', icon: '⚙', label: 'Settings' },
];
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase() || '?';

// Live notifications = PENDING web bookings (created by /api/book with source WEBSITE).
// Each is an actionable card: pick an available room → Confirm (→ RESERVED) or Cancel.
const fmtD = (d) => { try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return String(d).slice(0, 10); } };
const nightsOf = (ci, co) => { const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 1; };
const ago = (ts) => { const m = Math.max(1, Math.round((Date.now() - new Date(ts)) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const SEEN_KEY = 'lumea.notifseen.v1';
const getSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } };

function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const hit = Object.keys(TITLES).filter((k) => k !== '/crm').find((k) => pathname.startsWith(k));
  return hit ? TITLES[hit] : ['Operations', 'Console'];
}

export default function Header() {
  const pathname = usePathname() || '/crm';
  const router = useRouter();
  const { user, signOut } = useAuth();
  // New Booking + the booking-request bell are reservation actions — only for roles that
  // can access Reservations (receptionist + admin); hidden from housekeeping (RBAC 2026-06-10).
  const canBook = canAccess(user?.role, '/crm/reservations');
  const [meta, setMeta] = useState('');
  const [bell, setBell] = useState(false);
  const bellRef = useRef(null);
  const [showNew, setShowNew] = useState(false);
  const [bkRooms, setBkRooms] = useState([]);
  const [pending, setPending] = useState([]);      // PENDING web bookings
  const [notifRooms, setNotifRooms] = useState([]); // all rooms (for availability)
  const [clashes, setClashes] = useState([]);       // active reservations (overlap windows)
  const [seenTick, setSeenTick] = useState(0);      // re-render after Clear
  const [pick, setPick] = useState({});             // res.id -> chosen room_number
  const [busyId, setBusyId] = useState(null);

  async function loadNotifs() {
    try {
      const supabase = getSupabaseClient();
      const [pR, { data: rms }, aR] = await Promise.all([
        // PERF (2026-07-21): project both reservations fetches — this bell mounts on EVERY /crm
        // page. Pending list renders only these fields; the "clashes" set is used solely for
        // room-overlap detection so it needs just check_in/check_out/room_ids (was ~352KB unprojected).
        fetch('/api/crm/data?resource=reservations&status=PENDING&order=created_at.desc&limit=20&cols=id,guest_name,source,created_at,check_in,check_out,guests,room_type,phone,email,total_amount'),
        supabase.from('rooms').select('room_number, category, price, status').order('room_number'),
        fetch('/api/crm/data?resource=reservations&status_in=RESERVED,CHECKED_IN,CONFIRMED&cols=check_in,check_out,room_ids'),
      ]);
      const p = (await pR.json().catch(() => ({}))).rows || [];
      const act = (await aR.json().catch(() => ({}))).rows || [];
      setPending(p); setNotifRooms(rms || []); setClashes(act);
    } catch (e) { console.error('[Header] notif fetch:', e); }
  }
  // PERF (2026-08-15): gate the poll on tab visibility. This bell mounts on EVERY /crm page
  // and fired 2x /api/crm/data every 60s even in a backgrounded tab — ~86k Vercel function
  // invocations/month from a single tab left open overnight, which is the dominant consumer
  // of the Hobby Fluid Active CPU allowance (all 13 crons combined are ~260/month).
  // Refresh on regaining focus so the bell is never stale when it is actually being looked at.
  useEffect(() => {
    loadNotifs();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadNotifs();
    }, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') loadNotifs(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // rooms free for THIS booking's window: not OUT_OF_ORDER, no overlapping active stay
  const freeRoomsFor = (res) => {
    const taken = new Set();
    clashes.forEach((c) => {
      if (String(c.check_in) < String(res.check_out) && String(c.check_out) > String(res.check_in)) {
        (c.room_ids || []).forEach((rn) => taken.add(String(rn)));
      }
    });
    return notifRooms.filter((r) => r.status !== 'OUT_OF_ORDER' && !taken.has(String(r.room_number)));
  };

  async function actOn(res, kind) {
    setBusyId(res.id);
    try {
      const payload = kind === 'confirm'
        ? { action: 'confirm', id: res.id, room_ids: [pick[res.id]].filter(Boolean) }
        : { action: 'cancel_pending', id: res.id };
      const r = await fetch('/api/crm/reservation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'Action failed.');
      await loadNotifs();
    } catch (e) { alert(e.message || String(e)); } finally { setBusyId(null); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seenSet = useMemo(() => getSeen(), [seenTick, pending]);
  const unseen = pending.filter((p) => !seenSet.has(p.id)).length;
  const clearNotifs = () => {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(pending.map((p) => p.id))); } catch { /* ignore */ }
    setSeenTick((v) => v + 1);
  };

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

  // Mobile bottom-nav "+" (and any page) can summon the global New Booking modal.
  useEffect(() => {
    const open = () => { if (canBook) openNewBooking(); };
    window.addEventListener('lumea:global-new-booking', open);
    return () => window.removeEventListener('lumea:global-new-booking', open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBook, pathname]);

  const [t0, t1] = titleFor(pathname);
  const visiblePills = PILLS.filter((p) => canAccess(user?.role, p.href, user?.tenant_id));

  return (
    <div className="iv-topbar" style={{ height: 62, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8, position: 'sticky', top: 0, zIndex: 20 }}>
      {/* Brand mark — company gold crest (owner request 2026-07-04).
          TENANT-AWARE since 2026-08-19: this was hardcoded "Hotel Fountain / Luxury In
          Comfort" for EVERY tenant, so a demo client signed in and saw our hotel's name
          and crest on their own CRM. The crest is Hotel Fountain's property and is not
          shipped to other tenants; they get a monogram of their own name instead. */}
      {(() => {
        const isHome = !user?.hotel_name || user.hotel_name === 'Hotel Fountain';
        const mark = String(user?.hotel_name || 'Hotel Fountain').trim().split(/\s+/).slice(0, 2)
          .map((w) => w[0] || '').join('').toUpperCase();
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, marginRight: 4 }}>
            {isHome ? (
              <img src="/logo-crest.png" alt="Hotel Fountain" style={{ height: 40, width: 'auto', objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 8px rgba(200,169,110,.35))' }} />
            ) : (
              <div aria-hidden style={{ height: 36, width: 36, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(223,255,69,.12)', border: '1px solid rgba(223,255,69,.35)', color: '#DFFF45', fontWeight: 700, fontSize: 13, letterSpacing: '.02em' }}>{mark}</div>
            )}
            <div className="hidden lg:block" style={{ lineHeight: 1.05 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--iv-ink)', whiteSpace: 'nowrap' }}>
                {user?.hotel_name || 'Hotel Fountain'}
              </div>
              <div style={{ fontSize: 8, letterSpacing: '.18em', color: 'var(--iv-ink3)', textTransform: 'uppercase', marginTop: 2 }}>
                {isHome ? 'Luxury In Comfort' : (user?.hotel_city || 'Hotel Growth OS')}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pill nav — desktop. Text labels (owner request 2026-07-04), no glyph icons. */}
      <nav className="hidden md:flex" style={{ alignItems: 'center', gap: 5, flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none', padding: '2px 0' }}>
        {visiblePills.map((p) => {
          const on = p.exact ? pathname === p.href : pathname === p.href || pathname.startsWith(p.href + '/');
          return (
            <Link key={p.href} href={p.href} className={`fx-pill${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
              {p.label}
            </Link>
          );
        })}
      </nav>
      {/* Page title — mobile only (pills hidden) */}
      <div className="flex-1 md:hidden" style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t0}{t1 && <em style={{ fontStyle: 'normal', color: 'var(--iv-gold)' }}> {t1}</em>}
        </div>
      </div>

      {/* Dhaka clock — wide screens only */}
      <div className="iv-mono hidden xl:block" style={{ fontSize: 9, color: 'var(--iv-ink3)', letterSpacing: '.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>{meta}</div>
      {canBook && (
        <button className="iv-btn" onClick={openNewBooking} style={{ fontSize: 12.5, padding: '8px 16px', flexShrink: 0, borderRadius: 999 }}>
          <span className="sm:hidden">+</span>
          <span className="hidden sm:inline">+ New Booking</span>
        </button>
      )}
      {showNew && (
        <NewReservationModal rooms={bkRooms} onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); router.push('/crm/reservations'); }} />
      )}
      {canBook && <div ref={bellRef} style={{ position: 'relative' }}>
        <div onClick={() => { setBell((v) => !v); loadNotifs(); }} className="fx-round" style={{ position: 'relative', boxShadow: bell ? '0 0 0 3px var(--iv-glow)' : 'none', borderColor: bell ? 'var(--iv-gold)' : undefined }}>
          🔔
          {unseen > 0 && (
            <span className="iv-ping" style={{ position: 'absolute', top: 1, right: 1, minWidth: 15, height: 15, padding: '0 3px', background: '#F0559C', border: '1.5px solid #131118', borderRadius: 999, color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--iv-body)' }}>{unseen}</span>
          )}
        </div>
        {bell && (
          <div style={{ position: 'absolute', top: 46, right: 0, width: 372, maxWidth: 'calc(100vw - 24px)', background: 'rgba(21,19,27,.97)', backdropFilter: 'blur(18px)', border: '1px solid var(--iv-border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.55)', zIndex: 100, animation: 'bellFadeIn .22s var(--iv-ease) both', transformOrigin: 'top right' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)' }}>
              <span style={{ fontFamily: 'var(--iv-head)', fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)' }}>Booking Requests</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pending.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--iv-rose-fg)', background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.2)', borderRadius: 999, padding: '2px 9px' }}>{pending.length} pending</span>}
                <button onClick={clearNotifs} style={{ fontSize: 11, fontWeight: 600, color: 'var(--iv-ink3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
              </div>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {pending.length === 0 && (
                <div style={{ padding: '22px 16px', textAlign: 'center', color: 'var(--iv-ink3)', fontSize: 12 }}>No new booking requests. 🎉</div>
              )}
              {pending.map((p) => {
                const free = freeRoomsFor(p);
                const n = nightsOf(p.check_in, p.check_out);
                return (
                  <div key={p.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--iv-border2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--iv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.guest_name || 'Guest'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--iv-gold)', background: 'rgba(223,255,69,.1)', border: '1px solid rgba(223,255,69,.28)', borderRadius: 999, padding: '1px 7px' }}>{p.source || 'WEB'}</span>
                        <span className="iv-mono" style={{ fontSize: 9, color: 'var(--iv-ink3)' }}>{ago(p.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--iv-ink2)', marginTop: 3 }}>
                      {fmtD(p.check_in)} → {fmtD(p.check_out)} · {n} night{n !== 1 ? 's' : ''} · {p.guests || 1} guest{(p.guests || 1) !== 1 ? 's' : ''}{p.room_type ? ` · ${p.room_type}` : ''}
                    </div>
                    {(p.phone || p.email) && <div style={{ fontSize: 10.5, color: 'var(--iv-ink3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[p.phone, p.email].filter(Boolean).join(' · ')}</div>}
                    {+p.total_amount > 0 && <div className="iv-mono" style={{ fontSize: 11, color: 'var(--iv-gold)', marginTop: 2 }}>Quoted ৳{Number(p.total_amount).toLocaleString('en-US')}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <select className="iv-input" value={pick[p.id] || ''} onChange={(e) => setPick((m) => ({ ...m, [p.id]: e.target.value }))} style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}>
                        <option value="">— assign room —</option>
                        {free.map((r) => <option key={r.room_number} value={r.room_number}>{r.room_number} · {r.category} · ৳{Number(r.price || 0).toLocaleString('en-US')}/n</option>)}
                      </select>
                      <button className="iv-btn" disabled={!pick[p.id] || busyId === p.id} style={{ fontSize: 11.5, padding: '6px 10px' }} onClick={() => actOn(p, 'confirm')}>{busyId === p.id ? '…' : '✓ Confirm'}</button>
                      <button className="iv-btn iv-btn--danger" disabled={busyId === p.id} style={{ fontSize: 11.5, padding: '6px 10px' }} onClick={() => { if (window.confirm(`Cancel ${p.guest_name || 'this'} booking request?`)) actOn(p, 'cancel'); }}>✕</button>
                    </div>
                    {free.length === 0 && <div style={{ fontSize: 10, color: 'var(--iv-rose-fg)', marginTop: 4 }}>No rooms free for these dates.</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--iv-ink3)' }}>Confirm → Reserved · arrival → Check-In · departure → Check-Out</div>
          </div>
        )}
      </div>}

      {/* User chip (replaces the old sidebar footer) */}
      <div className="hidden sm:flex" style={{ alignItems: 'center', gap: 9, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 999, padding: '4px 12px 4px 5px', flexShrink: 0 }}>
        <span style={{ width: 28, height: 28, borderRadius: 999, background: 'linear-gradient(135deg,#B384F5,#7C4BC9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{initials(user?.name)}</span>
        <div style={{ lineHeight: 1.1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--iv-ink)', whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Staff'}</div>
          <div style={{ fontSize: 7.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginTop: 1 }}>{user?.role || ''}</div>
        </div>
      </div>

      {/* Sign out — visible labeled button (owner request 2026-07-04), rose tint so it can't be missed */}
      <button className="fx-signout" onClick={signOut} title="Sign out" aria-label="Sign out">
        <span aria-hidden="true" style={{ fontSize: 14 }}>⏻</span>
        <span className="hidden md:inline">Sign Out</span>
      </button>
    </div>
  );
}
