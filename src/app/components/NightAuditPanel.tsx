'use client';

import React, { useState } from 'react';

/* ─────────────────────────────────────────────────────────────────
   NightAuditPanel — Hotel Fountain CRM
   Closes the day's ledger and inserts a record into night_audit_log.
   Visible to: receptionist (Front Desk), manager, owner.
   Active window: 10 PM – 2 AM (enforced by parent button, not here).
───────────────────────────────────────────────────────────────── */

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const TENANT  = process.env.NEXT_PUBLIC_TENANT_ID || '';

const BDT = (n: number) => '৳' + Number(n || 0).toLocaleString('en-BD');

function todayDhaka() {
  return new Date(new Date().toLocaleString('en', { timeZone: 'Asia/Dhaka' }));
}
function todayStr() {
  const d = todayDhaka();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Reservation {
  id: string;
  guest_name?: string;
  room_ids?: string[] | string;
  room_number?: string | number;
  check_in?: string;
  check_out?: string;
  total_amount?: number | string;
  paid_amount?: number | string;
  status?: string;
}

interface Transaction {
  id: string;
  amount?: number | string;
  fiscal_day?: string;
  created_at?: string;
  status?: string;
  type?: string;
}

interface Room {
  id: string;
  status?: string;
  room_number?: string | number;
}

interface CurrentUser {
  name: string;
  role: string;
}

interface NightAuditPanelProps {
  rooms: Room[];
  reservations: Reservation[];
  transactions: Transaction[];
  currentUser: CurrentUser;
  onClose: () => void;
  toast: (msg: string, type?: string) => void;
}

/* ── SQL for audit log table (run once in Supabase SQL editor) ──
CREATE TABLE night_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_date DATE NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  closed_by TEXT,
  total_checkins INTEGER DEFAULT 0,
  total_checkouts INTEGER DEFAULT 0,
  total_collections NUMERIC(12,2) DEFAULT 0,
  carried_over_dues NUMERIC(12,2) DEFAULT 0,
  rooms_occupied INTEGER DEFAULT 0,
  rooms_vacant INTEGER DEFAULT 0,
  notes TEXT,
  tenant_id UUID,
  status TEXT DEFAULT 'closed' CHECK (status IN ('closed', 'reopened'))
);
── */

export default function NightAuditPanel({
  rooms, reservations, transactions, currentUser, onClose, toast
}: NightAuditPanelProps) {
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState<string | null>(null);

  const today = todayStr();

  /* ── Compute today's summary ── */
  const checkInsToday   = reservations.filter(r => r.check_in  === today).length;
  const checkOutsToday  = reservations.filter(r => r.check_out === today).length;

  const collectionsToday = transactions
    .filter(t => {
      const d = (t.fiscal_day || t.created_at || '').slice(0, 10);
      return d === today;
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const pendingDues = reservations.filter(r => {
    const due = Number(r.total_amount || 0) - Number(r.paid_amount || 0);
    return due > 0 && r.status !== 'CHECKED_OUT';
  });

  const totalCarriedOver = pendingDues.reduce(
    (sum, r) => sum + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)),
    0
  );

  const roomsOccupied = rooms.filter(r => r.status === 'OCCUPIED').length;
  const roomsVacant   = rooms.filter(r => ['AVAILABLE', 'CLEAN'].includes(r.status ?? '')).length;

  /* ── Close Day ── */
  const closeDay = async () => {
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        audit_date:        today,
        closed_at:         nowIso,
        closed_by:         currentUser.name,
        total_checkins:    checkInsToday,
        total_checkouts:   checkOutsToday,
        total_collections: collectionsToday,
        carried_over_dues: totalCarriedOver,
        rooms_occupied:    roomsOccupied,
        rooms_vacant:      roomsVacant,
        tenant_id:         TENANT,
        status:            'closed',
      };

      const HEADERS = {
        apikey:         SB_KEY,
        Authorization:  `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      };

      /* Insert into night_audit_log */
      const res = await fetch(`${SB_URL}/rest/v1/night_audit_log`, {
        method:  'POST',
        headers: HEADERS,
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      /* Mark today's pending transactions as carried_over */
      await fetch(
        `${SB_URL}/rest/v1/transactions?tenant_id=eq.${TENANT}&fiscal_day=eq.${today}&status=eq.pending`,
        { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ status: 'carried_over' }) }
      );

      const closedTime = todayDhaka().toLocaleTimeString('en', {
        hour: '2-digit', minute: '2-digit',
      });
      setDone(closedTime);
      toast('Day ledger closed successfully ✓');
    } catch (e: unknown) {
      toast('Audit failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ── Styles ── */
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(7,9,14,.92)',
    zIndex: 500,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  };
  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(200,169,110,.2)',
    borderRadius: 16,
    maxWidth: 640, width: '90%',
    boxShadow: '0 24px 80px rgba(0,0,0,.7)',
    maxHeight: '90vh', overflowY: 'auto',
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={card}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 300, color: '#C8A96E', letterSpacing: '.02em' }}>
            🌙 Night <em style={{ fontStyle: 'italic' }}>Audit</em>
          </div>
          <button
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.12)', color: '#9A907C', cursor: 'pointer', fontSize: 16, padding: '4px 10px', borderRadius: 6, lineHeight: 1 }}
            onClick={onClose}
          >×</button>
        </div>

        {/* ── Warning Banner ── */}
        <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: 'rgba(240,165,0,.1)', border: '1px solid rgba(240,165,0,.3)', borderRadius: 8, color: '#F0A500', fontSize: 12, lineHeight: 1.6 }}>
          ⚠️ This action locks today's entries. Ensure all payments have been recorded before proceeding.
        </div>

        {/* ── Summary Stats ── */}
        {!done && (
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: '#9A907C', marginBottom: 14, fontWeight: 200 }}>
              Today's Summary — {today}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
              {([
                { label: 'Check-Ins',      value: checkInsToday,              icon: '↓', color: '#3FB950' },
                { label: 'Check-Outs',     value: checkOutsToday,             icon: '↑', color: '#58A6FF' },
                { label: 'Collections',    value: BDT(collectionsToday),       icon: '৳', color: '#C8A96E' },
                { label: 'Rooms Occupied', value: roomsOccupied,               icon: '▦', color: '#2EC4B6' },
                { label: 'Rooms Vacant',   value: roomsVacant,                 icon: '□', color: '#C8BFB0' },
                { label: 'Pending Dues',   value: pendingDues.length,          icon: '!', color: '#E05C7A' },
              ] as const).map(item => (
                <div key={item.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(200,169,110,.12)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 18, marginBottom: 4, color: item.color }}>{item.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 300, color: item.color, letterSpacing: '.01em' }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: '#9A907C', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 3 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Pending dues list */}
            {pendingDues.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#E05C7A', marginBottom: 8, fontWeight: 500 }}>
                  ⚠ Unpaid / Pending Dues — will carry over to next day
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                  {pendingDues.map(r => {
                    const due = Number(r.total_amount || 0) - Number(r.paid_amount || 0);
                    const roomLabel = Array.isArray(r.room_ids)
                      ? r.room_ids.join(', ')
                      : (r.room_ids || r.room_number || '—');
                    return (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(224,92,122,.07)', border: '1px solid rgba(224,92,122,.2)', borderRadius: 8, fontSize: 12 }}>
                        <span style={{ color: '#C8BFB0' }}>{r.guest_name || 'Guest'} · Room {roomLabel}</span>
                        <span style={{ color: '#E05C7A', fontWeight: 500 }}>{BDT(due)} due</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#9A907C' }}>
                  Total carry-over: <span style={{ color: '#E05C7A', fontWeight: 500 }}>{BDT(totalCarriedOver)}</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid rgba(200,169,110,.12)' }}>
              <button
                style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,.12)', color: '#C8BFB0', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: '10px 24px',
                  background: loading ? 'rgba(63,185,80,.3)' : 'rgba(63,185,80,.85)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '.04em',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background .2s',
                }}
                onClick={closeDay}
                disabled={loading}
              >
                {loading ? '⏳ Closing…' : '✓ Close Day Ledger'}
              </button>
            </div>
          </div>
        )}

        {/* ── Success State ── */}
        {done && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 300, color: '#3FB950', marginBottom: 8, letterSpacing: '.02em' }}>
              Day Closed Successfully
            </div>
            <div style={{ fontSize: 13, color: '#C8BFB0', marginBottom: 4 }}>
              Day closed at <strong style={{ color: '#EEE9E2' }}>{done}</strong>.
            </div>
            <div style={{ fontSize: 12, color: '#9A907C', marginTop: 6 }}>
              Next audit opens at 6:00 AM.
            </div>
            <div style={{ fontSize: 11, color: '#9A907C', marginTop: 4 }}>
              {today} ledger has been locked.
            </div>
            <button
              style={{ marginTop: 24, padding: '10px 28px', background: 'rgba(200,169,110,.1)', border: '1px solid rgba(200,169,110,.2)', color: '#EEE9E2', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
