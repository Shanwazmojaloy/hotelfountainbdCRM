'use client';

import React from 'react';
import { Home, Building2, DollarSign, Users } from 'lucide-react';

const navItems = [
  { id: 'dashboard', icon: Home, label: 'Dashboard' },
  { id: 'rooms', icon: Building2, label: 'Rooms' },
  { id: 'billing', icon: DollarSign, label: 'Billing' },
  { id: 'guests', icon: Users, label: 'Guests' },
];

export default function BottomNav({ activePage, setActivePage }) {
  return (
    <nav className="bottom-nav">
  {navItems.map((item) => (
        <button
          key={item.id}
          className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 transition-all duration-200 ${
            activePage === item.id
              ? 'text-neon-cyan neon-glow'
              : 'text-teal-300 hover:text-neon-cyan'
          }`}
          onClick={() => setActivePage(item.id)}
        >
          <item.icon className="w-6 h-6" />
          <span className="text-xs font-medium tracking-tight">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
