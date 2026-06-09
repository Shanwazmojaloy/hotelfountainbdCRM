'use client';

// Council — ported from legacy CouncilPage. AI Advisory Council: 5 panelists + 1 chairman
// via the existing Next.js API route /api/council/deliberate. Hotel-context (optionally
// scoped to a reservation) or general-strategy mode, with session history.
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const ROLES = [
  { id: 'devils_advocate', label: "Devil's Advocate", ico: '⚔', color: '#C0566A' },
  { id: 'first_principles', label: 'First-Principles', ico: '△', color: '#3884B4' },
  { id: 'optimist', label: 'The Optimist', ico: '☀', color: '#D9A441' },
  { id: 'rationalist', label: 'The Rationalist', ico: '≡', color: '#4A9B8E' },
  { id: 'executor', label: 'The Executor', ico: '▶', color: '#4A7C59' },
];

export default function Council() {
  const [prompt, setPrompt] = useState('');
  const [scopeMode, setScopeMode] = useState('hotel');
  const [resId, setResId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeRole, setActiveRole] = useState('chairman');
  const [reservations, setReservations] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getSupabaseClient().from('reservations').select('id, room_ids, total_amount, status')
      .in('status', ['CHECKED_IN', 'CONFIRMED', 'RESERVED']).limit(50)
      .then(({ data }) => setReservations(data || []));
  }, []);

  useEffect(() => {
    fetch(`/api/council/deliberate?tenant_id=${TENANT}&limit=15`)
      .then((r) => r.json()).then((j) => setHistory(j?.sessions || [])).catch(() => {});
  }, [result]);

  async function deliberate() {
    if (!prompt.trim()) return;
    setLoading(true); setResult(null); setErr('');
    try {
      const r = await fetch('/api/council/deliberate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), scope_mode: scopeMode, reservation_id: scopeMode === 'hotel' && resId ? resId : undefined, tenant_id: TENANT }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || 'Failed');
      setResult(j); setActiveRole('chairman');
    } catch (e) { setErr(String(e.message || e)); } finally { setLoading(false); }
  }

  const allPanels = result ? [...result.panelists, result.chairman] : [];
  const active = allPanels.find((p) => p.role === activeRole);
  const lbl = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A7F6E' };
  const field = { padding: '8px 12px', border: '1px solid #E0D8C8', borderRadius: 8, background: '#FFFDF8', fontSize: 13 };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="flex items-end justify-between mb-6 pb-6 iv-divider">
        <div>
          <h1 className="text-3xl">AI Advisory <span style={{ color: '#8B6914' }}>Council</span></h1>
          <div style={lbl} className="mt-1">Five panelists · one chairman · one hardened verdict</div>
        </div>
        <button className="iv-btn iv-btn--ghost" onClick={() => setHistoryOpen((v) => !v)}>{historyOpen ? 'Hide' : 'History'} ({history.length})</button>
      </div>

      {historyOpen && (
        <div className="iv-card mb-6" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {history.length === 0 && <div className="iv-stat__sub">No prior sessions.</div>}
          {history.map((h) => (
            <div key={h.session_id} className="cursor-pointer" style={{ padding: '8px 0', borderBottom: '1px solid #F0EBE0' }}
              onClick={() => {
                const panelArr = (h.panelists || []).map((p) => ({ role: p.role, label: ROLES.find((r) => r.id === p.role)?.label || 'Chairman', verdict: p.verdict, tokens_out: p.tokens_out, cost_bdt: +p.cost_bdt || 0, latency_ms: p.latency_ms }));
                const chair = panelArr.find((p) => p.role === 'chairman');
                setPrompt(h.prompt);
                setResult({ session_id: h.session_id, panelists: panelArr.filter((p) => p.role !== 'chairman'), chairman: chair || { role: 'chairman', label: 'The Chairman', verdict: h.chairman_verdict || '', tokens_out: 0, cost_bdt: 0, latency_ms: 0 }, totals: { total_tokens_in: h.total_tokens_in, total_tokens_out: h.total_tokens_out, total_cost_bdt: +h.total_cost_bdt || 0 } });
                setActiveRole('chairman'); setHistoryOpen(false);
              }}>
              <div className="text-sm" style={{ color: 'var(--iv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.prompt}</div>
              <div className="iv-mono" style={{ fontSize: 10, color: '#8A7F6E', marginTop: 2 }}>{new Date(h.created_at).toLocaleString()} · ৳{(+h.total_cost_bdt || 0).toFixed(2)} · {h.status}</div>
            </div>
          ))}
        </div>
      )}

      <div className="iv-card mb-8">
        <div className="flex gap-2 items-center mb-3 flex-wrap">
          <span style={lbl}>Mode</span>
          {[['hotel', 'Hotel Context'], ['general', 'General Strategy']].map(([m, l]) => (
            <button key={m} onClick={() => setScopeMode(m)} className={scopeMode === m ? 'iv-btn' : 'iv-btn iv-btn--ghost'} style={{ padding: '4px 12px', fontSize: 12 }}>{l}</button>
          ))}
          {scopeMode === 'hotel' && (
            <select value={resId} onChange={(e) => setResId(e.target.value)} style={{ ...field, marginLeft: 'auto', minWidth: 240 }}>
              <option value="">— No specific reservation —</option>
              {reservations.map((r) => <option key={r.id} value={r.id}>{(r.room_ids || []).join(',')} · ৳{Number(r.total_amount || 0).toLocaleString()}</option>)}
            </select>
          )}
        </div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} maxLength={6000}
          placeholder="e.g. Should we launch a corporate-rate program targeting Gulshan/Banani tech firms for Q3?"
          style={{ width: '100%', ...field, resize: 'vertical' }} />
        <div className="flex justify-between items-center mt-3">
          <div className="iv-mono" style={{ fontSize: 10, color: '#8A7F6E' }}>{prompt.length}/6000</div>
          <button className="iv-btn" onClick={deliberate} disabled={loading || !prompt.trim()}>{loading ? '⟳ Deliberating…' : 'Convene Council'}</button>
        </div>
        {err && <div className="mt-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}
      </div>

      {(loading || result) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {ROLES.map((role) => {
            const panel = result?.panelists?.find((p) => p.role === role.id);
            return (
              <div key={role.id} onClick={() => panel && setActiveRole(role.id)} className="iv-card"
                style={{ borderTop: `3px solid ${activeRole === role.id ? role.color : '#EAE3D6'}`, cursor: panel ? 'pointer' : 'default', opacity: panel ? 1 : 0.5, padding: '12px 14px' }}>
                <div className="flex items-center gap-2 mb-1"><span style={{ color: role.color, fontSize: 15 }}>{role.ico}</span><span style={lbl}>{role.label}</span></div>
                <div className="iv-mono" style={{ fontSize: 10, color: '#8A7F6E' }}>{panel ? `${panel.tokens_out}t · ৳${(+panel.cost_bdt || 0).toFixed(2)}` : loading ? '⟳ thinking…' : '—'}</div>
              </div>
            );
          })}
        </div>
      )}

      {result && (
        <div onClick={() => setActiveRole('chairman')} className="iv-card mb-6"
          style={{ border: `2px solid ${activeRole === 'chairman' ? '#8B6914' : '#EAE3D6'}`, cursor: 'pointer' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span style={{ color: '#8B6914', fontSize: 17 }}>⬢</span><span className="text-lg">The Chairman — Final Verdict</span></div>
            <div className="iv-mono" style={{ fontSize: 10, color: '#8A7F6E' }}>{result.chairman.tokens_out}t · ৳{(+result.chairman.cost_bdt || 0).toFixed(2)}</div>
          </div>
        </div>
      )}

      {active && (
        <div className="iv-card mb-4">
          <div style={lbl} className="mb-3">{active.label}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, color: 'var(--iv-ink)', lineHeight: 1.65, margin: 0 }}>{active.verdict}</pre>
        </div>
      )}

      {result && <div className="iv-mono text-right mt-4" style={{ fontSize: 11, color: '#8A7F6E' }}>SESSION TOTAL · {result.totals.total_tokens_in}t in · {result.totals.total_tokens_out}t out · ৳{(+result.totals.total_cost_bdt || 0).toFixed(2)}</div>}
    </div>
  );
}
