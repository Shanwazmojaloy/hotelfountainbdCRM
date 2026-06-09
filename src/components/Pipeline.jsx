'use client';

// Pipeline — ported management tables from legacy LeadGenSwarmPanel + PlanGPanel.
// Tab 1: Swarm Leads (read swarm_leads, ranked by intent_score). Tab 2: Upsell Offers
// (read upsell_offers; accept/decline via the plan-g-upsell edge fn action 'accept_offer').
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const PLAN_G = 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/plan-g-upsell';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); } catch { return String(d).slice(0, 10); } };

const LEAD_STATUS = {
  new: { bg: 'rgba(139,111,176,0.15)', fg: '#6B53A0' },
  approved: { bg: 'rgba(56,132,180,0.15)', fg: '#2E6A8E' },
  contacted: { bg: 'rgba(217,164,65,0.15)', fg: '#8A6A1E' },
  replied: { bg: 'rgba(60,107,74,0.15)', fg: '#3C6B4A' },
};
const OFFER_STATUS = {
  sent: { bg: 'rgba(217,164,65,0.15)', fg: '#8A6A1E' },
  accepted: { bg: 'rgba(60,107,74,0.15)', fg: '#3C6B4A' },
  declined: { bg: 'rgba(192,86,106,0.15)', fg: '#A23B4E' },
};

function Badge({ map, s }) {
  const v = map[s] || { bg: '#EEE8DC', fg: '#8A7F6E' };
  return <span className="iv-badge" style={{ background: v.bg, color: v.fg }}>{s || '—'}</span>;
}

export default function Pipeline() {
  const [tab, setTab] = useState('leads');
  const [leads, setLeads] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { reload(); }, []);

  async function reload() {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [{ data: l }, { data: o }] = await Promise.all([
        supabase.from('swarm_leads').select('*').eq('tenant_id', TENANT).order('intent_score', { ascending: false }).limit(200),
        supabase.from('upsell_offers').select('*').eq('tenant_id', TENANT).order('created_at', { ascending: false }).limit(200),
      ]);
      setLeads(l || []);
      setOffers(o || []);
    } catch (e) { console.error('[Pipeline] load:', e); } finally { setLoading(false); }
  }

  async function respondOffer(offer, reply) {
    setBusy(offer.id + reply); setMsg('');
    try {
      const r = await fetch(PLAN_G, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ action: 'accept_offer', offer_id: offer.id, guest_reply: reply }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.error) throw new Error(j.error);
      setMsg(reply === 'yes' ? `✓ ${bdt(j.amount || offer.offer_price)} added to ${offer.guest_name}'s folio` : 'Offer marked declined');
      reload();
    } catch (e) { setMsg('Failed: ' + (e.message || String(e))); } finally { setBusy(''); }
  }

  const th = { color: '#8A7F6E', borderBottom: '1px solid #EAE3D6' };
  const td = { borderBottom: '1px solid #F0EBE0' };

  return (
    <div>
      <h1 className="text-3xl mb-6 pb-6 iv-divider">Pipeline</h1>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('leads')} className={tab === 'leads' ? 'iv-btn' : 'iv-btn iv-btn--ghost'} style={{ padding: '6px 14px', fontSize: 13 }}>Swarm Leads ({leads.length})</button>
        <button onClick={() => setTab('offers')} className={tab === 'offers' ? 'iv-btn' : 'iv-btn iv-btn--ghost'} style={{ padding: '6px 14px', fontSize: 13 }}>Upsell Offers ({offers.length})</button>
      </div>
      {msg && <div className="mb-4 text-sm" style={{ color: msg.startsWith('Failed') ? '#C0566A' : '#3C6B4A' }}>{msg}</div>}

      {tab === 'leads' && (
        <div className="iv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={th}>{['Name', 'Company', 'Type', 'Intent', 'Status', 'Contact', 'Added'].map((h) => <th key={h} className="text-left py-2 font-normal whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-3 iv-stat__sub">Loading…</td></tr>}
              {!loading && leads.length === 0 && <tr><td colSpan={7} className="py-3 iv-stat__sub">No leads yet — run the Lead-Gen Swarm scout on the AI Agents page.</td></tr>}
              {leads.map((l) => (
                <tr key={l.id} style={td}>
                  <td className="py-2"><div style={{ color: 'var(--iv-ink)', fontWeight: 500 }}>{l.full_name || '—'}</div><div className="iv-stat__sub">{l.title || ''}</div></td>
                  <td className="py-2">{l.company_name || '—'}<div className="iv-stat__sub">{l.area || ''}</div></td>
                  <td className="py-2"><span className="iv-badge">{l.lead_type || '—'}</span></td>
                  <td className="py-2 iv-mono" style={{ color: (l.intent_score || 0) >= 80 ? '#3C6B4A' : '#8B6914' }}>{l.intent_score ?? '—'}</td>
                  <td className="py-2"><Badge map={LEAD_STATUS} s={l.outreach_status} /></td>
                  <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{l.email || ''}<div>{l.phone || ''}</div></td>
                  <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{fmtDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'offers' && (
        <div className="iv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={th}>{['Guest', 'Room', 'Offer', 'Price', 'Status', 'Sent', ''].map((h) => <th key={h} className="text-left py-2 font-normal whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-3 iv-stat__sub">Loading…</td></tr>}
              {!loading && offers.length === 0 && <tr><td colSpan={7} className="py-3 iv-stat__sub">No upsell offers yet — run Plan-G on the AI Agents page.</td></tr>}
              {offers.map((o) => {
                const open = !/accepted|declined/i.test(o.status || '');
                return (
                  <tr key={o.id} style={td}>
                    <td className="py-2">{o.guest_name || '—'}</td>
                    <td className="py-2"><span className="iv-badge">{o.room_number || o.room || '—'}</span></td>
                    <td className="py-2">{o.offer_title || o.offer_type || '—'}</td>
                    <td className="py-2 iv-mono" style={{ color: '#8B6914' }}>{bdt(o.offer_price)}</td>
                    <td className="py-2"><Badge map={OFFER_STATUS} s={o.status} /></td>
                    <td className="py-2 text-xs" style={{ color: '#8A7F6E' }}>{fmtDate(o.sent_at || o.created_at)}</td>
                    <td className="py-2">
                      {open && (
                        <span className="flex gap-1">
                          <button className="iv-btn" style={{ padding: '3px 10px', fontSize: 12 }} disabled={!!busy} onClick={() => respondOffer(o, 'yes')}>{busy === o.id + 'yes' ? '…' : 'Accept'}</button>
                          <button className="iv-btn iv-btn--ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={!!busy} onClick={() => respondOffer(o, 'no')}>Decline</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
