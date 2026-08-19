'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthGate';
import { canAccess } from '@/lib/permissions';

function Icon({ name }) {
  const p = {
    width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const paths = {
    home: <><path d="M3 9.5 12 3l9 6.5" /><path d="M5 21V10h14v11" /></>,
    dollar: <><line x1="12" y1="2.5" x2="12" y2="21.5" /><path d="M16.5 6.5C16 5 14.5 4 12.5 4h-1C9 4 7.5 5.3 7.5 7s1.5 3 4 3h1c2.5 0 4 1.3 4 3s-1.5 3-4 3h-1c-2 0-3.5-1-4-2.5" /></>,
    trend: <><path d="M3 7l6 6 4-4 8 8" /><path d="M21 17v-4h-4" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.2 2.7-5 5.5-5s5.5 1.8 5.5 5" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6" /><path d="M17 15c2.2.4 3.5 2 3.5 4" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
    bed: <><path d="M3 7v11M3 13h18v5M21 18v-4a3 3 0 0 0-3-3h-6v6" /><circle cx="7" cy="10.5" r="1.6" /></>,
    sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></>,
    gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
    grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
    utensils: <><path d="M5 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M7 12v9" /><path d="M17 3c-1.7 0-3 2-3 4.5S15.3 12 17 12v9" /></>,
  };
  return <svg {...p} aria-hidden="true">{paths[name]}</svg>;
}

const navItems = [
  { href: '/crm', icon: 'home', label: 'Dashboard' },
  { href: '/crm/reservations', icon: 'calendar', label: 'Bookings' },
  { href: '/crm/rooms', icon: 'bed', label: 'Rooms' },
  // Billing tab removed (owner decision 2026-07-31) — Reports takes the mobile slot.
  { href: '/crm/reports', icon: 'dollar', label: 'Reports' },
];

// Sections the 4-slot bar can't hold — reachable on phones via the "More" sheet.
const moreItems = [
  { href: '/crm/guests', icon: 'users', label: 'Guests & CRM' },
  { href: '/crm/housekeeping', icon: 'sparkle', label: 'Housekeeping' },
  { href: '/crm/restaurant', icon: 'utensils', label: 'Restaurant' },
  { href: '/crm/reports', icon: 'trend', label: 'Reports' },
  { href: '/crm/growth', icon: 'trend', label: 'Growth' },
  { href: '/crm/settings', icon: 'gear', label: 'Settings' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [more, setMore] = useState(false);
  const items = navItems.filter((item) => canAccess(user?.role, item.href, user?.tenant_id, user?.email));
  const extras = moreItems.filter((item) => canAccess(user?.role, item.href, user?.tenant_id, user?.email));
  const moreActive = extras.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));

  // Close the sheet whenever the route changes.
  useEffect(() => { setMore(false); }, [pathname]);

  return (
    <>
      {more && extras.length > 0 && (
        <div className="md:hidden" style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setMore(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,9,14,.55)' }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 57, background: 'rgba(19,17,24,.97)',
              borderTop: '1px solid rgba(255,255,255,.1)', borderRadius: '20px 20px 0 0',
              backdropFilter: 'blur(18px)', padding: '14px 14px 10px', animation: 'ivFade .22s var(--iv-ease) both',
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--iv-ink3)', padding: '0 6px 10px' }}>More</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {extras.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', borderRadius: 10,
                      textDecoration: 'none', fontSize: 13, fontWeight: active ? 600 : 500,
                      color: active ? 'var(--iv-gold)' : 'rgba(242,241,245,.75)',
                      background: active ? 'rgba(223,255,69,.1)' : 'rgba(255,255,255,.04)',
                      border: '1px solid rgba(255,255,255,.08)',
                    }}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <nav className="iv-bottom-nav md:hidden">
        {items.slice(0, 2).map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`iv-bottom-item ${active ? 'on' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {/* Center lime "+" — global New Booking (handled by Header's event listener) */}
        {canAccess(user?.role, '/crm/reservations') && (
          <button
            type="button"
            aria-label="New booking"
            onClick={() => window.dispatchEvent(new CustomEvent('lumea:global-new-booking'))}
            style={{
              alignSelf: 'flex-start', marginTop: -20, width: 48, height: 48, borderRadius: 17, border: 'none',
              background: 'linear-gradient(135deg,#EAFF7A,#C3E62E)', color: '#171A05', fontSize: 24, fontWeight: 800,
              boxShadow: '0 10px 26px rgba(223,255,69,.4)', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)',
            }}
            onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(.92)'; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = ''; }}
          >+</button>
        )}
        {items.slice(2).map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`iv-bottom-item ${active ? 'on' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {extras.length > 0 && (
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            aria-label="More sections"
            className={`iv-bottom-item ${more || moreActive ? 'on' : ''}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--iv-body)' }}
          >
            <Icon name="grid" />
            <span>More</span>
          </button>
        )}
      </nav>
    </>
  );
}
