'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Icon({ name }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const paths = {
    home: <><path d="M3 9.5 12 3l9 6.5" /><path d="M5 21V10h14v11" /></>,
    dollar: <><line x1="12" y1="2.5" x2="12" y2="21.5" /><path d="M16.5 6.5C16 5 14.5 4 12.5 4h-1C9 4 7.5 5.3 7.5 7s1.5 3 4 3h1c2.5 0 4 1.3 4 3s-1.5 3-4 3h-1c-2 0-3.5-1-4-2.5" /></>,
    trend: <><path d="M3 7l6 6 4-4 8 8" /><path d="M21 17v-4h-4" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.2 2.7-5 5.5-5s5.5 1.8 5.5 5" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6" /><path d="M17 15c2.2.4 3.5 2 3.5 4" /></>,
    building: <><path d="M4 21V4h9v17" /><path d="M13 9h6v12" /><path d="M7.5 8h1M11 8h0.5M7.5 12h1M11 12h0.5M7.5 16h1M11 16h0.5" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
    bed: <><path d="M3 7v11M3 13h18v5M21 18v-4a3 3 0 0 0-3-3h-6v6" /><circle cx="7" cy="10.5" r="1.6" /></>,
    sparkle: <><path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z" /></>,
    gear: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13a7.7 7.7 0 0 0 0-2l1.9-1.4-1.9-3.3-2.2 1a7.7 7.7 0 0 0-1.7-1l-.3-2.4H9.8L9.5 3.3a7.7 7.7 0 0 0-1.7 1l-2.2-1L3.7 6.6 5.6 8a7.7 7.7 0 0 0 0 2l-1.9 1.4 1.9 3.3 2.2-1a7.7 7.7 0 0 0 1.7 1l.3 2.4h4.4l.3-2.4a7.7 7.7 0 0 0 1.7-1l2.2 1 1.9-3.3z" /></>,
  };
  return <svg {...p} aria-hidden="true">{paths[name]}</svg>;
}

const navItems = [
  { href: '/crm', icon: 'home', label: 'Dashboard' },
  { href: '/crm/reservations', icon: 'calendar', label: 'Reservations' },
  { href: '/crm/rooms', icon: 'bed', label: 'Rooms' },
  { href: '/crm/guests', icon: 'users', label: 'Guests' },
  { href: '/crm/housekeeping', icon: 'sparkle', label: 'Housekeeping' },
  { href: '/crm/billing', icon: 'dollar', label: 'Billing' },
  { href: '/crm/reports', icon: 'trend', label: 'Reports' },
  { href: '/crm/settings', icon: 'gear', label: 'Settings' },
  { href: '/crm/ai', icon: 'sparkle', label: 'AI Agents' },
  { href: '/leads', icon: 'users', label: 'Leads' },
  { href: '/suppliers', icon: 'building', label: 'Suppliers' },
  { href: '/churn', icon: 'trend', label: 'Follow-up' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="iv-sidebar hidden md:flex flex-col w-64 h-screen sticky top-0">
      <div className="px-6 pt-7 pb-5" style={{ borderBottom: '1px solid rgba(200,169,110,.15)' }}>
        <div className="iv-brand">Lumea<em> CRM</em></div>
        <div className="iv-side-tag">Hotel Fountain · Dhaka</div>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-px overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`iv-nav-item ${active ? 'on' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
