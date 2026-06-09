'use client';

// Reservations — ported from legacy crm-src.jsx ReservationsPage (list display).
// Filters + search + canonical balance (total - discount - paid). View / New open the
// legacy app for now (the big ReservationDetail / NewReservation modals port later). No writes.
import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import NewReservationModal from './NewReservationModal';
import CheckActionModal from './CheckActionModal';
import ReservationEditModal from './ReservationEditModal';

const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase() || '?';
const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
  catch { return String(d).slice(0, 10); }
};
const nights = (ci, co) => {
  if (!ci || !co) return null;
  const n = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000);
  return n > 0 ? n : null;
};

const STATUS = {
  CHECKED_IN:  { bg: 'rgba(56,132,180,0.15)', fg: '#2E6A8E', label: 'Checked In' },
  RESERVED:    { bg: 'rgba(139,111,176,0.15)', fg: '#6B53A0', label: 'Reserved' },
  PENDING:     { bg: 'rgba(217,164,65,0.15)',  fg: '#8A6A1E', label: 'Pending' },
  CHECKED_OUT: { bg: 'rgba(90,124,110,0.15)',  fg: '#4A6B5C', label: 'Checked Out' },
  CANCELLED:   { bg: 'rgba(192,86,106,0.15)',  fg: '#A23B4E', label: 'Cancelled' },
};
function Status({ s }) {
  const v = STATUS[s] || { bg: '#EEE', fg: '#666', label: s || '—' };
  return <span className="iv-badge" style={{ background: v.bg, color: v.fg }}>{v.label}</span>;
}

const resBalance = (r) => Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0) - (+r.paid_amount || 0));

export default function Reservations() {
  const [reservations, setReservations] = useState([]);
  const [guestMap, setGuestMap] = useState({});
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [checkAction, setCheckAction] = useState(null); // { reservation, action }
  const [allRooms, setAllRooms] = useState([]);
  const [allGuests, setAllGuests] = useState([]);
  const [editRes, setEditRes] = useState(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: r }, { data: g }, { data: rm }] = await Promise.all([
        supabase.from('reservations').select('*').order('check_in', { ascending: false }).limit(5000),
        supabase.from('guests').select('id, name').limit(5000),
        supabase.from('rooms').select('id, room_number, status, category, price').order('room_number'),
      ]);
      setReservations(r || []);
      setAllRooms(rm || []);
      setAllGuests(g || []);
      const m = {}; (g || []).forEach((x) => { m[String(x.id)] = x.name; });
      setGuestMap(m);
    } catch (e) {
      console.error('[Reservations] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const getGN = (r) => r.guest_name || guestMap[String((r.guest_ids || [])[0] || '')] || 'Unknown';

  const counts = reservations.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const dueCount = reservations.filter((r) => (r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT') && resBalance(r) > 0).length;

  const list = useMemo(() => {
    let res;
    if (filter === 'ALL') res = reservations;
    else if (filter === 'DUE') res = reservations.filter((r) => (r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT') && resBalance(r) > 0);
    else res = reservations.filter((r) => r.status === filter);
    if (search) {
      const q = search.toLowerCase();
      res = res.filter((r) => getGN(r).toLowerCase().includes(q) || (r.room_ids || []).join('').includes(q) || r.on_duty_officer?.toLowerCase().includes(q));
    }
    return res;
  }, [reservations, guestMap, filter, search]);

  const tabs = ['ALL', 'CHECKED_IN', 'RESERVED', 'PENDING', 'CHECKED_OUT', 'DUE', 'CANCELLED'];

  return (
    <div>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Reservations</h1>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={filter === s ? 'iv-btn' : 'iv-btn iv-btn--ghost'}
              style={{ padding: '6px 12px', fontSize: 13, ...(s === 'DUE' && filter !== s ? { color: '#C0566A' } : {}) }}>
              {s === 'ALL' ? `All (${reservations.length})` : s === 'DUE' ? `Due (${dueCount})` : `${s.replace('_', ' ')} (${counts[s] || 0})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input className="iv-input" placeholder="Search guest, room…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 14px', minWidth: 200, border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8' }} />
          <button className="iv-btn" onClick={() => setShowNew(true)}>+ New</button>
        </div>
      </div>

      <div className="iv-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#8A7F6E', borderBottom: '1px solid #EAE3D6' }}>
                {['Guest', 'Rooms', 'Check-In', 'Check-Out', 'Nights', 'Total', 'Discount', 'Paid', 'Balance', 'Status', ''].map((h) => (
                  <th key={h} className="text-left py-2 font-normal whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={11} className="py-3 iv-stat__sub">Loading reservations…</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={11} className="py-3 iv-stat__sub">No reservations for this filter.</td></tr>}
              {list.slice(0, 100).map((r) => {
                const gn = getGN(r);
                const b = resBalance(r);
                const disc = +r.discount_amount || +r.discount || 0;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #F0EBE0' }}>
                    <td className="py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 99,
                          background: 'rgba(139,105,20,0.12)', color: '#8B6914', fontSize: 10, fontWeight: 700 }}>{initials(gn)}</span>
                        <button onClick={() => setEditRes(r)} title="Edit reservation"
                          style={{ color: '#2B2722', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
                            textDecoration: 'underline', textDecorationColor: '#E0D8C8', textUnderlineOffset: 2 }}>{gn}</button>
                      </span>
                    </td>
                    <td className="py-2"><span className="iv-badge">{(r.room_ids || []).join(', ') || r.room_number || '—'}</span></td>
                    <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{fmtDate(r.check_in)}</td>
                    <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{fmtDate(r.check_out)}</td>
                    <td className="py-2 text-xs iv-mono" style={{ color: '#8B6914' }}>{nights(r.check_in, r.check_out) || '—'}</td>
                    <td className="py-2 text-xs iv-mono" style={{ color: '#8B6914' }}>{bdt(r.total_amount)}</td>
                    <td className="py-2 text-xs iv-mono" style={{ color: '#B8860B' }}>{disc > 0 ? '− ' + bdt(disc) : '—'}</td>
                    <td className="py-2 text-xs iv-mono" style={{ color: +r.paid_amount > 0 ? '#3C6B4A' : '#8A7F6E' }}>{bdt(r.paid_amount)}</td>
                    <td className="py-2 text-xs iv-mono" style={{ color: b > 0 ? '#C0566A' : '#3C6B4A' }}>{bdt(b)}</td>
                    <td className="py-2"><Status s={r.status} /></td>
                    <td className="py-2">
                      {r.status === 'RESERVED' ? (
                        <button className="iv-btn" style={{ padding: '3px 12px', fontSize: 12 }}
                          onClick={() => setCheckAction({ reservation: r, action: 'checkin' })}>Check In</button>
                      ) : r.status === 'CHECKED_IN' ? (
                        <button className="iv-btn" style={{ padding: '3px 12px', fontSize: 12 }}
                          onClick={() => setCheckAction({ reservation: r, action: 'checkout' })}>Check Out</button>
                      ) : (
                        <button className="iv-btn iv-btn--ghost" style={{ padding: '3px 12px', fontSize: 12 }}
                          onClick={() => setEditRes(r)}>Edit</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <NewReservationModal rooms={allRooms} onClose={() => setShowNew(false)} onSaved={fetchData} />
      )}
      {checkAction && (
        <CheckActionModal
          reservation={checkAction.reservation}
          action={checkAction.action}
          onClose={() => setCheckAction(null)}
          onSaved={fetchData}
        />
      )}
      {editRes && (
        <ReservationEditModal
          reservation={editRes}
          guests={allGuests}
          rooms={allRooms}
          onClose={() => setEditRes(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
