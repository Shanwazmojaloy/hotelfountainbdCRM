'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!SB_URL || !SB_KEY) console.error('[NotificationBell] Missing NEXT_PUBLIC_SUPABASE_* env vars');
const supabase = createClient(SB_URL, SB_KEY);

const fmtDate = (d: string) => d ? String(d).slice(0, 10) : '—';

interface PendingReservation {
  id: string;
  guest_name: string;
  email: string;
  phone?: string;
  room_type: string;
  check_in: string;
  check_out: string;
  guests?: string;
  status: string;
  created_at?: string;
}

interface Props {
  onRefresh?: () => void;
}

export function NotificationBell({ onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [acceptModal, setAcceptModal] = useState<{ open: boolean; reservation: PendingReservation | null }>({ open: false, reservation: null });
  const [feeInput, setFeeInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const dropRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      // Canonical: landing inserts status='PENDING' (UPPERCASE). Match exactly.
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPending(data || []);
    } catch (err) {
      console.error('[fetchPending]', err);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    // Debounce realtime refetches: collapse bursts of postgres_changes events
    // into a single refetch every 800ms.
    let pendingRefetch: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pendingRefetch) clearTimeout(pendingRefetch);
      pendingRefetch = setTimeout(() => { fetchPending(); pendingRefetch = null; }, 800);
    };
    const channel = supabase
      .channel('pending-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, scheduleRefetch)
      .subscribe();
    return () => {
      if (pendingRefetch) clearTimeout(pendingRefetch);
      supabase.removeChannel(channel);
    };
  }, [fetchPending]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAccept = async () => {
    if (!acceptModal.reservation) return;
    setProcessing(true);
    const res = acceptModal.reservation;
    const fee = parseFloat(feeInput) || 0;

    try {
      const { error: updErr } = await supabase
        .from('reservations')
        .update({
          status: 'CONFIRMED',
          amount_paid: fee,
          paid_amount: fee,
          updated_at: new Date().toISOString(),
        })
        .eq('id', res.id);
      if (updErr) throw updErr;

      // Fire-and-forget email
      fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: res.guest_name,
          guest_email: res.email,
          room_type: res.room_type,
          check_in: fmtDate(res.check_in),
          check_out: fmtDate(res.check_out),
        }),
      }).catch(() => {});

      await fetchPending();
      onRefresh?.();
      setAcceptModal({ open: false, reservation: null });
      setFeeInput('');
      showToast('Reservation Confirmed & Confirmation Email Sent to Guest');
    } catch (err) {
      console.error('[handleAccept]', err);
      showToast('Error: Could not confirm reservation. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(true);
    try {
      const { error: updErr } = await supabase
        .from('reservations')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updErr) throw updErr;
      await fetchPending();
      onRefresh?.();
      setRejectId(null);
      showToast('Reservation removed.');
    } catch (err) {
      console.error('[handleReject]', err);
      showToast('Error: Could not remove reservation.');
    } finally {
      setProcessing(false);
    }
  };

  const count = pending.length;

  const BELL_CSS = `
    @keyframes bellFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .bell-drop-item:hover{background:rgba(200,169,110,.04)!important}
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BELL_CSS }} />

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: toast.startsWith('Error') ? '#3a0a14' : '#0d2e1a',
          border: `1px solid ${toast.startsWith('Error') ? '#E05C7A' : '#3FB950'}`,
          color: toast.startsWith('Error') ? '#E05C7A' : '#3FB950',
          padding: '14px 24px', fontSize: 13, fontFamily: 'Geist,system-ui,sans-serif',
          letterSpacing: '.04em', maxWidth: 400,
          animation: 'bellFadeIn .3s ease',
        }}>
          {toast.startsWith('Error') ? '⚠ ' : '✓ '}{toast}
        </div>
      )}

      <div ref={dropRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={() => setOpen(o => !o)}
          title="Pending Reservations"
          style={{
            position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 10px', color: count > 0 ? '#C8A96E' : '#9A907C',
            fontSize: 20, lineHeight: 1, transition: 'color .2s',
          }}
        >
          🔔
          {count > 0 && (
            <span style={{
              position: 'absolute', top: 0, right: 0,
              background: '#E05C7A', color: '#fff',
              fontSize: 9, fontWeight: 700, fontFamily: 'Geist,sans-serif',
              minWidth: 16, height: 16, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #07090E',
            }}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 440, maxHeight: 520, overflowY: 'auto',
            background: '#0D1117', border: '1px solid rgba(200,169,110,.2)',
            zIndex: 500, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
            animation: 'bellFadeIn .25s ease',
          }}>
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid rgba(200,169,110,.12)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(200,169,110,.04)',
            }}>
              <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: '#C8A96E' }}>
                Pending Reservations
              </div>
              <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 10, color: '#9A907C' }}>
                {count} waiting
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#9A907C', fontSize: 12, fontFamily: 'Geist,sans-serif' }}>Loading…</div>
            ) : count === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9A907C', fontSize: 13, fontFamily: 'Geist,sans-serif' }}>
                ✓ No pending reservations
              </div>
            ) : (
              pending.map(res => (
                <div key={res.id} className="bell-drop-item" style={{
                  padding: '16px 20px', borderBottom: '1px solid rgba(200,169,110,.08)',
                  transition: 'background .2s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontFamily: 'Cormorant Garamond,Georgia,serif', fontSize: 17, color: '#EEE9E2', fontWeight: 400 }}>
                      {res.guest_name}
                    </div>
                    <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#E0C585', background: 'rgba(224,197,133,.08)', border: '1px solid rgba(224,197,133,.2)', padding: '3px 8px', alignSelf: 'center' }}>
                      Pending
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 11, color: '#9A907C', marginBottom: 3 }}>
                    {res.room_type || 'Room N/A'}{res.guests ? ` · ${res.guests}` : ''}
                  </div>
                  <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 11, color: '#C8BFB0', marginBottom: 14 }}>
                    {fmtDate(res.check_in)} → {fmtDate(res.check_out)}
                    {res.email && <span style={{ marginLeft: 10, color: '#6a6a5a', fontSize: 10 }}>{res.email}</span>}
                  </div>

                  {rejectId === res.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'Geist,sans-serif', fontSize: 11, color: '#E05C7A', flex: 1 }}>
                        Guest did not pay fee. Remove?
                      </span>
                      <button disabled={processing} onClick={() => handleReject(res.id)} style={{ background: '#E05C7A', color: '#fff', border: 'none', padding: '6px 14px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Geist,sans-serif' }}>
                        {processing ? '…' : 'Confirm'}
                      </button>
                      <button onClick={() => setRejectId(null)} style={{ background: 'none', border: '1px solid rgba(200,169,110,.2)', color: '#9A907C', padding: '6px 12px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Geist,sans-serif' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setAcceptModal({ open: true, reservation: res }); setFeeInput(''); setOpen(false); }}
                        style={{ background: '#C8A96E', color: '#07090E', border: 'none', padding: '8px 16px', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Geist,sans-serif', fontWeight: 600, flex: 1 }}>
                        ✓ Accept (Fee Paid)
                      </button>
                      <button
                        onClick={() => setRejectId(res.id)}
                        style={{ background: 'none', border: '1px solid rgba(224,92,122,.3)', color: '#E05C7A', padding: '8px 14px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Geist,sans-serif' }}>
                        ✕ Remove
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ACCEPT MODAL */}
      {acceptModal.open && acceptModal.reservation && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,.92)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setAcceptModal({ open: false, reservation: null }); }}>
          <div style={{ background: '#0D1117', border: '1px solid rgba(200,169,110,.2)', width: '100%', maxWidth: 440, padding: 40, position: 'relative', animation: 'bellFadeIn .3s ease' }}>
            <button onClick={() => setAcceptModal({ open: false, reservation: null })} style={{ position: 'absolute', top: 14, right: 18, background: 'none', border: 'none', color: '#9A907C', fontSize: 20, cursor: 'pointer' }}>✕</button>

            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 26, color: '#EEE9E2', fontWeight: 300, marginBottom: 6 }}>
              Confirm Reservation
            </div>
            <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 11, color: '#9A907C', letterSpacing: '.1em', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(200,169,110,.12)' }}>
              {acceptModal.reservation.guest_name} · {acceptModal.reservation.room_type}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 9, color: '#C8A96E', letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 4 }}>Check-In</div>
                <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 13, color: '#C8BFB0' }}>{fmtDate(acceptModal.reservation.check_in)}</div>
              </div>
              <div>
                <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 9, color: '#C8A96E', letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 4 }}>Check-Out</div>
                <div style={{ fontFamily: 'Geist,sans-serif', fontSize: 13, color: '#C8BFB0' }}>{fmtDate(acceptModal.reservation.check_out)}</div>
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ fontFamily: 'Geist,sans-serif', fontSize: 9, color: '#C8A96E', letterSpacing: '.18em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Reservation Fee Collected (BDT) *
              </label>
              <input
                type="number"
                value={feeInput}
                onChange={e => setFeeInput(e.target.value)}
                placeholder="Enter amount paid by guest"
                autoFocus
                style={{ background: '#07090E', border: '1px solid rgba(200,169,110,.25)', color: '#EEE9E2', fontFamily: 'Geist,sans-serif', fontSize: 14, padding: '12px 14px', width: '100%', outline: 'none' }}
              />
            </div>

            <button
              disabled={processing || !feeInput}
              onClick={handleAccept}
              style={{
                background: !feeInput || processing ? 'rgba(200,169,110,.4)' : '#C8A96E',
                color: '#07090E', border: 'none', width: '100%', padding: 14,
                fontFamily: 'Geist,sans-serif', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
                cursor: processing || !feeInput ? 'not-allowed' : 'pointer', fontWeight: 600,
              }}>
              {processing ? 'Confirming…' : 'Confirm & Send Email →'}
            </button>
            <p style={{ fontFamily: 'Geist,sans-serif', fontSize: 10, color: '#6a6a5a', textAlign: 'center', marginTop: 12 }}>
              A confirmation email will be sent to the guest automatically
            </p>
          </div>
        </div>
      )}
    </>
  );
}