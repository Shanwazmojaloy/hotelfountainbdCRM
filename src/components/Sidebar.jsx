'use client';

// Sidebar — Hotel Fountain Design System (walnut rail, brand crest, 4 nav sections + badges,
// user footer). Matches the handoff mockup. Extra app routes live under a "More" section.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthGate';

const NAV = [
  { sect: 'Overview' },
  { href: '/crm', icon: '⬡', label: 'Dashboard', exact: true },
  { href: '/crm/rooms', icon: '▦', label: 'Room Management' },
  { href: '/crm/reservations', icon: '◈', label: 'Reservations', badge: '3', badgeColor: 'var(--iv-rose-fg)' },
  { href: '/crm/guests', icon: '◉', label: 'Guests & CRM' },
  { sect: 'Operations' },
  { href: '/crm/housekeeping', icon: '✦', label: 'Housekeeping', badge: '2', badgeColor: 'var(--iv-due-fg)' },
  { href: '/crm/billing', icon: '◎', label: 'Billing & Invoices' },
  { sect: 'Analytics' },
  { href: '/crm/reports', icon: '▣', label: 'Reports' },
  { sect: 'System' },
  { href: '/crm/settings', icon: '◌', label: 'Settings' },
  { sect: 'More' },
  { href: '/crm/ai', icon: '✦', label: 'AI Agents' },
  { href: '/crm/council', icon: '◉', label: 'Council' },
  { href: '/crm/pipeline', icon: '▣', label: 'Pipeline' },
  { href: '/leads', icon: '◉', label: 'Leads' },
  { href: '/suppliers', icon: '▦', label: 'Suppliers' },
  { href: '/churn', icon: '▣', label: 'Follow-up' },
];

const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase() || '?';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside className="iv-sidebar hidden md:flex flex-col w-64 h-screen sticky top-0" style={{ overflow: 'hidden' }}>
      {/* Brand crest */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(148,163,184,.15)', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <img src="/logo-crest.png" alt="Hotel Fountain" style={{ width: 'auto', height: 58, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.35))' }} />
        <div style={{ minWidth: 0 }}>
          <div className="iv-brand">Hotel <em>Fountain</em></div>
          <div className="iv-side-tag" style={{ marginTop: 5 }}>Management CRM</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map((n, i) =>
          n.sect ? (
            <div key={i} style={{ fontSize: 10, letterSpacing: '.14em', color: 'rgba(148,163,184,.55)', padding: '14px 12px 5px', textTransform: 'uppercase', fontWeight: 600 }}>{n.sect}</div>
          ) : (
            <Link key={n.href} href={n.href} className={`iv-nav-item ${(n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + '/')) ? 'on' : ''}`}>
              <span className="iv-nav-ic" style={{ width: 18, textAlign: 'center', fontSize: 13, flexShrink: 0 }}>{n.icon}</span>
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.badge && <span style={{ fontFamily: 'var(--iv-body)', fontSize: 9, fontWeight: 700, color: '#fff', background: n.badgeColor || 'var(--iv-rose-fg)', borderRadius: 999, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>{n.badge}</span>}
            </Link>
          )
        )}
      </nav>

      {/* User footer */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(148,163,184,.15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#818CF8,#4F46E5)', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(user?.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Staff'}</div>
            <div style={{ fontSize: 8, color: '#A5B4FC', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 1 }}>{user?.role || ''}</div>
          </div>
          <span onClick={signOut} title="Sign out" style={{ fontSize: 14, color: 'rgba(148,163,184,.6)', cursor: 'pointer', padding: 4 }}>⎋</span>
        </div>
      </div>
    </aside>
  );
}
