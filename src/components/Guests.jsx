'use client';

// Guests & CRM — Hotel Fountain Design System table (avatar + contact + outstanding balance).
// Searchable, paginated. Add/Edit via GuestFormModal. Live data.
import { useState, useEffect, useMemo } from 'react';
import GuestFormModal from './GuestFormModal';
import GuestDetailModal from './GuestDetailModal';
import { Card, Table, Badge, Avatar, TD, MONO, C, bdt } from './dskit';
import { getSnap, warmSnap, setSnap } from '@/lib/snap';

const PAGE_SIZE = 50;

export default function Guests() {
  const _cached = getSnap('guests'); // hot tier — instant tab→tab revisits
  const [guests, setGuests] = useState(_cached?.guests || []);
  const [reservations, setReservations] = useState(_cached?.reservations || []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!_cached);
  const [modalGuest, setModalGuest] = useState(undefined); // undefined=closed · null=add · object=edit
  const [detailGuest, setDetailGuest] = useState(null);    // read-only profile card (ID document)

  useEffect(() => {
    if (!getSnap('guests')) {
      const warm = warmSnap('guests'); // localStorage tier — instant paint after full reload
      if (warm) { setGuests(warm.guests || []); setReservations(warm.reservations || []); setLoading(false); }
    }
    fetchData();
  }, []);
  useEffect(() => { setPage(1); }, [search]);

  async function fetchData() {
    if (!getSnap('guests')) setLoading(true); // revisits refresh silently behind cached rows
    try {
      // C3: read via the session-gated server route (service role) — guest PII is no longer
      // exposed to the public anon key.
      const [gr, rr] = await Promise.all([
        fetch('/api/crm/data?resource=guests&order=name.asc&limit=5000'),
        // cols= trim (2026-07-30): this page reads reservations ONLY in the `bal` dues memo
        // (guest_ids/guest_name + money fields). Full rows were ~1.6MB; this is ~15% of that.
        fetch('/api/crm/data?resource=reservations&cols=id,guest_ids,guest_name,total_amount,paid_amount,discount,discount_amount'),
      ]);
      const gj = await gr.json().catch(() => ({}));
      const rj = await rr.json().catch(() => ({}));
      if (!gr.ok || !rr.ok) console.error('[Guests] query error:', gj.error || rj.error);
      const g = gj.rows || [];
      const r = rj.rows || [];
      setGuests(g);
      setReservations(r);
      setSnap('guests', { guests: g, reservations: r });
    } catch (e) {
      console.error('[Guests] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

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
    filtered = filtered.filter((g) => g.name?.toLowerCase().includes(q) || g.phone?.includes(q) || g.email?.toLowerCase().includes(q));
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageList = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <input className="iv-input" placeholder="Search name, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '9px 12px', minWidth: 280, maxWidth: 340 }} />
        <div className="flex items-center gap-3">
          <Badge tone="gold">{filtered.length}{search ? ' found' : ` of ${guests.length}`}</Badge>
          <button className="iv-btn" onClick={() => setModalGuest(null)} style={{ fontSize: 12, padding: '8px 14px' }}>+ Add Guest</button>
        </div>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table head={['Name', 'Phone', 'Email', 'ID', 'City', 'Balance', 'VIP', '']}>
          {loading && <tr><td colSpan={8} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>Loading guests…</td></tr>}
          {!loading && pageList.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: C.ink3, fontSize: 12 }}>No guests found.</td></tr>}
          {pageList.map((g) => {
            const b = guestBal(g);
            return (
              <tr key={g.id} style={{ borderBottom: '1px solid var(--iv-border2)' }}>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={g.name} size={26} tone={g.vip ? 'gold' : undefined} />{g.name}</div>
                </td>
                <td style={{ ...TD, ...MONO, color: C.ink3 }}>{g.phone || '—'}</td>
                <td style={{ ...TD, fontSize: 11, color: C.ink3 }}>{g.email || '—'}</td>
                {/* ID column (2026-08-15): the document is now the record of truth. Guests
                    captured before the upload flow still show their typed number. */}
                <td style={{ ...TD, fontSize: 11, color: C.ink3 }}>
                  {g.id_image_url ? (
                    <button className="iv-btn iv-btn--ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setDetailGuest(g)}>
                      {g.id_type || 'ID'} · View
                    </button>
                  ) : (g.id_number || g.id_card ? `${g.id_type ? g.id_type + ': ' : ''}${g.id_number || g.id_card}` : '—')}
                </td>
                <td style={{ ...TD, fontSize: 11, color: C.ink3 }}>{g.city || '—'}</td>
                <td style={{ ...TD, ...MONO, color: b > 0 ? C.rose : C.grn }}>{b > 0 ? bdt(b) : '—'}</td>
                <td style={TD}>{g.vip ? <Badge tone="gold">VIP</Badge> : null}</td>
                <td style={TD}><button className="iv-btn iv-btn--ghost" style={{ fontSize: 12, padding: '4px 11px' }} onClick={() => setModalGuest(g)}>Edit</button></td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
          <div style={{ fontSize: 11, color: C.ink3 }}>
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} guests
          </div>
          <div className="flex items-center gap-2">
            <button className="iv-btn iv-btn--ghost" disabled={page === 1} style={{ fontSize: 12, padding: '5px 12px', opacity: page === 1 ? 0.4 : 1 }} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
            <span className="iv-mono" style={{ fontSize: 11, color: C.ink2 }}>Page {page} / {totalPages}</span>
            <button className="iv-btn iv-btn--ghost" disabled={page === totalPages} style={{ fontSize: 12, padding: '5px 12px', opacity: page === totalPages ? 0.4 : 1 }} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next ›</button>
          </div>
        </div>
      )}

      {modalGuest !== undefined && (
        <GuestFormModal guest={modalGuest} onClose={() => setModalGuest(undefined)} onSaved={fetchData} />
      )}
      {detailGuest && <GuestDetailModal guest={detailGuest} onClose={() => setDetailGuest(null)} />}
    </div>
  );
}
