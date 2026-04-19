'use client';

import { useState } from 'react';
import ProgressRing from './ProgressRing';

export default function BillingCard({ 
  guestName, 
  room, 
  status, 
  stayDates, 
  folioDues, 
  todayPaid, 
  balanceDue,
  detailData 
}) {
  const [showDetail, setShowDetail] = useState(false);

  const statusClass = status === 'CHECKED_IN' ? 'status-checked-in' : 
                     balanceDue > 0 ? 'status-due' : 'status-paid';

  return (
    <>
      {/* Card */}
      <div className="glass-card group hover:shadow-2xl hover:shadow-neon-cyan/20 transition-all duration-300">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={statusClass} />
            <h3 className="font-semibold text-lg">{guestName}</h3>
          </div>
          <span className="text-sm bg-teal-900/50 px-3 py-1 rounded-full font-mono">
            Room {room}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <div className="text-teal-300 text-xs uppercase tracking-wider mb-1">Stay Dates</div>
            <div className="font-mono">{stayDates}</div>
          </div>
          <div>
            <div className="text-teal-300 text-xs uppercase tracking-wider mb-1">Folio Dues</div>
            <div className="text-2xl font-bold text-neon-cyan">৳{folioDues}</div>
          </div>
          <div>
            <div className="text-teal-300 text-xs uppercase tracking-wider mb-1">Today Paid</div>
            <div className="font-mono text-emerald-400">+৳{todayPaid}</div>
          </div>
          <div className="text-right">
            <div className="text-teal-300 text-xs uppercase tracking-wider mb-1">Balance</div>
            <div className={balanceDue > 0 ? 'text-yellow-400 font-bold' : 'text-emerald-400 font-bold'}>
              ৳{balanceDue}
            </div>
          </div>
        </div>
        
        <button 
          className="btn-glass w-full group-hover:scale-105"
          onClick={() => setShowDetail(true)}
        >
          Detail →
        </button>
      </div>

      {/* Fullscreen Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setShowDetail(false)}>
          <div className="glass w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-teal-800/30">
              <h2 className="text-2xl font-light">Folio Details</h2>
              <button 
                className="text-2xl p-2 hover:neon-glow"
                onClick={() => setShowDetail(false)}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-center p-6 glass rounded-2xl">
                <div>
                  <div className="text-teal-400 text-sm uppercase tracking-wider mb-2">Today Revenue</div>
                  <ProgressRing progress={75} size={80} className="text-neon-cyan" />
                </div>
                <div>
                  <div className="text-teal-400 text-sm uppercase tracking-wider mb-2">Occupancy</div>
                  <ProgressRing progress={62} size={80} className="text-emerald-400" />
                </div>
              </div>
              
              {detailData?.transactions?.map((tx, i) => (
                <div key={i} className="flex items-center justify-between p-4 glass rounded-xl">
                  <div>
                    <div className="font-mono text-sm">{tx.date}</div>
                    <div className="text-teal-400 text-xs uppercase">{tx.type}</div>
                  </div>
                  <div className={tx.amount > 0 ? 'text-emerald-400' : 'text-neon-cyan'}>
                    ৳{Math.abs(tx.amount)}
                  </div>
                </div>
              ))}
              
              <div className="pt-4 border-t border-teal-800/30 text-right space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total Dues:</span>
                  <span className="font-mono">৳{folioDues}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-neon-cyan">
                  <span>Balance Due:</span>
                  <span>৳{balanceDue}</span>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button className="btn-neon flex-1">Pay Now</button>
                <button className="btn-glass flex-1">Print</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
