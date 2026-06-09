'use client';

// AIAgents — ported from legacy AIAgentsPanel. Three Gemini-backed agents hitting the
// existing Supabase edge function `ai-agents`: Prospector (find leads), Closer (draft
// outreach for a lead id), Analyst (revenue pattern + discount suggestion). Heavier panels
// (Council, Lead-gen swarm, Workflow monitor, AI research) remain in /crm.html for now.
import { useState } from 'react';

const EDGE = 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/ai-agents';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');

async function callAgent(action, extra = {}) {
  try {
    const r = await fetch(EDGE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { return { error: 'Non-JSON response', raw: txt.slice(0, 600) }; }
  } catch (e) { return { error: String(e?.message || e) }; }
}

function Card({ icon, title, color, desc, children }) {
  return (
    <div className="iv-card mb-5" style={{ borderTop: `3px solid ${color}` }}>
      <div className="mb-3 pb-3 iv-divider">
        <div className="text-lg">{icon} {title}</div>
        <div className="iv-stat__sub" style={{ marginTop: 2 }}>{desc}</div>
      </div>
      {children}
    </div>
  );
}

const field = { padding: '8px 12px', border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8', width: '100%', fontSize: 14 };
const lbl = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A7F6E', marginBottom: 4, display: 'block' };
const pre = { background: '#FBF7EE', border: '1px solid #EAE3D6', borderRadius: 8, padding: '12px 14px', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', color: '#4A443B', marginTop: 10, maxHeight: 320, overflow: 'auto' };

export default function AIAgents() {
  const [prospectQ, setProspectQ] = useState('event planners in Dhaka needing hotel rooms');
  const [prospectRes, setProspectRes] = useState(null);
  const [prospectBusy, setProspectBusy] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [closerRes, setCloserRes] = useState(null);
  const [closerBusy, setCloserBusy] = useState(false);
  const [analystRes, setAnalystRes] = useState(null);
  const [analystBusy, setAnalystBusy] = useState(false);

  async function runProspect() { setProspectBusy(true); setProspectRes(null); setProspectRes(await callAgent('prospect', { query: prospectQ })); setProspectBusy(false); }
  async function runCloser() { if (!leadId.trim()) return; setCloserBusy(true); setCloserRes(null); setCloserRes(await callAgent('close', { lead_id: leadId.trim() })); setCloserBusy(false); }
  async function runAnalyst() { setAnalystBusy(true); setAnalystRes(null); setAnalystRes(await callAgent('analyze')); setAnalystBusy(false); }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 className="text-3xl mb-2 pb-6 iv-divider">AI Agents</h1>
      <div className="iv-stat__sub mb-6">Gemini-backed · connected to live Supabase data. {!ANON && <span style={{ color: '#C0566A' }}>· anon key not in build env</span>}</div>

      <Card icon="🔍" title="Prospector" color="#3884B4" desc="Finds potential leads and saves them to your leads table">
        <label style={lbl}>Search Query</label>
        <input style={field} value={prospectQ} onChange={(e) => setProspectQ(e.target.value)} />
        <button className="iv-btn mt-3" onClick={runProspect} disabled={prospectBusy}>{prospectBusy ? 'Scanning…' : 'Find Leads'}</button>
        {prospectRes && (prospectRes.error
          ? <div style={pre}>{prospectRes.error}{prospectRes.raw ? '\n\n' + prospectRes.raw : ''}</div>
          : <div className="mt-3">
              <div className="iv-stat__sub mb-2">✓ {prospectRes.leads_found ?? (prospectRes.raw_leads || prospectRes.leads || []).length} leads found, saved &amp; emailed</div>
              {(prospectRes.raw_leads || prospectRes.leads || []).map((l, i) => (
                <div key={i} style={{ border: '1px solid #EAE3D6', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name} <span className="iv-stat__sub">· {l.company}</span></div>
                  <div className="iv-stat__sub">{l.email} · {l.phone}</div>
                  {l.notes && <div className="text-sm" style={{ color: '#2E6A8E', marginTop: 4 }}>{l.notes}</div>}
                </div>
              ))}
            </div>)}
      </Card>

      <Card icon="✉️" title="Closer" color="#8B6914" desc="Writes a personalized outreach email for a lead">
        <label style={lbl}>Lead ID (from leads table)</label>
        <input style={field} value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="123e4567-e89b-12d3…" />
        <button className="iv-btn mt-3" onClick={runCloser} disabled={closerBusy}>{closerBusy ? 'Writing…' : 'Write Outreach'}</button>
        {closerRes && (closerRes.error
          ? <div style={pre}>{closerRes.error}</div>
          : <div className="mt-3"><div className="iv-stat__sub mb-2">Draft for <strong>{closerRes.lead_name}</strong> — saved to lead notes</div><div style={pre}>{closerRes.email_draft}</div></div>)}
      </Card>

      <Card icon="📊" title="Analyst" color="#3C6B4A" desc="Monitors transactions, spots patterns, suggests discounts">
        <button className="iv-btn iv-btn--ghost" onClick={runAnalyst} disabled={analystBusy}>{analystBusy ? 'Analyzing…' : 'Run Analysis'}</button>
        {analystRes && (analystRes.error
          ? <div style={pre}>{analystRes.error}</div>
          : <div className="mt-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {Object.entries(analystRes.day_averages || {}).sort(([, a], [, b]) => b - a).map(([day, avg]) => (
                  <div key={day} style={{ border: '1px solid #EAE3D6', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={lbl}>{day}</div>
                    <div className="iv-mono" style={{ color: day === analystRes.lowest_day ? '#C0566A' : day === analystRes.highest_day ? '#3C6B4A' : '#2B2722' }}>{bdt(avg)}</div>
                  </div>
                ))}
              </div>
              {analystRes.analysis && <div style={pre}>{analystRes.analysis}</div>}
              {analystRes.suggested_discount && <div className="iv-stat__sub mt-3">Suggested discount: <strong>{analystRes.suggested_discount}</strong> (apply in Settings → Hotel Info)</div>}
            </div>)}
      </Card>

      <div className="iv-stat__sub mt-2">Council, Lead-gen swarm, Workflow monitor and AI research remain in the legacy admin.</div>
    </div>
  );
}
