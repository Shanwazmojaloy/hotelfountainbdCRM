'use client';

// Guests — ported from legacy crm-src.jsx GuestsPage (display).
// Searchable, paginated guest list with per-guest outstanding balance.
// View / Add guest open the legacy app for now (those modals port later). No writes.
import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import GuestFormModal from './GuestFormModal';

const PAGE_SIZE = 50;
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase() || '?';

export default function Guests() {
  const [guests, setGuests] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalGuest, setModalGuest] = useState(undefined); // undefined=closed · null=add · object=edit

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: g }, { data: r }] = await Promise.all([
        supabase.from('guests').select('id, name, phone, email, city, vip, id_type, id_number, id_card').order('name').limit(5000),
        supabase.from('reservations').select('guest_ids, guest_name, total_amount, discount_amount, discount, paid_amount'),
      ]);
      setGuests(g || []);
      setReservations(r || []);
    } catch (e) {
      console.error('[Guests] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  // outstanding balance per guest (by id, name fallback) — mirrors legacy
  const bal = useMemo(() => {
    const byId = {}, byName = {};
    const due = (r) => Math.max(0, (+r.total_amount || 0) - (+r.discount_amount || +r.discount || 0) - (+r.paid_amount || 0));
    reservations.forEach((r) => {
      const d = due(r);
      if (d <= 0) return;
      (r.guest_ids || []).forEach((gid) => { const k = String(gid); byId[k] = (byId[k] || 0) + d; });
      const nm = String(r.guest_name || '').trim().toLowerCase();
      if (nm) byName[nm] = (byName[nm] || 0) + d;
    });
    return { byId, byName };
  }, [reservations]);

  const guestBal = (g) => {
    const hit = bal.byId[String(g.id)];
    if (hit != null) return hit;
    return bal.byName[String(g.name || '').trim().toLowerCase()] || 0;
  };

  let filtered = guests;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((g) =>
      g.name?.toLowerCase().includes(q) || g.phone?.includes(q) || g.email?.toLowerCase().includes(q));
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageList = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <h1 className="text-3xl mb-8 pb-6 iv-divider">Guests &amp; CRM</h1>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <input
          className="iv-input"
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 14px', minWidth: 280, border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8' }}
        />
        <div className="flex items-center gap-3">
          <span className="iv-badge">{filtered.length}{search ? ' found' : ` of ${guests.length}`}</span>
          <button className="iv-btn" onClick={() => setModalGuest(null)}>+ Add Guest</button>
        </div>
      </div>

      <div className="iv-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: '#8A7F6E', borderBottom: '1px solid #EAE3D6' }}>
                <th className="text-left py-2 font-normal">Name</th>
                <th className="text-left py-2 font-normal">Phone</th>
                <th className="text-left py-2 font-normal">Email</th>
                <th className="text-left py-2 font-normal">ID</th>
                <th className="text-left py-2 font-normal">City</th>
                <th className="text-left py-2 font-normal">Balance</th>
                <th className="text-left py-2 font-normal">VIP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="py-3 iv-stat__sub">Loading guests…</td></tr>}
              {!loading && pageList.length === 0 && <tr><td colSpan={8} className="py-3 iv-stat__sub">No guests found.</td></tr>}
              {pageList.map((g) => {
                const b = guestBal(g);
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid #F0EBE0' }}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 99,
                          background: 'rgba(139,105,20,0.12)', color: '#8B6914', fontSize: 11, fontWeight: 700 }}>{initials(g.name)}</span>
                        <span style={{ color: 'var(--iv-ink)' }}>{g.name}</span>
                      </span>
                    </td>
                    <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{g.phone || '—'}</td>
                    <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{g.email || '—'}</td>
                    <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{g.id_type ? `${g.id_type}: ${g.id_number || ''}` : (g.id_card || '—')}</td>
                    <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{g.city || '—'}</td>
                    <td className="py-2 text-xs iv-mono" style={{ color: b > 0 ? '#C0566A' : '#3C6B4A' }}>{bdt(b)}</td>
                    <td className="py-2">{g.vip ? <span className="iv-badge">VIP</span> : null}</td>
                    <td className="py-2">
                      <button className="iv-btn iv-btn--ghost" style={{ padding: '3px 12px', fontSize: 12 }}
                        onClick={() => setModalGuest(g)}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
          <div className="text-xs" style={{ color: '#8A7F6E' }}>
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} guests
          </div>
          <div className="flex items-center gap-2">
            <button className="iv-btn iv-btn--ghost" disabled={page === 1} style={{ padding: '4px 12px', opacity: page === 1 ? 0.4 : 1 }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
            <span className="text-xs iv-mono" style={{ color: '#5C5347' }}>Page {page} / {totalPages}</span>
            <button className="iv-btn iv-btn--ghost" disabled={page === totalPages} style={{ padding: '4px 12px', opacity: page === totalPages ? 0.4 : 1 }}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next ›</button>
          </div>
        </div>
      )}

      {modalGuest !== undefined && (
        <GuestFormModal
          guest={modalGuest}
          onClose={() => setModalGuest(undefined)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
