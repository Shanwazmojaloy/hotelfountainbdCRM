'use client';

import { Home, Building2, DollarSign, Users } from 'lucide-react';

const navItems = [
  { id: 'dashboard', icon: HomeIcon, label: 'Dashboard' },
  { id: 'rooms', icon: BuildingOfficeIcon, label: 'Rooms' },
  { id: 'billing', icon: CurrencyDollarIcon, label: 'Billing' },
  { id: 'guests', icon: UsersIcon, label: 'Guests' },
];

export default function Sidebar({ activePage, setActivePage }) {
  return (
    <aside className="glass hidden md:flex flex-col w-64 border-r border-teal-800/30">
      <div className="p-6 border-b border-teal-800/20">
        <h2 className="text-lg font-light tracking-tight">
          Navigation
        </h2>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`glass w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 hover:neon-glow hover:scale-[1.02] ${
              activePage === item.id
                ? 'border-neon-cyan/50 bg-neon-cyan/10 neon-glow ring-2 ring-neon-cyan/30'
                : ''
            }`}
            onClick={() => setActivePage(item.id)}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium text-left">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
