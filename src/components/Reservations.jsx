'use client';

// Reservations — Hotel Fountain Design System layout (underline tabs + folio table).
// Live data + canonical balance (total - discount - paid). View opens the edit modal;
// status actions open check-in/out. Writes go through the modals.
import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import NewReservationModal from './NewReservationModal';
import CheckActionModal from './CheckActionModal';
import ReservationEditModal from './ReservationEditModal';
import { Tabs, Card, Table, Badge, Avatar, Skeleton, TD, MONO, HoverRow, C, bdt } from './dskit';
import { getSnap, setSnap } from '@/lib/snap';

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
const ST_TONE = {
  CHECKED_IN: ['blue', 'Checked In'], RESERVED: ['teal', 'Reserved'], PENDING: ['amber', 'Pending'],
  CHECKED_OUT: ['gold', 'Checked Out'], CANCELLED: ['rose', 'Cancelled'],
};
const resBalance = (r) => Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0) - (+r.paid_amount || 0));

export default function Reservations() {
  const _cached = getSnap('reservations');
  const [reservations, setReservations] = useState(_cached?.reservations || []);
  const [guestMap, setGuestMap] = useState(_cached?.guestMap || {});
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!_cached);
  const [showNew, setShowNew] = useState(false);
  const [checkAction, setCheckAction] = useState(null);
  const [allRooms, setAllRooms] = useState(_cached?.allRooms || []);
  const [allGuests, setAllGuests] = useState(_cached?.allGuests || []);
  const [editRes, setEditRes] = useState(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    if (!getSnap('reservations')) setLoading(true); // revisits refresh silently behind cached rows
    try {
      const supabase = getSupabaseClient();
      const [{ data: r }, { data: g }, { data: rm }] = await Promise.all([
        supabase.from('reservations').select('*').order('check_in', { ascending: false }).limit(5000),
        supabase.from('guests').select('id, name').limit(5000),
        supabase.from('rooms').select('id, room_number, status, category, price').order('room_number'),
      ]);
      const m = {}; (g || []).forEach((x) => { m[String(x.id)] = x.name; });
      setReservations(r || []);
      setAllRooms(rm || []);
      setAllGuests(g || []);
      setGuestMap(m);
      setSnap('reservations', { reservations: r || [], allRooms: rm || [], allGuests: g || [], guestMap: m });
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

  // While loading we pass null (renders no count) instead of a misleading "(0)";
  // once data lands the counts roll up from 0 via the Tabs CountUp.
  const c = (n) => (loading ? null : n);
  const tabs = [
    { id: 'ALL', label: 'All', count: c(reservations.length) },
    { id: 'CHECKED_IN', label: 'Checked In', count: c(counts.CHECKED_IN || 0) },
    { id: 'RESERVED', label: 'Reserved', count: c(counts.RESERVED || 0) },
    { id: 'PENDING', label: 'Pending', count: c(counts.PENDING || 0), color: C.amb },
    { id: 'CHECKED_OUT', label: 'Checked Out', count: c(counts.CHECKED_OUT || 0) },
    { id: 'DUE', label: 'Due', count: c(dueCount), color: C.rose },
    { id: 'CANCELLED', label: 'Cancelled', count: c(counts.CANCELLED || 0) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Tabs value={filter} onChange={setFilter} tabs={tabs} style={{ marginBottom: 16 }} />
        </div>
        <div className="flex items-center gap-2" style={{ paddingBottom: 16 }}>
          <input className="iv-input" placeholder="Search guest, room…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '8px 12px', width: 200 }} />
          <button className="iv-btn" onClick={() => setShowNew(true)} style={{ fontSize: 9.5, padding: '8px 14px' }}>+ New</button>
        </div>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table head={['Guest', 'Room', 'Check-In', 'Check-Out', 'Nights', 'Total', 'Paid', 'Balance', 'Status', '']}>
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <tr key={'sk' + i} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
              {Array.from({ length: 10 }).map((_, j) => (
                <td key={j} style={TD}><Skeleton w={j === 0 ? 130 : j === 9 ? 64 : 68} h={14} /></td>
              ))}
            </tr>
          ))}
          {!loading && list.length === 0 && <tr><td colSpan={10} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No reservations for this filter.</td></tr>}
          {list.slice(0, 100).map((r) => {
            const gn = getGN(r);
            const b = resBalance(r);
            const [tone, label] = ST_TONE[r.status] || ['neutral', r.status || '—'];
            return (
              <HoverRow key={r.id} onClick={() => setEditRes(r)}>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={gn} size={24} />{gn}</div>
                </td>
                <td style={TD}><Badge tone="blue">{(r.room_ids || []).join(', ') || r.room_number || '—'}</Badge></td>
                <td style={{ ...TD, ...MONO, color: C.ink3 }}>{fmtDate(r.check_in)}</td>
                <td style={{ ...TD, ...MONO, color: C.ink3 }}>{fmtDate(r.check_out)}</td>
                <td style={{ ...TD, color: C.gold, fontSize: 11 }}>{nights(r.check_in, r.check_out) || '—'}</td>
                <td style={{ ...TD, ...MONO, color: C.gold }}>{bdt(r.total_amount)}</td>
                <td style={{ ...TD, ...MONO, color: +r.paid_amount > 0 ? C.grn : C.ink3 }}>{bdt(r.paid_amount)}</td>
                <td style={{ ...TD, ...MONO, color: b > 0 ? C.rose : C.grn }}>{b > 0 ? bdt(b) : '—'}</td>
                <td style={TD}><Badge tone={tone}>{label}</Badge></td>
                <td style={TD}>
                  {r.status === 'RESERVED' ? (
                    <button className="iv-btn" style={{ fontSize: 9.5, padding: '4px 11px' }} onClick={(e) => { e.stopPropagation(); setCheckAction({ reservation: r, action: 'checkin' }); }}>Check In</button>
                  ) : r.status === 'CHECKED_IN' ? (
                    <button className="iv-btn" style={{ fontSize: 9.5, padding: '4px 11px' }} onClick={(e) => { e.stopPropagation(); setCheckAction({ reservation: r, action: 'checkout' }); }}>Check Out</button>
                  ) : (
                    <button className="iv-btn iv-btn--ghost" style={{ fontSize: 9.5, padding: '4px 11px' }} onClick={(e) => { e.stopPropagation(); setEditRes(r); }}>View</button>
                  )}
                </td>
              </HoverRow>
            );
          })}
        </Table>
      </Card>

      {showNew && (
        <NewReservationModal rooms={allRooms} onClose={() => setShowNew(false)} onSaved={fetchData} />
      )}
      {checkAction && (
        <CheckActionModal reservation={checkAction.reservation} action={checkAction.action} onClose={() => setCheckAction(null)} onSaved={fetchData} />
      )}
      {editRes && (
        <ReservationEditModal reservation={editRes} guests={allGuests} rooms={allRooms} onClose={() => setEditRes(null)} onSaved={fetchData} />
      )}
    </div>
  );
}
