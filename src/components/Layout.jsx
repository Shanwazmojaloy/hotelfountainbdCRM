'use client';

import { usePathname } from 'next/navigation';
import Header from "./Header";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  const pathname = usePathname();
  // Derive active tab from URL: '/' → 'dashboard', '/billing' → 'billing', etc.
  const activePage = pathname === '/' ? 'dashboard' : pathname.slice(1).split('/')[0];

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #042f2e 50%, #000 100%)' }}>
      {/* Mobile Bottom Nav */}
      <BottomNav activePage={activePage} />

      {/* Sidebar - Desktop Only */}
      <div className="hidden md:block glass w-64 border-r flex-shrink-0" style={{ borderColor: 'rgba(6,120,132,0.3)' }}>
        <Sidebar activePage={activePage} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
