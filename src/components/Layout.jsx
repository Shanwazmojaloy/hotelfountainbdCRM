'use client';

import { useState } from 'react';
import { NotificationBell } from "./NotificationBell";
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
        <header className="glass sticky top-0 z-40 border-b border-teal-800/30 p-4 md:p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/Pictures/Logo.png" 
              alt="Hotel Fountain" 
              className="h-10 w-auto rounded-lg glass p-2 neon-glow"
              onError={(e) => e.currentTarget.style.display = "none"}
            />
            <h1 className="text-xl md:text-2xl font-light tracking-tight">
              Hotel <span className="text-neon-cyan font-normal">Fountain</span> CRM
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="w-8 h-8 bg-neon-cyan/20 rounded-full flex items-center justify-center glass">
              👤
            </div>
          </div>
        </header>
        
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
