'use client';

import { useState } from 'react';
import ProgressRing from './ProgressRing';
import { useCheckout } from '@/hooks/billing/useCheckout';

export default function BillingCard({ 
  guestName, 
  room, 
  status, 
  stayDates, 
  folioDues, 
  todayPaid, 
  balanceDue,
  detailData,
  reservationId,
  onCheckoutSuccess,
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const checkout = useCheckout();

  const statusClass = status === 'CHECKED_IN' ? 'status-checked-in' : 
                     balanceDue > 0 ? 'status-due' : 'status-paid';

  async function handleCheckout() {
    if (!reservationId) return;
    setCheckoutError(null);
    try {
      const summary = await checkout.mutateAsync({ reservation_id: reservationId });
      setCheckoutSummary(summary);
      if (onCheckoutSuccess) onCheckoutSuccess(summary);
    } catch (err) {
      setCheckoutError(err.message || 'Checkout failed');
    }
  }

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowDetail(false)}
        >
          <div className="glass w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-teal-800/30">
              <h2 className="text-2xl font-light">Folio Details</h2>
              <button className="text-2xl p-2 hover:neon-glow" onClick={() => setShowDetail(false)}>×</button>
            </div>
            
            {/* Checkout success summary */}
            {checkoutSummary ? (
              <div className="space-y-4">
                <div className="p-6 glass rounded-2xl text-center border border-emerald-500/30">
                  <div className="text-emerald-400 text-4xl mb-3">✓</div>
                  <div className="text-xl font-semibold text-emerald-400 mb-1">Checked Out</div>
                  <div className="text-teal-300 text-sm">Invoice {checkoutSummary.invoice_number}</div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-teal-400">Rooms vacated</span>
                    <span className="font-mono">{checkoutSummary.rooms_vacated?.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-400">Nights stayed</span>
                    <span className="font-mono">{checkoutSummary.actual_nights} / {checkoutSummary.stay_nights}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-400">Gross total</span>
                    <span className="font-mono text-neon-cyan">৳{checkoutSummary.gross_total_bdt?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-400">Paid</span>
                    <span className="font-mono text-emerald-400">৳{checkoutSummary.paid_total_bdt?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-teal-800/30 pt-2">
                    <span>Balance due</span>
                    <span className={checkoutSummary.balance_due_bdt > 0 ? 'text-yellow-400' : 'text-emerald-400'}>
                      ৳{checkoutSummary.balance_due_bdt?.toLocaleString()}
                    </span>
                  </div>
                  {checkoutSummary.charges_voided > 0 && (
                    <div className="text-xs text-teal-500 text-center pt-1">
                      {checkoutSummary.charges_voided} future charge(s) voided (early departure)
                    </div>
                  )}
                </div>
                <button className="btn-glass w-full mt-4" onClick={() => setShowDetail(false)}>Close</button>
              </div>
            ) : (
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

                {/* Error display */}
                {checkoutError && (
                  <div className="text-red-400 text-sm text-center p-3 glass rounded-xl border border-red-500/30">
                    {checkoutError}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button className="btn-neon flex-1">Pay Now</button>
                  <button className="btn-glass flex-1">Print</button>
                </div>

                {/* Check Out button — only for CHECKED_IN reservations */}
                {status === 'CHECKED_IN' && reservationId && (
                  <button
                    onClick={handleCheckout}
                    disabled={checkout.isPending}
                    className="w-full mt-2 py-4 rounded-2xl font-semibold text-black transition-all
                      bg-red-500 hover:bg-red-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                      shadow-lg shadow-red-500/30"
                  >
                    {checkout.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Processing...
                      </span>
                    ) : 'Check Out'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
