'use client';

// AuthGate — restores the staff login gate on the /crm app (the legacy /crm.html had one;
// the new app shipped without it). Mirrors the legacy auth model EXACTLY: SHA-256(password)
// compared to staff.pwh, session persisted in localStorage as {id, session_v}, and a
// session_v match check so "Logout All Devices" (Settings → Security) invalidates everyone.
// Same client-side-on-anon-key model as /crm.html — this brings /crm to auth PARITY, the
// prerequisite for cutover. Every /crm/* route renders through <Layout>, so gating here
// gates the whole app.
import { useState, useEffect, createContext, useContext } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const AuthContext = createContext({ user: null, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | in | out
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { restore(); }, []);

  async function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem('lumea_session') || 'null');
      if (!saved?.id) { setStatus('out'); return; }
      const { data } = await getSupabaseClient().from('staff').select('id, name, role, session_v, activated').eq('tenant_id', TENANT).eq('id', saved.id).limit(1);
      const u = data && data[0];
      if (u && (u.session_v || 1) === saved.session_v) { setUser(u); setStatus('in'); }
      else { localStorage.removeItem('lumea_session'); setStatus('out'); }
    } catch { setStatus('out'); }
  }

  async function login(e) {
    e?.preventDefault?.();
    if (!email || !pw) return setErr('Email and password are required.');
    setBusy(true); setErr('');
    try {
      // Server-side verification — the password hash is compared on the server and
      // never reaches the browser (see app/api/crm/login). Only a minimal session returns.
      const r = await fetch('/api/crm/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Sign-in failed.');
      const s = j.session;
      localStorage.setItem('lumea_session', JSON.stringify({ id: s.id, session_v: s.session_v || 1 }));
      setUser(s); setStatus('in'); setPw('');
    } catch (e2) { setErr(e2.message || String(e2)); } finally { setBusy(false); }
  }

  function signOut() { try { localStorage.removeItem('lumea_session'); } catch {} setUser(null); setPw(''); setStatus('out'); }

  if (status === 'checking') {
    return <div className="crm-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A7F6E' }}>Loading…</div>;
  }

  if (status === 'out') {
    const field = { padding: '11px 14px', border: '1px solid #E0D8C8', borderRadius: 9, background: '#FFFDF8', width: '100%', fontSize: 15 };
    const lbl = { fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8A7F6E', marginBottom: 5, display: 'block' };
    return (
      <div className="crm-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <form onSubmit={login} className="iv-card" style={{ width: '100%', maxWidth: 400 }}>
          <div className="iv-brand" style={{ fontSize: 26 }}>Lumea<em> CRM</em></div>
          <div className="iv-side-tag mb-6" style={{ marginBottom: 24 }}>Hotel Fountain · Staff Sign In</div>
          <div className="mb-3"><label style={lbl}>Work Email</label><input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" /></div>
          <div className="mb-4"><label style={lbl}>Password</label><input style={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></div>
          {err && <div className="mb-3 text-sm" style={{ color: '#C0566A' }}>{err}</div>}
          <button type="submit" className="iv-btn" style={{ width: '100%', padding: '11px' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
          <div className="iv-stat__sub mt-4" style={{ textAlign: 'center' }}>
            Need to activate your account? <a href="/crm.html" style={{ color: '#8B6914' }}>Staff portal →</a>
          </div>
        </form>
      </div>
    );
  }

  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}
