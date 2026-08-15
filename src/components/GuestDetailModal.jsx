'use client';

// GuestDetailModal — READ-ONLY guest profile card.
//
// Opened from the "View Details" buttons on the reservation modals, from the Guests table's
// ID column, and from ReservationDetailModal. It never writes: front desk uses it to verify
// who is standing at the counter against the ID document on file.
//
// Accepts either a full guest row (`guest`) or just an id (`guestId`); when only an id is
// known it fetches the row through the session-gated read route — guest PII is never read
// with the public anon key (C3).
import { useState, useEffect } from 'react';
import { idDocHref, isPdfUrl } from '@/lib/idUpload';

const zPad = { position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.62)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--iv-border2)', fontSize: 13 }}>
      <span style={{ color: 'var(--iv-ink3)', flexShrink: 0 }}>{label}</span>
      <span className={mono ? 'iv-mono' : undefined} style={{ color: 'var(--iv-ink)', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );
}

export default function GuestDetailModal({ guest, guestId, onClose }) {
  const [g, setG] = useState(guest && guest.name ? guest : null);
  const [loading, setLoading] = useState(!(guest && guest.name));
  const [err, setErr] = useState('');
  const id = guestId || guest?.id;

  useEffect(() => {
    // Already handed a full row (Guests table) — nothing to fetch.
    if (g && g.name) { setLoading(false); return; }
    if (!id) { setLoading(false); setErr('This guest is not linked to a guest record.'); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/crm/data?resource=guests&ids=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const row = (j.rows || [])[0];
        if (!row) setErr('Guest record not found.');
        else setG(row);
      })
      .catch(() => { if (!cancelled) setErr('Could not load this guest.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lbl = { fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--iv-ink3)', marginBottom: 6, display: 'block' };
  const doc = g?.id_image_url || '';

  // stopPropagation on the backdrop: this modal is often rendered INSIDE another modal's
  // overlay (booking form, reservation editor). Without it, dismissing the profile card would
  // bubble up and close the form underneath it too.
  return (
    <div onClick={(e) => { e.stopPropagation(); onClose?.(); }} className="iv-modal-ov" style={zPad}>
      <div onClick={(e) => e.stopPropagation()} className="iv-card" style={{ width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-start justify-between mb-4 pb-4 iv-divider">
          <div>
            <h3 className="text-xl">{g?.name || (loading ? 'Loading…' : 'Guest')}</h3>
            <div style={lbl} className="mt-1">Guest Details {g?.vip ? '· ★ VIP' : ''}</div>
          </div>
          <button className="iv-btn iv-btn--ghost" onClick={onClose} style={{ fontSize: 12, padding: '4px 11px' }}>Close</button>
        </div>

        {loading && <div style={{ fontSize: 12, color: 'var(--iv-ink3)', padding: '10px 0' }}>Loading guest…</div>}
        {err && <div className="mb-3 text-sm" style={{ color: '#FF6B6B' }}>{err}</div>}

        {g && (
          <>
            <div className="mb-4">
              <Row label="Phone" value={g.phone} mono />
              <Row label="Email" value={g.email} />
              <Row label="ID Type" value={g.id_type} />
              {/* Legacy typed numbers stay visible for guests captured before the upload flow. */}
              {g.id_number ? <Row label="ID Number" value={g.id_number} mono /> : null}
              <Row label="Nationality" value={g.nationality} />
              <Row label="City" value={g.city} />
              <Row label="Country" value={g.country} />
              <Row label="Address" value={g.address} />
              {g.total_stays != null || g.total_spent != null ? (
                <Row label="History" value={`${g.total_stays || 0} stay${(g.total_stays || 0) === 1 ? '' : 's'} · ৳${Number(g.total_spent || 0).toLocaleString('en-US')}`} mono />
              ) : null}
            </div>

            <div className="mb-2">
              <label style={lbl}>ID Document</label>
              {!doc && <div style={{ fontSize: 12, color: 'var(--iv-ink3)' }}>No ID document uploaded for this guest.</div>}
              {doc && isPdfUrl(doc) && (
                <a className="iv-btn iv-btn--ghost" href={idDocHref(doc)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: '7px 12px', textDecoration: 'none', display: 'inline-block' }}>
                  📄 Open ID document (PDF)
                </a>
              )}
              {doc && !isPdfUrl(doc) && (
                <a href={idDocHref(doc)} target="_blank" rel="noopener noreferrer" title="Open full size" style={{ display: 'block' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={idDocHref(doc)} alt="Guest ID document" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--iv-border)', display: 'block' }} />
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
