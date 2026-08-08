'use client';

// Referrals — the SENDER for referral_queue (added 2026-08-09).
//
// Background: agent_referral_queue_builder has queued a post-checkout referral message for
// every valid-BD-phone guest since 2026-05-12, but no consumer ever existed — 210 messages
// sat unsent for three months. This stack has no WhatsApp Business API, so the send channel
// is a wa.me deep link: the front desk taps "Send on WhatsApp", WhatsApp opens with the
// message pre-filled, and we record the send against the row.
//
// Honest limitation (do not paper over it): wa.me cannot confirm the guest actually received
// or read anything. "Sent" here means "the front desk opened WhatsApp for this guest" — it is
// an action log, not a delivery receipt. The Sent count must never be reported as delivery.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthGate';

// BD numbers arrive as 01XXXXXXXXX / +8801XXXXXXXXX / 8801XXXXXXXXX. wa.me wants digits only,
// country code included, no plus.
function waNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('880')) return d.length === 13 ? d : null;
  if (d.startsWith('0')) return d.length === 11 ? '88' + d : null;
  if (d.length === 10) return '880' + d;
  return null;
}

const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', yyyy: undefined, year: 'numeric' }) : '—');

export default function Referrals() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const [showSent, setShowSent] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch(`/api/crm/referrals${showSent ? '?all=1' : ''}`, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load referrals.');
      setRows(j.rows || []);
    } catch (e) {
      setErr(e.message || 'Could not load referrals.');
    } finally {
      setLoading(false);
    }
  }, [showSent]);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => rows.filter((r) => !r.sent), [rows]);
  const unreachable = useMemo(() => pending.filter((r) => !waNumber(r.phone)).length, [pending]);

  async function send(row) {
    const num = waNumber(row.phone);
    if (!num) return;
    // Open WhatsApp FIRST (must happen inside the click gesture or mobile Safari blocks it),
    // then record the send.
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(row.message || '')}`, '_blank', 'noopener,noreferrer');
    setBusy(row.id);
    try {
      const r = await fetch('/api/crm/referrals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      if (!r.ok) throw new Error();
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, sent: true, sent_at: new Date().toISOString() } : x)));
    } catch {
      setErr('WhatsApp opened, but the send could not be recorded — refresh and check.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="iv-card" style={{ padding: '2rem' }}>Loading referrals…</div>;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div className="iv-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Referral Queue</h2>
            <p style={{ margin: '.35rem 0 0', opacity: .7, fontSize: '.9rem' }}>
              Post-checkout referral messages, queued automatically. Tap to open WhatsApp with the
              message ready — nothing is sent without you.
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', opacity: .8 }}>
            <input type="checkbox" checked={showSent} onChange={(e) => setShowSent(e.target.checked)} />
            Include already sent
          </label>
        </div>

        <div style={{ display: 'flex', gap: '2rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
          <div><div style={{ fontFamily: 'var(--iv-mono, monospace)', fontSize: '1.5rem', fontWeight: 700 }}>{pending.length}</div><div style={{ fontSize: '.8rem', opacity: .7 }}>waiting to send</div></div>
          {unreachable > 0 && (
            <div><div style={{ fontFamily: 'var(--iv-mono, monospace)', fontSize: '1.5rem', fontWeight: 700 }}>{unreachable}</div><div style={{ fontSize: '.8rem', opacity: .7 }}>unusable phone number</div></div>
          )}
        </div>
      </div>

      {err && <div className="iv-card" style={{ padding: '1rem 2rem', borderColor: '#b45309' }}>{err}</div>}

      <div className="iv-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '1rem 1.25rem' }}>Guest</th>
              <th style={{ padding: '1rem 1.25rem' }}>Phone</th>
              <th style={{ padding: '1rem 1.25rem' }}>Room</th>
              <th style={{ padding: '1rem 1.25rem' }}>Checked out</th>
              <th style={{ padding: '1rem 1.25rem' }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '2rem 1.25rem', opacity: .7 }}>Nothing queued. New rows appear automatically after checkout.</td></tr>
            )}
            {rows.map((r) => {
              const num = waNumber(r.phone);
              return (
                <tr key={r.id} style={{ borderTop: '1px solid #EAE6DD' }}>
                  <td style={{ padding: '1rem 1.25rem' }}>{r.guest_name || '—'}</td>
                  <td style={{ padding: '1rem 1.25rem', fontFamily: 'var(--iv-mono, monospace)' }}>{r.phone || '—'}</td>
                  <td style={{ padding: '1rem 1.25rem' }}>{r.room || '—'}</td>
                  <td style={{ padding: '1rem 1.25rem' }}>{fmtDate(r.checkout_date)}</td>
                  <td style={{ padding: '1rem 1.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.sent ? (
                      <span style={{ opacity: .65 }}>Sent</span>
                    ) : !num ? (
                      <span style={{ opacity: .65 }} title="Not a usable Bangladeshi mobile number">No valid number</span>
                    ) : (
                      <button className="iv-btn" disabled={busy === r.id} onClick={() => send(r)}>
                        {busy === r.id ? 'Opening…' : 'Send on WhatsApp'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '.8rem', opacity: .6, margin: 0 }}>
        “Sent” records that WhatsApp was opened for this guest — it is not a delivery or read
        receipt. Signed in as {user?.name || 'staff'}.
      </p>
    </div>
  );
}
