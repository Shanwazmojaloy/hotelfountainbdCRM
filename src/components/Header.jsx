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
    <div className="iv-topbar px-6 py-4 flex items-center justify-between mb-8">
      <div>
        <div className="iv-eyebrow mb-1">Dhaka Time</div>
        <div className="iv-mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--iv-ink)' }}>
          {currentDate} | {clockStr}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-sm flex items-center gap-2" style={{ color: '#5C5347' }}>
          Night Audit: <span className="iv-dot iv-dot--in" /> Ready
        </div>
        <button className="iv-btn iv-btn--ghost" style={{ padding: '10px 18px' }} onClick={() => { window.location.href = '/billing'; }}>
          New Folio
        </button>
      </div>
    </div>
  );
}
