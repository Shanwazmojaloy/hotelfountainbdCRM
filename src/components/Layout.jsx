'use client';

import Header from "./Header";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import AuthGate from "./AuthGate";

// App shell — Hotel Fountain Design System: walnut sidebar | (topbar + scrolling content).
export default function Layout({ children }) {
  return (
    <AuthGate>
      <div className="crm-root flex flex-col md:flex-row" style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Sidebar — desktop only */}
        <Sidebar />

        {/* Main column: fixed topbar + scrolling content */}
        <div className="flex-1 flex flex-col min-w-0" style={{ height: '100vh' }}>
          <Header />
          <main className="flex-1 overflow-y-auto pb-24 md:pb-8" style={{ padding: '24px 28px', background: 'var(--iv-bg)' }}>
            {children}
          </main>
        </div>

        {/* Mobile bottom nav */}
        <BottomNav />
      </div>
    </AuthGate>
  );
}
