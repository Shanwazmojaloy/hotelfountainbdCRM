'use client';

import Link from 'next/link';
import { Home, Building2, DollarSign, Users } from 'lucide-react';

const navItems = [
  { id: 'dashboard', href: '/', icon: Home, label: 'Dashboard' },
  { id: 'rooms', href: '/rooms', icon: Building2, label: 'Rooms' },
  { id: 'billing', href: '/billing', icon: DollarSign, label: 'Billing & Invoices' },
  { id: 'guests', href: '/guests', icon: Users, label: 'Guests' },
];

export default function Sidebar({ activePage }) {
  return (
    <aside className="glass hidden md:flex flex-col w-64" style={{ borderRight: '1px solid rgba(6,120,132,0.3)' }}>
      <div className="p-6" style={{ borderBottom: '1px solid rgba(6,120,132,0.2)' }}>
        <h2 className="text-lg font-light tracking-tight">Navigation</h2>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="glass w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200"
            style={{
              textDecoration: 'none',
              color: activePage === item.id ? 'var(--neon-cyan)' : 'inherit',
              ...(activePage === item.id
                ? {
                    borderColor: 'rgba(0,242,255,0.5)',
                    background: 'rgba(0,242,255,0.1)',
                    boxShadow: '0 0 0.75rem rgba(0,242,255,0.3)',
                    outline: '2px solid rgba(0,242,255,0.3)',
                  }
                : {}),
            }}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span className="font-medium text-left">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
