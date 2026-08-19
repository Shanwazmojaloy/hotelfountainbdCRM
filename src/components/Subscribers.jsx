'use client';

// Subscriber Access — Hotel Growth OS client administration.
//
// PLATFORM screen, not hotel ops: it lists every OTHER tenant, their access state and
// this month's invoice. /api/crm/subscribers re-checks the signed cookie against the home
// tenant and 404s anyone else, so this file is convenience, not the boundary.
//
// The two questions it answers at a glance:
//   ACCESS   can they use the system right now, and why not
//   INVOICE  has this month's bill gone out, and has the money been verified
// They are deliberately separate columns. A sent invoice is not a payment, and an
// unsent invoice must never be read as a reason to lock someone out.
import { useState, useEffect, Fragment } from 'react';
import { Card, Table, Badge, HoverRow, TD, MONO, C, bdt } from './dskit';

const PLAN_LABEL = { starter: 'Starter', growth: 'Growth', full: 'Managed' };

// access_state comes from tenant_billing_state() or tenant_demo_state() in the view.
const ACCESS_TONE = {
  ok:             ['green',   'Active'],
  active:         ['green',   'Demo running'],
  due_soon:       ['amber',   'Due — banner'],
  past_due:       ['rose',    'Read-only'],
  blocked:        ['rose',    'Blocked'],
  expired:        ['neutral', 'Demo ended'],
  not_subscriber: ['neutral', '—'],
};
const INVOICE_TONE = {
  none:     ['neutral', 'Not raised'],
  not_sent: ['amber',   'Not sent'],
  sent:     ['blue',    'Sent'],
  verified: ['green',   'Verified'],
  void:     ['neutral', 'Void'],
};

