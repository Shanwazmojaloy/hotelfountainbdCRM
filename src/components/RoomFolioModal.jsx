'use client';

// RoomFolioModal — ported from legacy RoomModal. For an OCCUPIED room: shows the active
// reservation, the full folio breakdown (room charge + extras, prorated discount/paid for
// multi-room stays), and hosts Add Charge / Collect Payment (idempotent) / Check Out.
// Reuses the money-grade RecordPaymentModal + CheckActionModal + AddChargeModal.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { recalcResTotal } from '@/lib/recalcResTotal';
import { useAuth } from './AuthGate';
import { isAdmin } from '@/lib/permissions';
import AddChargeModal from './AddChargeModal';
import RecordPaymentModal from './RecordPaymentModal';
import CheckActionModal from './CheckActionModal';
import { printInvoice } from '@/lib/printDocs';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const ADMIN_RE = /receivable|payment|settlement|advance|refund/i;
const nightsCount = (ci, co) => { if (!ci || !co) return 0; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 0; };
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return String(d).slice(0, 10); } };

export default function RoomFolioModal({ room, reservations, rooms, guests, onClose, onSaved }) {
  const { user } = useAuth();
  const admin = isAdmin(user?.role); // edit/remove of charges = owner/admin only
  const [folios, setFolios] = useState([]);
  const [fLoad, setFLoad] = useState(true);
  const [reload, setReload] = useState(0);
  const [showCharge, setShowCharge] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showCO, setShowCO] = useState(false);

  const activeRes = (reservations || []).find((r) => (r.room_ids || []).includes(room.room_number) && r.status === 'CHECKED_IN');
  const guest = activeRes ? (guests || []).find((g) => String(g.id) === String((activeRes.guest_ids || [])[0] || '')) : null;
  const guestName = guest?.name || activeRes?.guest_name || 'Guest';

  useEffect(() => {
    setFolios([]); setFLoad(true);
    if (!activeRes?.id) { setFLoad(false); return; }
    let cancelled = false;
    const supabase = getSupabaseClient();
    supabase.from('folios').select('*').eq('reservation_id', activeRes.id).order('created_at')
      .then(({ data, error }) => { if (error) console.error('[RoomFolio] folio fetch:', error); if (!cancelled) { setFolios((data || []).filter((x) => String(x.reservation_id) === String(activeRes.id))); setFLoad(false); } });
    return () => { cancelled = true; };
  }, [activeRes?.id, reload]);

  const roomRate = +room.price || 0;
  const nights = activeRes ? nightsCount(activeRes.check_in, activeRes.check_out) : 0;
  const roomCharge = roomRate * nights;
  const chargeFolios = folios.filter((f) => !ADMIN_RE.test(String(f.category || '') + ' ' + String(f.description || '')));
  const extras = chargeFolios.reduce((a, f) => a + (+f.amount || 0), 0);
  const sub = roomCharge + extras;
  const totalDiscount = +(activeRes?.discount_amount || activeRes?.discount || 0);
  const resRoomIds = (activeRes?.room_ids || []).filter(Boolean);
  const isMulti = resRoomIds.length > 1;
  const resRatesSum = isMulti ? resRoomIds.reduce((a, rn) => a + (+(rooms || []).find((r) => String(r.room_number) === String(rn))?.price || 0), 0) : roomRate;
  const discount = isMulti && resRatesSum > 0 ? Math.round(totalDiscount * (roomRate / resRatesSum)) : totalDiscount;
  const total = Math.max(0, sub - discount);
  const totalPaid = +(activeRes?.paid_amount || 0);
  const paid = isMulti && resRatesSum > 0 ? Math.round(totalPaid * (roomRate / resRatesSum)) : totalPaid;
  const due = Math.max(0, total - paid);

  async function deleteCharge(f) {
    if (!window.confirm('Delete folio charge?')) return;
    try {
      const r = await fetch('/api/crm/folio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: f.id, reservation_id: activeRes?.id }),
      });
      if (r.status === 401) {
        const supabase = getSupabaseClient();
        await supabase.from('folios').delete().eq('id', f.id);
        if (activeRes?.id) await recalcResTotal(activeRes.id);
      } else { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Could not delete charge.'); }
      setFolios((p) => p.filter((x) => x.id !== f.id));
      onSaved?.();
    } catch (e) { alert(e.message || String(e)); }
  }

  const lblS = { fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--iv-ink3)' };
  const row = { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 13 };

  return (
    <div onClick={onClose} className="iv-modal-ov" style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.58)', zIndex: 90,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-start justify-between mb-4 pb-4 iv-divider">
          <div>
            <h3 className="text-xl">Room {room.room_number} <span style={{ color: 'var(--iv-ink3)', fontWeight: 400 }}>· {room.category || 'Standard'}</span></h3>
            <div style={lblS} className="mt-1">{bdt(roomRate)}/night · {room.status}</div>
          </div>
          {activeRes && <div style={{ textAlign: 'right' }}><div style={lblS}>Balance Due</div>
            <div className="iv-mono" style={{ fontSize: 22, fontWeight: 700, color: due > 0 ? '#DC2626' : '#16A34A' }}>{bdt(due)}</div></div>}
        </div>

        {!activeRes && <div className="iv-stat__sub" style={{ padding: '12px 0' }}>No active (checked-in) reservation for this room.</div>}

        {activeRes && (
          <>
            <div style={{ background: 'rgba(139,105,20,0.06)', border: '1px solid var(--iv-border2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{guestName}</div>
              <div style={lblS} className="mt-1">{fmtDate(activeRes.check_in)} → {fmtDate(activeRes.check_out)} · {nights} night{nights !== 1 ? 's' : ''}</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={lblS} className="mb-2">Room Charge</div>
              {fLoad && <div className="iv-stat__sub">Loading folio…</div>}
              {!fLoad && nights > 0 && (
                <div style={row}><span>Room charge <span className="iv-badge" style={{ marginLeft: 6 }}>{nights}×{bdt(roomRate)}</span></span>
                  <span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(roomCharge)}</span></div>
              )}
              {!fLoad && nights === 0 && <div className="iv-stat__sub">No room charge.</div>}
            </div>

            {/* Additional Charges — manual Add-Charge line items, shown separately and visible
                to every staff account. Each is stamped with who added it; edit/remove is
                owner/admin only (the × is hidden for other roles and re-checked on the server). */}
            <div style={{ marginBottom: 14 }}>
              <div style={lblS} className="mb-2">Additional Charges</div>
              {!fLoad && chargeFolios.length === 0 && <div className="iv-stat__sub">No additional charges.</div>}
              {chargeFolios.map((f) => (
                <div key={f.id} style={{ ...row, alignItems: 'flex-start' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{f.description} <span className="iv-badge" style={{ marginLeft: 6 }}>{f.category}</span></span>
                    <span style={{ fontSize: 10, color: 'var(--iv-ink3)' }}>by {f.added_by_name || '—'} · {fmtDate(f.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-2"><span className="iv-mono" style={{ color: 'var(--iv-gold)' }}>{bdt(f.amount)}</span>
                    {admin && <button title="Delete charge" onClick={() => deleteCharge(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 15, lineHeight: 1 }}>×</button>}</span>
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(139,105,20,0.05)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <div className="flex justify-between text-sm" style={{ color: 'var(--iv-ink3)', marginBottom: 3 }}><span>Subtotal</span><span className="iv-mono">{bdt(sub)}</span></div>
              {discount > 0 && <div className="flex justify-between text-sm" style={{ color: '#16A34A', marginBottom: 3 }}><span>Discount{isMulti ? ' (prorated)' : ''}</span><span className="iv-mono">− {bdt(discount)}</span></div>}
              <div className="flex justify-between text-sm" style={{ fontWeight: 600, marginBottom: 3 }}><span>Total</span><span className="iv-mono">{bdt(total)}</span></div>
              <div className="flex justify-between text-sm" style={{ color: '#16A34A', marginBottom: 3 }}><span>Paid{isMulti ? ' (prorated)' : ''}</span><span className="iv-mono">− {bdt(paid)}</span></div>
              <div className="flex justify-between" style={{ fontWeight: 700, fontSize: 14, color: due > 0 ? '#DC2626' : '#16A34A', borderTop: '1px solid var(--iv-border2)', paddingTop: 6, marginTop: 3 }}><span>Balance Due</span><span className="iv-mono">{bdt(due)}</span></div>
            </div>

            <div className="flex gap-2 flex-wrap justify-end">
              <button className="iv-btn iv-btn--ghost" onClick={() => setShowCharge(true)}>+ Add Charge</button>
              <button className="iv-btn iv-btn--ghost" onClick={() => printInvoice({ ...activeRes, guest_name: guestName }, rooms, guestName, folios)}>Invoice</button>
              <button className="iv-btn iv-btn--ghost" onClick={() => setShowPay(true)} disabled={due <= 0}>Collect Payment</button>
              <button className="iv-btn" style={{ background: '#DC2626' }} onClick={() => setShowCO(true)}>Check Out</button>
            </div>
          </>
        )}

        <div className="flex justify-end iv-foot">
          <button className="iv-btn iv-btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>

      {showCharge && activeRes && (
        <AddChargeModal roomNo={room.room_number} resId={activeRes.id}
          onClose={() => setShowCharge(false)} onDone={() => { setReload((r) => r + 1); onSaved?.(); }} />
      )}
      {/* Pass the RAW reservation — RecordPaymentModal derives net = total − discount − paid
          itself. Passing the pre-discounted `total` here double-subtracted the discount
          (the blacklisted lockedDue anti-pattern) and broke multi-room payment caps. */}
      {showPay && activeRes && (
        <RecordPaymentModal reservation={{ ...activeRes, guest_name: guestName }}
          onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); onSaved?.(); }} />
      )}
      {showCO && activeRes && (
        <CheckActionModal reservation={{ ...activeRes, guest_name: guestName }} action="checkout"
          onClose={() => setShowCO(false)} onSaved={() => { setShowCO(false); onSaved?.(); }} />
      )}
    </div>
  );
}
