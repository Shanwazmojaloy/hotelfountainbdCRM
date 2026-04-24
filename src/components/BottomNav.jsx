'use client';

import Link from 'next/link';
import { Home, Building2, DollarSign, Users } from 'lucide-react';

const navItems = [
  { id: 'dashboard', href: '/', icon: Home, label: 'Dashboard' },
  { id: 'rooms', href: '/rooms', icon: Building2, label: 'Rooms' },
  { id: 'billing', href: '/billing', icon: DollarSign, label: 'Billing' },
  { id: 'guests', href: '/guests', icon: Users, label: 'Guests' },
];

export default function BottomNav({ activePage }) {
  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 transition-all duration-200 ${
            activePage === item.id ? 'neon-glow' : ''
          }`}
          style={{ color: activePage === item.id ? 'var(--neon-cyan)' : '#5eead4', textDecoration: 'none' }}
        >
          <item.icon className="w-6 h-6" />
          <span className="text-xs font-medium tracking-tight">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
