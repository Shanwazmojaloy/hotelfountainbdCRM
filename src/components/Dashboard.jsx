'use client';

import ProgressRing from './ProgressRing';

export default function Dashboard() {
  const stats = {
    revenue: 125000,
    occupancy: 78,
    checkins: 12,
    checkout: 8,
    activeGuests: 23
  };

  return (
    <div>
      <h1 className="text-3xl font-light mb-8 pb-6 border-b border-teal-800/30">
        Dashboard Overview
      </h1>
      
      <div className="stats-scroll mb-8">
        <div className="glass-card min-w-64 p-6 snap-center shrink-0">
          <div className="text-teal-400 text-xs uppercase tracking-wider mb-3">Today Revenue</div>
          <div className="flex items-center gap-4 mb-3">
            <ProgressRing progress={85} size={64} />
            <div className="text-2xl font-bold text-neon-cyan">৳{stats.revenue.toLocaleString()}</div>
          </div>
          <div className="text-sm text-teal-400">+12% vs yesterday</div>
        </div>
        <div className="glass-card min-w-64 p-6 snap-center shrink-0">
          <div className="text-teal-400 text-xs uppercase tracking-wider mb-3">Occupancy</div>
          <ProgressRing progress={stats.occupancy} size={64} className="text-emerald-400 mb-4" />
          <div className="text-2xl font-bold text-emerald-400">{stats.occupancy}%</div>
        </div>
        <div className="glass-card min-w-64 p-6 snap-center shrink-0">
          <div className="flex items-center gap-3 text-2xl mb-2">
            <span className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center glass">↓</span>
            <span className="text-2xl font-bold text-emerald-400">{stats.checkins}</span>
          </div>
          <div className="text-teal-400 text-xs uppercase tracking-wider">Check-ins</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card">
          <h3 className="text-lg font-medium mb-6 pb-4 border-b border-teal-800/30">
            Today's Activity
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-teal-900/30">
              <div>
                <div className="font-mono text-sm">Rahim Khan</div>
                <div className="text-teal-400 text-xs">Room 205 • Check-in</div>
              </div>
              <span className="status-checked-in" />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <div>
                <div className="font-mono text-sm">Fatema Begum</div>
                <div className="text-yellow-400 text-xs">Room 112 • ৳2500 due</div>
              </div>
              <span className="status-due" />
            </div>
          </div>
        </div>
        
        <div className="glass-card">
          <h3 className="text-lg font-medium mb-6 pb-4 border-b border-teal-800/30">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <button className="btn-neon p-4 text-sm">New Check-in</button>
            <button className="btn-glass p-4 text-sm">Night Audit</button>
            <button className="btn-neon p-4 text-sm">New Payment</button>
            <button className="btn-glass p-4 text-sm">Room Service</button>
          </div>
        </div>
      </div>
    </div>
  );
}
