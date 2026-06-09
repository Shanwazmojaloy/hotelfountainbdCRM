'use client';

import { useState } from 'react';
import { useCheckout } from '@/hooks/billing/useCheckout';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');

export default function BillingCard({
  guestName,
  room,
  status,
  stayDates,
  folioDues,   // numeric
  todayPaid,   // numeric
  balanceDue,  // numeric
  detailData,
  reservationId,
  onCheckoutSuccess,
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const checkout = useCheckout();

  const due = Number(balanceDue) || 0;
  const dotClass = status === 'CHECKED_IN' ? 'iv-dot iv-dot--in'
    : due > 0 ? 'iv-dot iv-dot--due'
    : 'iv-dot iv-dot--paid';

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

  const txList = detailData?.txs || [];

  return (
    <>
      {/* Card */}
      <div className="iv-card iv-card--hover">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={dotClass} />
            <h3 className="text-lg" style={{ fontWeight: 700 }}>{guestName}</h3>
          </div>
          <span className="iv-mono text-sm" style={{ background: '#F5F0E8', border: '1px solid #EAE6DD', padding: '3px 10px', borderRadius: 999, color: '#5C5347' }}>
            Room {room}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <div className="iv-eyebrow mb-1">Stay Dates</div>
            <div className="iv-mono" style={{ color: '#2B2722' }}>{stayDates}</div>
          </div>
          <div>
            <div className="iv-eyebrow mb-1">Folio Total</div>
            <div className="iv-mono" style={{ fontSize: 20, fontWeight: 600, color: '#2B2722' }}>{bdt(folioDues)}</div>
          </div>
          <div>
            <div className="iv-eyebrow mb-1">Paid (period)</div>
            <div className="iv-mono iv-pos" style={{ fontWeight: 600 }}>+{bdt(todayPaid)}</div>
          </div>
          <div className="text-right">
            <div className="iv-eyebrow mb-1">Balance</div>
            <div className="iv-mono" style={{ fontWeight: 700, color: due > 0 ? '#8A6A1E' : '#3F6A4B' }}>{bdt(due)}</div>
          </div>
        </div>

        <button className="iv-btn iv-btn--ghost w-full" onClick={() => setShowDetail(true)}>
          Detail →
        </button>
      </div>

      {/* Fullscreen Detail Modal */}
      {showDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(43,39,34,.45)' }}
          onClick={(e) => e.target === e.currentTarget && setShowDetail(false)}
        >
          <div className="iv-card w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ borderRadius: 2 }}>
            <div className="flex items-center justify-between mb-8 pb-4 iv-divider">
              <h2 className="text-2xl">Folio Details</h2>
              <button className="text-2xl px-2" style={{ color: '#8A847A' }} onClick={() => setShowDetail(false)}>×</button>
            </div>

            {checkoutSummary ? (
              <div className="space-y-4">
                <div className="iv-card text-center" style={{ borderColor: 'rgba(63,106,75,.3)' }}>
                  <div className="iv-pos" style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
                  <div className="text-xl iv-pos" style={{ fontWeight: 700 }}>Checked Out</div>
                  <div className="iv-stat__sub">Invoice {checkoutSummary.invoice_number}</div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: '#5C5347' }}>Rooms vacated</span>
                    <span className="iv-mono">{checkoutSummary.rooms_vacated?.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#5C5347' }}>Nights stayed</span>
                    <span className="iv-mono">{checkoutSummary.actual_nights} / {checkoutSummary.stay_nights}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#5C5347' }}>Gross total</span>
                    <span className="iv-mono">{bdt(checkoutSummary.gross_total_bdt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#5C5347' }}>Paid</span>
                    <span className="iv-mono iv-pos">{bdt(checkoutSummary.paid_total_bdt)}</span>
                  </div>
                  <div className="flex justify-between pt-2" style={{ fontWeight: 700, borderTop: '1px solid #EAE6DD' }}>
                    <span>Balance due</span>
                    <span className="iv-mono" style={{ color: checkoutSummary.balance_due_bdt > 0 ? '#8A6A1E' : '#3F6A4B' }}>
                      {bdt(checkoutSummary.balance_due_bdt)}
                    </span>
                  </div>
                  {checkoutSummary.charges_voided > 0 && (
                    <div className="text-xs text-center pt-1" style={{ color: '#8A847A' }}>
                      {checkoutSummary.charges_voided} future charge(s) voided (early departure)
                    </div>
                  )}
                </div>
                <button className="iv-btn iv-btn--ghost w-full mt-4" onClick={() => setShowDetail(false)}>Close</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="iv-card" style={{ padding: '1rem' }}>
                    <div className="iv-eyebrow mb-1">Total</div>
                    <div className="iv-mono" style={{ fontWeight: 600 }}>{bdt(folioDues)}</div>
                  </div>
                  <div className="iv-card" style={{ padding: '1rem' }}>
                    <div className="iv-eyebrow mb-1">Paid</div>
                    <div className="iv-mono iv-pos" style={{ fontWeight: 600 }}>{bdt(todayPaid)}</div>
                  </div>
                  <div className="iv-card" style={{ padding: '1rem' }}>
                    <div className="iv-eyebrow mb-1">Balance</div>
                    <div className="iv-mono" style={{ fontWeight: 600, color: due > 0 ? '#8A6A1E' : '#3F6A4B' }}>{bdt(due)}</div>
                  </div>
                </div>

                {txList.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between p-3" style={{ border: '1px solid #EAE6DD', borderRadius: 2 }}>
                    <div>
                      <div className="iv-mono text-sm">{(tx.fiscal_day || tx.created_at || '').slice(0, 10)}</div>
                      <div className="iv-eyebrow">{tx.type}</div>
                    </div>
                    <div className="iv-mono" style={{ color: '#2B2722' }}>{bdt(Math.abs(Number(tx.amount) || 0))}</div>
                  </div>
                ))}

                {checkoutError && (
                  <div className="text-sm text-center p-3" style={{ color: '#8C2F1D', background: '#FBEDE9', border: '1px solid rgba(140,47,29,.25)', borderRadius: 2 }}>
                    {checkoutError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button className="iv-btn flex-1" onClick={() => { window.location.href = '/crm.html'; }}>Pay Now</button>
                  <button className="iv-btn iv-btn--ghost flex-1" onClick={() => window.print()}>Print</button>
                </div>

                {status === 'CHECKED_IN' && reservationId && (
                  <button
                    onClick={handleCheckout}
                    disabled={checkout.isPending}
                    className="iv-btn iv-btn--danger w-full mt-1"
                  >
                    {checkout.isPending ? 'Processing…' : 'Check Out'}
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
