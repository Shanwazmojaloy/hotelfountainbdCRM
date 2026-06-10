'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_v2XOonwuDa2gi-Z4-o40Og_1ig4AKec';
const supabase = createClient(SB_URL, SB_KEY, {
  global: { headers: { 'x-tenant-host': typeof window !== 'undefined' ? window.location.host : '' } },
});

type Res = {
  id: string; guest_name?: string; email?: string; phone?: string;
  room_ids?: string[]; room_type?: string; check_in?: string; check_out?: string;
  total_amount?: number; discount_amount?: number; paid_amount?: number; status?: string;
  created_at?: string;
};

const bdt = (n: number) => '৳' + Number(n || 0).toLocaleString('en-US');
const fmt = (d?: string) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const refOf = (id: string) => 'HF-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();

export default function InvoicePage() {
  const params = useParams();
  const id = String((params as { id?: string }).id || '');
  const [res, setRes] = useState<Res | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('reservations').select('*').eq('id', id).maybeSingle();
        if (!alive) return;
        if (data) { setRes(data as Res); setState('ok'); } else { setState('missing'); }
      } catch { if (alive) setState('missing'); }
    })();
    return () => { alive = false; };
  }, [id]);

  const C = {
    bg: '#07090E', panel: '#0D1117', card: '#1C1510', gold: '#C8A96E',
    tx: '#EEE8DC', tx2: '#C8B89A', tx3: '#7A6A5A', br: 'rgba(200,169,110,.2)',
  };

  const wrap: React.CSSProperties = { minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 14px', fontFamily: "var(--font-cormorant), Georgia, serif" };
  const sans = "var(--font-geist-sans), system-ui, sans-serif";

  if (state === 'loading') {
    return <div style={{ ...wrap, alignItems: 'center', color: C.tx3, fontFamily: sans, fontSize: 13 }}>Loading invoice…</div>;
  }
  if (state === 'missing' || !res) {
    return (
      <div style={{ ...wrap, alignItems: 'center', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 28, color: C.gold }}>Hotel <em style={{ fontStyle: 'italic' }}>Fountain</em></div>
        <div style={{ color: C.tx3, fontFamily: sans, fontSize: 13 }}>Invoice not found. Please check the link or contact the front desk.</div>
      </div>
    );
  }

  const room = (res.room_ids || [])[0] || 'TBC';
  const nights = (res.check_in && res.check_out)
    ? Math.max(1, Math.round((new Date(res.check_out).getTime() - new Date(res.check_in).getTime()) / 86400000)) : 1;
  const total = Number(res.total_amount || 0);
  const rate = nights > 0 ? Math.round(total / nights) : total;
  const discount = Number(res.discount_amount || 0);
  const paid = Number(res.paid_amount || 0);
  const balance = Math.max(0, total - discount - paid);
  const ref = refOf(res.id);

  const RowL = ({ l, v, gold }: { l: string; v: string; gold?: boolean }) => (
    <tr>
      <td style={{ padding: '7px 0', borderBottom: `1px solid rgba(200,169,110,.06)`, fontSize: 11, color: C.tx3, fontFamily: sans }}>{l}</td>
      <td style={{ padding: '7px 0', borderBottom: `1px solid rgba(200,169,110,.06)`, fontSize: 12, color: gold ? C.gold : C.tx, fontFamily: sans, textAlign: 'right' }}>{v}</td>
    </tr>
  );

  return (
    <div style={wrap}>
      <style>{`@media print{body{background:#fff}.noprint{display:none!important}}`}</style>
      <div style={{ width: '100%', maxWidth: 560, background: C.panel, border: `1px solid ${C.br}` }}>
        {/* Header */}
        <div style={{ background: C.card, padding: '30px 36px 22px', textAlign: 'center', borderBottom: `2px solid ${C.gold}` }}>
          <div style={{ fontSize: 10, letterSpacing: '.26em', color: C.gold, textTransform: 'uppercase', fontFamily: sans, marginBottom: 6 }}>Est. 2010 · Dhaka, Bangladesh</div>
          <div style={{ fontSize: 28, color: C.tx, fontWeight: 300 }}>Hotel <em style={{ color: C.gold, fontStyle: 'italic' }}>Fountain</em></div>
          <div style={{ display: 'inline-block', marginTop: 10, background: C.gold, color: C.bg, fontSize: 8.5, letterSpacing: '.2em', textTransform: 'uppercase', fontFamily: sans, padding: '4px 14px' }}>Booking Invoice</div>
        </div>

        <div style={{ padding: '26px 36px' }}>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: 18 }}>
            <tbody>
              <tr>
                <td style={{ fontFamily: sans, fontSize: 10, color: C.tx3 }}>Invoice Ref<br /><span style={{ fontSize: 14, color: C.gold }}>{ref}</span></td>
                <td style={{ fontFamily: sans, fontSize: 10, color: C.tx3, textAlign: 'right' }}>Status<br /><span style={{ fontSize: 13, color: res.status === 'RESERVED' ? '#4ADE80' : C.tx }}>{res.status || '—'}</span></td>
              </tr>
            </tbody>
          </table>

          {/* Guest + stay */}
          <div style={{ background: C.card, border: `1px solid ${C.br}`, padding: '18px 20px', marginBottom: 16 }}>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <RowL l="Guest" v={res.guest_name || '—'} />
                <RowL l="Room" v={`${room}${res.room_type ? ' · ' + res.room_type : ''}`} />
                <RowL l="Check-In" v={fmt(res.check_in)} />
                <RowL l="Check-Out" v={fmt(res.check_out)} />
                <RowL l="Duration" v={`${nights} night${nights !== 1 ? 's' : ''}`} />
                {res.email ? <RowL l="Email" v={res.email} /> : null}
                {res.phone ? <RowL l="Contact" v={res.phone} /> : null}
              </tbody>
            </table>
          </div>

          {/* Charges */}
          <div style={{ background: C.card, border: `1px solid ${C.br}`, padding: '18px 20px', marginBottom: 16 }}>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <RowL l={`Room charge (${bdt(rate)} × ${nights} night${nights !== 1 ? 's' : ''})`} v={bdt(rate * nights)} />
                {discount > 0 ? <RowL l="Discount" v={'− ' + bdt(discount)} /> : null}
                {paid > 0 ? <RowL l="Paid" v={bdt(paid)} gold /> : null}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ background: 'rgba(200,169,110,.06)', border: `1px solid rgba(200,169,110,.18)` }}>
            <tbody>
              <tr>
                <td style={{ padding: '12px 16px', fontFamily: sans, fontSize: 9.5, letterSpacing: '.14em', color: C.tx3, textTransform: 'uppercase' }}>Total Amount</td>
                <td style={{ padding: '12px 16px', fontFamily: sans, fontSize: 15, color: C.gold, textAlign: 'right' }}>{bdt(total)}</td>
              </tr>
              {balance > 0 ? (
                <tr>
                  <td style={{ padding: '0 16px 12px', fontFamily: sans, fontSize: 9.5, letterSpacing: '.14em', color: C.tx3, textTransform: 'uppercase' }}>Balance Due</td>
                  <td style={{ padding: '0 16px 12px', fontFamily: sans, fontSize: 13, color: '#E05C7A', textAlign: 'right' }}>{bdt(balance)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p style={{ fontSize: 9, color: C.tx3, fontFamily: sans, margin: '8px 2px 0' }}>* Inclusive of applicable 15% VAT and 5% service charge per hotel policy.</p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, margin: '18px 0' }}>
            <div style={{ fontSize: 10.5, color: C.tx3, fontFamily: sans, lineHeight: 1.7 }}>
              <strong style={{ color: C.tx2, fontWeight: 400 }}>Check-in:</strong> 11:00 AM &nbsp;|&nbsp; <strong style={{ color: C.tx2, fontWeight: 400 }}>Check-out:</strong> 12:00 PM<br />
              Thank you for choosing Hotel Fountain. Please present this invoice and a valid photo ID at the front desk on arrival.
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=1C1510&bgcolor=ffffff&data=https%3A%2F%2Fwa.me%2F8801322840799&qzone=1" width={64} height={64} style={{ display: 'block', margin: '0 auto' }} alt="WhatsApp QR" />
              <div style={{ fontSize: 7.5, letterSpacing: '.08em', textTransform: 'uppercase', color: C.tx3, fontFamily: sans, marginTop: 3 }}>Scan · WhatsApp Us</div>
            </div>
          </div>

          <button className="noprint" onClick={() => window.print()} style={{ width: '100%', padding: '12px', background: C.gold, color: C.bg, border: 'none', fontFamily: sans, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 600 }}>Print / Save PDF</button>
        </div>

        <div style={{ background: '#07090E', padding: '14px', textAlign: 'center', borderTop: `1px solid rgba(200,169,110,.06)` }}>
          <div style={{ fontSize: 9, color: C.tx3, fontFamily: sans }}>Hotel Fountain · House-05, Road-02, Nikunja-02, Dhaka 1229 · +880 1322-840799</div>
          <div style={{ fontSize: 8, color: '#3A3030', fontFamily: sans, marginTop: 3 }}>© {new Date().getFullYear()} Hotel Fountain · Powered by Lumea</div>
        </div>
      </div>
    </div>
  );
}
