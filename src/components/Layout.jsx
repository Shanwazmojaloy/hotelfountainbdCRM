'use client';

import { useState } from 'react';
import Header from "./Header";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  const [activePage, setActivePage] = useState("dashboard");

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-slate-900 via-teal-950 to-black">
      {/* Mobile Bottom Nav */}
      <BottomNav activePage={activePage} setActivePage={setActivePage} />
      
      {/* Sidebar - Desktop Only */}
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden md:ml-0 md:pl-4 md:pb-0">
        {/* Header */}
        <Header />

        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
