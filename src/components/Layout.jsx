'use client';

import Header from "./Header";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div className="crm-root flex flex-col md:flex-row">
      {/* Sidebar — desktop only */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-7xl mx-auto">
            <Header />
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}