const btn = (bg, fg = '#1C1510') => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${bg}`, background: bg, color: fg, fontFamily: 'var(--iv-body)',
  transition: 'opacity .15s cubic-bezier(.4,0,.2,1)',
});
const ghost = { ...btn('transparent', C.ink2), border: `1px solid ${C.br}` };

export default function Subscribers() {
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null); // tenant_id of the expanded row

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const r = await fetch('/api/crm/subscribers', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load subscribers.');
      setRows(j.rows || []);
      setSettings(j.settings || null);
      setErr('');
    } catch (e) { setErr(e.message || String(e)); } finally { setLoading(false); }
  }

  async function act(payload, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(payload.tenant_id || payload.invoice_id || 'x'); setErr('');
    try {
      const r = await fetch('/api/crm/subscribers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Action failed.');
      await load();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(null); }
  }

  const money = rows.reduce((a, r) => a + (r.sub_status === 'active' ? Number(r.rate_bdt || 0) : 0), 0);
  const unpaid = rows.filter((r) => ['past_due', 'due_soon'].includes(r.access_state)).length;

  return (
    <div style={{ padding: '0 0 40px' }}>
      <Card
        title="Subscriber Access"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.ink3 }}>
              {rows.filter((r) => r.sub_status === 'active').length} paying · {bdt(money)}/mo
              {unpaid > 0 && <span style={{ color: C.amb }}> · {unpaid} owing</span>}
            </span>
            <button style={ghost} onClick={load}>Refresh</button>
            <button
              style={btn(C.gold)}
              disabled={busy === 'x'}
              onClick={() => act({ action: 'open_month' }, 'Raise this month’s invoices for every active subscriber?\n\nSafe to run twice — nobody is billed a second time.')}
            >
              Raise this month
            </button>
          </div>
        }
      >
        {err && <div style={{ padding: '10px 16px', color: C.rose, fontSize: 12 }}>{err}</div>}
        {loading ? (
          <div style={{ padding: 24, color: C.ink3, fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: C.ink3, fontSize: 13 }}>No client tenants yet.</div>
        ) : (
          <Table head={['Hotel', 'Plan', 'Rate', 'Access', 'This month', 'Paid until', '']}>
            {rows.map((r) => {
              const [aTone, aLabel] = ACCESS_TONE[r.access_state] || ACCESS_TONE.not_subscriber;
              const [iTone, iLabel] = INVOICE_TONE[r.invoice_status] || INVOICE_TONE.none;
              const isDemo = r.sub_status === 'demo';
              const expanded = open === r.tenant_id;
              return (
                // key belongs on the Fragment — it is what map() returns. Keying the
                // children instead leaves the list unkeyed and React re-mounts rows.
                <Fragment key={r.tenant_id}>
                  <HoverRow onClick={() => setOpen(expanded ? null : r.tenant_id)}>
                    <td style={TD}>
                      <div style={{ fontWeight: 600 }}>{r.hotel_name}</div>
                      <div style={{ ...MONO, color: C.ink3 }}>{r.slug} · {r.hotel_city} · {r.rooms} rooms</div>
                    </td>
                    <td style={TD}>{isDemo ? <Badge tone="neutral">Demo</Badge> : (PLAN_LABEL[r.plan_tier] || r.plan_tier)}</td>
                    <td style={{ ...TD, ...MONO }}>{isDemo ? '—' : bdt(r.rate_bdt)}</td>
                    <td style={TD}><Badge tone={aTone}>{aLabel}</Badge></td>
                    <td style={TD}>{isDemo ? '—' : <Badge tone={iTone}>{iLabel}</Badge>}</td>
                    <td style={{ ...TD, ...MONO, color: C.ink2 }}>
                      {isDemo
                        ? (r.demo_expires_at ? new Date(r.demo_expires_at).toISOString().slice(0, 10) : '—')
                        : (r.sub_paid_until || '—')}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', color: C.ink3 }}>{expanded ? '▴' : '▾'}</td>
                  </HoverRow>

                  {expanded && (
                    <tr>
                      <td colSpan={7} style={{ ...TD, background: 'var(--iv-sunken)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <span style={{ ...MONO, color: C.ink3, marginRight: 8 }}>
                            {r.hotel_email || 'no email'} · {r.hotel_phone || 'no phone'}
                            {r.invoice_no ? ` · ${r.invoice_no} ${bdt(r.invoice_amount)}` : ''}
                          </span>

                          {isDemo && (
                            <>
                              {['starter', 'growth', 'full'].map((p) => (
                                <button key={p} style={btn(C.gold)} disabled={busy === r.tenant_id}
                                  onClick={() => act({ action: 'subscribe', tenant_id: r.tenant_id, plan: p },
                                    `Convert ${r.hotel_name} to the ${PLAN_LABEL[p]} plan?\n\nThe demo clock is removed and everything they built is kept.`)}>
                                  Subscribe · {PLAN_LABEL[p]}
                                </button>
                              ))}
                            </>
                          )}

                          {!isDemo && r.invoice_status === 'not_sent' && (
                            <button style={ghost} disabled={busy === r.invoice_id}
                              onClick={() => act({ action: 'mark_sent', invoice_id: r.invoice_id, tenant_id: r.tenant_id })}>
                              Mark invoice sent
                            </button>
                          )}

                          {!isDemo && ['not_sent', 'sent'].includes(r.invoice_status) && (
                            <button style={btn(C.grn)} disabled={busy === r.invoice_id}
                              onClick={() => {
                                const method = window.prompt('Payment method: bkash, nagad, bank or cash', 'bkash');
                                if (!method) return;
                                const reference = window.prompt('Reference / TrxID (optional)') || null;
                                act({ action: 'verify', invoice_id: r.invoice_id, tenant_id: r.tenant_id, method: method.toLowerCase().trim(), reference });
                              }}>
                              Verify payment
                            </button>
                          )}

                          {!isDemo && r.sub_status !== 'blocked' && (
                            <button style={ghost} disabled={busy === r.tenant_id}
                              onClick={() => act({ action: 'block', tenant_id: r.tenant_id },
                                `Block ${r.hotel_name}?\n\nThey cannot sign in until unblocked. All their data is kept.`)}>
                              Block
                            </button>
                          )}
                          {!isDemo && r.sub_status === 'blocked' && (
                            <button style={btn(C.grn)} disabled={busy === r.tenant_id}
                              onClick={() => act({ action: 'unblock', tenant_id: r.tenant_id })}>
                              Unblock
                            </button>
                          )}

                          <a href={`https://${r.slug}.lumea.fountainbd.com/crm`} target="_blank" rel="noreferrer"
                            style={{ ...ghost, textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
                            Open their CRM
                          </a>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </Card>

      {settings && (
        <Card title="Payment details shown on invoices">
          <div style={{ padding: '4px 16px 16px', fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>
            <div>bKash / Nagad · <span style={MONO}>{settings.bkash_number}</span></div>
            <div>{settings.bank_name} · {settings.bank_branch}</div>
            <div>{settings.bank_account_name} · <span style={MONO}>{settings.bank_account_no}</span></div>
            <div style={{ marginTop: 10, color: C.ink3, fontSize: 12 }}>
              Stored in <span style={MONO}>platform_billing_settings</span> — change it there, no deploy needed.
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
