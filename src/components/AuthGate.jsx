'use client';

// AuthGate — staff login gate for /crm. Premium dark split-screen design (hotel hero left,
// secure sign-in right) matching the legacy Staff Portal look. Auth is server-side:
//   Sign In   -> POST /api/crm/login   (verifies pwh on the service role, sets HttpOnly cookie)
//   Activate  -> POST /api/crm/send-otp then /api/crm/activate (sets password, signs in)
// Session persisted as localStorage {id, session_v}; session_v match honours Logout-All.
import { useState, useEffect, createContext, useContext } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const AuthContext = createContext({ user: null, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

const GOLD = '#C5A059';
const BG = '#15110D';
const CARD = '#1C1813';
const TX = '#E8E0D2';
const MUTED = '#9C8C72';
const serif = "Georgia, 'Libre Baskerville', 'Times New Roman', serif";
const mono = "'IBM Plex Mono', ui-monospace, monospace";

export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | in | out
  const [user, setUser] = useState(null);

  const [mode, setMode] = useState('signin'); // signin | activate
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // activate flow
  const [actStep, setActStep] = useState(1);
  const [actEmail, setActEmail] = useState('');
  const [actOtp, setActOtp] = useState('');
  const [actPw, setActPw] = useState('');
  const [actErr, setActErr] = useState('');
  const [actMsg, setActMsg] = useState('');
  const [actBusy, setActBusy] = useState(false);

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

  function applySession(s) {
    localStorage.setItem('lumea_session', JSON.stringify({ id: s.id, session_v: s.session_v || 1 }));
    setUser(s); setStatus('in'); setPw(''); setActPw(''); setActOtp('');
  }

  async function login(e) {
    e?.preventDefault?.();
    if (!email || !pw) return setErr('Enter your email and password.');
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/crm/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pw }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Sign-in failed.');
      applySession(j.session);
    } catch (e2) { setErr(e2.message || String(e2)); } finally { setBusy(false); }
  }

  async function requestOtp() {
    if (!actEmail) return setActErr('Enter your work email.');
    setActBusy(true); setActErr(''); setActMsg('');
    try {
      const r = await fetch('/api/crm/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: actEmail.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send code.');
      setActMsg('A 5-digit code was sent to ' + actEmail.trim() + '. Valid 5 minutes.');
      setActStep(2);
    } catch (e2) { setActErr(e2.message || String(e2)); } finally { setActBusy(false); }
  }

  async function activate() {
    if (!actOtp || !actPw) return setActErr('Enter the code and a new password.');
    setActBusy(true); setActErr('');
    try {
      const r = await fetch('/api/crm/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: actEmail.trim(), otp: actOtp.trim(), password: actPw }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Activation failed.');
      applySession(j.session);
    } catch (e2) { setActErr(e2.message || String(e2)); } finally { setActBusy(false); }
  }

  function signOut() { try { localStorage.removeItem('lumea_session'); } catch {} setUser(null); setStatus('out'); }

  if (status === 'checking') {
    return <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontFamily: mono, letterSpacing: '.2em', fontSize: 12 }}>LOADING…</div>;
  }
  if (status === 'in') {
    return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
  }

  // ── logged-out: dark split-screen login ──
  const lbl = { fontFamily: mono, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 6, display: 'block' };
  const input = { width: '100%', background: 'transparent', border: 'none', borderBottom: `1.5px solid rgba(197,160,89,.45)`, borderRadius: 0, padding: '9px 0', color: TX, fontSize: 15, outline: 'none', fontFamily: serif };
  const goldBtn = { width: '100%', justifyContent: 'center', padding: '13px', fontSize: 10, letterSpacing: '.22em', marginTop: 14, borderRadius: 3, background: '#2D2A26', color: '#F4ECDC', border: `1px solid rgba(197,160,89,.35)`, cursor: 'pointer', fontFamily: mono, fontWeight: 600 };
  const rule = (dim) => <div style={{ flex: 1, height: 1, background: dim ? 'rgba(197,160,89,.12)' : 'rgba(197,160,89,.35)' }} />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: BG, color: TX, fontFamily: serif }}>
      {/* LEFT HERO */}
      <div style={{ position: 'relative', flex: 1, display: 'none', overflow: 'hidden', borderRight: `1px solid rgba(197,160,89,.18)` }} className="lp-left-pane">
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/lp-bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(17,20,18,.62) 0%, rgba(15,17,14,.86) 60%, rgba(15,17,14,.95) 100%)' }} />
        <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', padding: '38px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{rule()}<span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '.22em', color: MUTED, whiteSpace: 'nowrap' }}>STAFF PORTAL · HOTEL FOUNTAIN BD</span>{rule(true)}</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <img src="/fountain-logo.png" alt="Hotel Fountain" style={{ width: 86, height: 86, objectFit: 'contain', marginBottom: 16, filter: 'drop-shadow(0 4px 16px rgba(0,0,0,.5))' }} />
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '.28em', color: GOLD, textTransform: 'uppercase' }}>Management CRM · Powered by Lumea</div>
            <div style={{ width: 60, height: 1, background: 'rgba(197,160,89,.4)', margin: '18px 0 34px' }} />
            <div style={{ width: '100%', maxWidth: 320, textAlign: 'left' }}>
              {[['Room Matrix', 'Live availability & status grid'], ['Guest Ledger', 'Automated billing in BDT'], ['Reservation Engine', 'Full booking lifecycle']].map(([t, d]) => (
                <div key={t} style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: 99, background: GOLD, marginTop: 6, flexShrink: 0, boxShadow: `0 0 8px ${GOLD}` }} />
                  <div><div style={{ fontSize: 15, color: '#F1EADB', fontWeight: 600 }}>{t}</div><div style={{ fontFamily: mono, fontSize: 10, color: MUTED, letterSpacing: '.04em', marginTop: 2 }}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{rule(true)}<span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '.22em', color: MUTED, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>Lumea · The Pulse of Modern Hospitality</span>{rule()}</div>
        </div>
      </div>

      {/* RIGHT — SIGN IN */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px clamp(20px, 6vw, 80px)' }}>
        <div style={{ position: 'absolute', top: 26, left: 'clamp(20px,6vw,80px)', right: 'clamp(20px,6vw,80px)', display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 9, letterSpacing: '.18em', color: MUTED, textTransform: 'uppercase' }}>
          <span>— Secure Staff Portal</span><span>v2.5.0</span>
        </div>

        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', background: CARD, borderTop: `2px solid ${GOLD}`, border: `1px solid rgba(197,160,89,.18)`, borderTopWidth: 2, padding: '34px 32px 30px', boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>
          {/* tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(197,160,89,.15)', marginBottom: 22 }}>
            {[['signin', 'Sign In'], ['activate', 'Activate Account']].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setErr(''); setActErr(''); setActStep(1); setActMsg(''); }}
                style={{ flex: 1, background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer', fontFamily: mono, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: mode === m ? GOLD : MUTED, borderBottom: mode === m ? `2px solid ${GOLD}` : '2px solid transparent' }}>{l}</button>
            ))}
          </div>

          {mode === 'signin' ? (
            <form onSubmit={login} autoComplete="off">
              <div style={{ textAlign: 'center', fontFamily: serif, fontSize: 22, color: GOLD, letterSpacing: '.04em' }}>Sign In</div>
              <div style={{ textAlign: 'center', color: 'rgba(197,160,89,.5)', fontSize: 11, letterSpacing: '.3em', margin: '4px 0 22px' }}>◆ · ◆ · ◆</div>
              <div style={{ marginBottom: 18 }}><label style={lbl}>Email</label><input style={input} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="your@email.com" autoComplete="username" /></div>
              <div style={{ marginBottom: 6 }}><label style={lbl}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...input, paddingRight: 30 }} type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} placeholder="Enter your password" autoComplete="current-password" />
                  <span onClick={() => setShowPw((p) => !p)} style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', fontSize: 13, color: MUTED, userSelect: 'none' }}>{showPw ? '🙈' : '👁'}</span>
                </div>
              </div>
              {err && <div style={{ marginTop: 12, fontSize: 12, color: '#E07A8B', background: 'rgba(224,122,139,.08)', border: '1px solid rgba(224,122,139,.25)', borderRadius: 4, padding: '8px 10px', fontFamily: mono, letterSpacing: '.03em' }}>{err}</div>}
              <button type="submit" style={goldBtn} disabled={busy}>{busy ? 'SIGNING IN…' : 'SIGN IN →'}</button>
              <div style={{ textAlign: 'center', marginTop: 20, fontFamily: mono, fontSize: 9, color: 'rgba(156,140,114,.6)', letterSpacing: '.12em', lineHeight: 1.7 }}>New staff: use the Activate Account tab.</div>
            </form>
          ) : (
            <div>
              <div style={{ textAlign: 'center', fontFamily: serif, fontSize: 22, color: GOLD, letterSpacing: '.04em' }}>Activate Account</div>
              <div style={{ textAlign: 'center', color: 'rgba(197,160,89,.5)', fontSize: 11, letterSpacing: '.3em', margin: '4px 0 22px' }}>◆ · ◆ · ◆</div>
              {actStep === 1 ? (
                <div>
                  <div style={{ textAlign: 'center', fontSize: 12, color: MUTED, marginBottom: 18, lineHeight: 1.6 }}>Enter your work email.<br />We'll send a 5-digit code to verify.</div>
                  <div style={{ marginBottom: 6 }}><label style={lbl}>Work Email</label><input style={input} type="email" value={actEmail} onChange={(e) => { setActEmail(e.target.value); setActErr(''); }} placeholder="your@email.com" /></div>
                  {actErr && <div style={{ marginTop: 12, fontSize: 12, color: '#E07A8B', fontFamily: mono }}>{actErr}</div>}
                  <button style={goldBtn} disabled={actBusy} onClick={requestOtp}>{actBusy ? 'SENDING…' : 'SEND CODE →'}</button>
                </div>
              ) : (
                <div>
                  {actMsg && <div style={{ fontSize: 11, color: '#7BC98E', marginBottom: 14, textAlign: 'center', padding: '8px', background: 'rgba(123,201,142,.07)', borderRadius: 4, border: '1px solid rgba(123,201,142,.18)', fontFamily: mono, lineHeight: 1.5 }}>{actMsg}</div>}
                  <div style={{ marginBottom: 16 }}><label style={lbl}>Verification Code</label><input style={{ ...input, letterSpacing: '.5em', fontSize: 20, textAlign: 'center', fontFamily: mono }} maxLength={5} value={actOtp} onChange={(e) => { setActOtp(e.target.value.replace(/\D/g, '')); setActErr(''); }} placeholder="12345" /></div>
                  <div style={{ marginBottom: 6 }}><label style={lbl}>Set Password</label><input style={input} type="password" value={actPw} onChange={(e) => { setActPw(e.target.value); setActErr(''); }} placeholder="Choose a password" autoComplete="new-password" /></div>
                  {actErr && <div style={{ marginTop: 12, fontSize: 12, color: '#E07A8B', fontFamily: mono }}>{actErr}</div>}
                  <button style={goldBtn} disabled={actBusy} onClick={activate}>{actBusy ? 'ACTIVATING…' : 'ACTIVATE →'}</button>
                  <div style={{ textAlign: 'center', marginTop: 14 }}><button onClick={() => { setActStep(1); setActErr(''); setActMsg(''); }} style={{ background: 'none', border: 'none', color: MUTED, fontFamily: mono, fontSize: 9, letterSpacing: '.12em', cursor: 'pointer' }}>← use a different email</button></div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontFamily: mono, fontSize: 8.5, letterSpacing: '.2em', color: 'rgba(156,140,114,.5)', textTransform: 'uppercase' }}>Lumea · Hotel Fountain BD Management CRM</div>
      </div>

      <style>{`@media (min-width: 900px){ .lp-left-pane{ display:block !important; } }`}</style>
    </div>
  );
}
