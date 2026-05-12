'use client';

import { useState, useEffect } from 'react';

export default function Header() {
  const [currentDate, setCurrentDate] = useState('');
  const [clockStr, setClockStr] = useState('');

  // 🔥 DHAKA ANCHOR - Global timezone enforcement
  const getDhakaDate = () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  };

  const getDhakaTime = () => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
  };

  useEffect(() => {
    const updateTime = () => {
      setCurrentDate(getDhakaDate());
      setClockStr(getDhakaTime());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000 * 30); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass px-6 py-4 rounded-2xl flex items-center justify-between mb-8">
      <div>
        <div className="text-teal-400 text-sm uppercase tracking-wider mb-1">
          Dhaka Time
        </div>
        <div className="text-2xl font-mono font-bold text-neon-cyan">
          {currentDate} | {clockStr}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="text-sm text-teal-300">
          Night Audit: <span className="status-checked-in" /> Ready
        </div>
        <button className="btn-glass px-4 py-2">
          New Folio
        </button>
      </div>
    </div>
  );
}
