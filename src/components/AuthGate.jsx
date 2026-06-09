'use client';

// AuthGate — staff login gate for /crm. Rendered in the Hotel Fountain Design System
// "Warm Ivory Editorial" login (centered ivory card on a walnut field, gold-italic serif
// titles, OTP digits). Auth is server-side:
//   Sign In   -> POST /api/crm/login   (verifies pwh on the service role, sets HttpOnly cookie)
//   Activate  -> POST /api/crm/send-otp then /api/crm/activate (sets password, signs in)
// Session persisted as localStorage {id, session_v}; session_v match honours Logout-All.
import { useState, useEffect, createContext, useContext } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const AuthContext = createContext({ user: null, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

// Design-system palette (literals — AuthGate renders outside .crm-root).
const PARCH = '#F5F0E8', WALNUT = '#1C1510', WHITE = '#FFFFFF';
const GOLD = '#8B6914', GOLD2 = '#6B4E0A', GOLDL = '#C8A96E';
const TX = '#1C1510', TX2 = '#5C4A2A', TX3 = '#9A8070', BR = '#D4C9B5';
const serif = "'Libre Baskerville', Georgia, 'Times New Roman', serif";
const sans = "'DM Sans', system-ui, -apple-system, sans-serif";
const mono = "'IBM Plex Mono', ui-monospace, monospace";

// Persists the verified session across route re-mounts so switching tabs is instant
// (no LOADING flash / re-fetch). Cleared on sign-out.
let _authCache = null;

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(_authCache ? 'in' : 'checking'); // checking | in | out
  const [user, setUser] = useState(_authCache);

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

  // Optimistic restore: if a saved session exists, paint the app IMMEDIATELY (no blocking
  // network gate / LOADING screen) and verify against Supabase in the background. This is what
  // keeps tab switches and reloads from flashing a black "checking" screen.
  useEffect(() => {
    if (_authCache) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('lumea_session') || 'null'); } catch { /* ignore */ }
    if (saved?.id) {
      const optimistic = { id: saved.id, name: saved.name, role: saved.role };
      _authCache = optimistic; setUser(optimistic); setStatus('in');
      validateSession(saved);
    } else {
      setStatus('out');
    }
  }, []);

  async function validateSession(saved) {
    try {
      const { data } = await getSupabaseClient().from('staff').select('id, name, role, session_v, activated').eq('tenant_id', TENANT).eq('id', saved.id).limit(1);
      const u = data && data[0];
      if (u && (u.session_v || 1) === saved.session_v) { _authCache = u; setUser(u); }
      else { try { localStorage.removeItem('lumea_session'); } catch { /* ignore */ } _authCache = null; setUser(null); setStatus('out'); }
    } catch { /* transient/offline — keep the optimistic session, don't bounce the user to login */ }
  }

  function applySession(s) {
    localStorage.setItem('lumea_session', JSON.stringify({ id: s.id, session_v: s.session_v || 1, name: s.name, role: s.role }));
    _authCache = s; setUser(s); setStatus('in'); setPw(''); setActPw(''); setActOtp('');
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

  function signOut() { try { localStorage.removeItem('lumea_session'); } catch {} _authCache = null; setUser(null); setStatus('out'); }

  if (status === 'checking') {
    // Ivory (never near-black) so the split-second before the optimistic flip is seamless.
    return <div style={{ minHeight: '100vh', background: PARCH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TX3, fontFamily: mono, letterSpacing: '.2em', fontSize: 12 }} />;
  }
  if (status === 'in') {
    return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
  }

  // ── logged-out: design-system ivory login on a walnut field ──
  const eyebrow = mode === 'signin' ? 'Staff Portal' : 'Staff Activation';
  const title = mode === 'signin' ? ['Welcome', 'Back']
    : actStep === 1 ? ['Activate', 'Account'] : ['Verify &', 'Finish'];

  const fieldWrap = { marginBottom: 14 };
  const labelSt = { display: 'block', fontFamily: sans, fontSize: 9, letterSpacing: '.14em', color: TX3, textTransform: 'uppercase', fontWeight: 600, marginBottom: 5 };
  const inputSt = { width: '100%', background: WHITE, border: `1px solid ${BR}`, color: TX, fontFamily: sans, fontSize: 13, padding: '10px 12px', outline: 'none', boxSizing: 'border-box', borderRadius: 0 };
  const onFocus = (e) => (e.target.style.borderColor = WALNUT);
  const onBlur = (e) => (e.target.style.borderColor = BR);
  const goldBtn = (disabled) => ({ width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: sans, fontWeight: 600, letterSpacing: '.10em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 0, padding: '12px 24px', fontSize: 12, marginTop: 8, background: WALNUT, color: GOLDL, border: `2px solid ${WALNUT}`, opacity: disabled ? 0.4 : 1, transition: 'background .15s cubic-bezier(.4,0,.2,1)' });
  const linkBtn = { background: 'none', border: 'none', cursor: 'pointer', fontFamily: sans, fontSize: 11, letterSpacing: '.04em', color: GOLD, textTransform: 'uppercase', fontWeight: 600, padding: 0 };
  const subText = { textAlign: 'center', fontSize: 12, color: TX2, lineHeight: 1.5, margin: '8px 0 20px' };
  const errBox = (t) => <div style={{ marginTop: 10, marginBottom: 4, fontSize: 11, color: '#B91C1C', fontFamily: sans }}>{t}</div>;

  return (
    <div style={{ minHeight: '100vh', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: WALNUT, position: 'relative', overflow: 'hidden', fontFamily: sans }}>
      {/* radial glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 50% at 20% 30%, rgba(200,169,110,.08), transparent 65%), radial-gradient(ellipse 50% 60% at 80% 70%, rgba(200,169,110,.05), transparent 60%)' }} />
      {/* fine grid texture */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(0deg, rgba(200,169,110,.025) 0px, rgba(200,169,110,.025) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(200,169,110,.025) 0px, rgba(200,169,110,.025) 1px, transparent 1px, transparent 40px)' }} />

      <div style={{ background: PARCH, border: '1px solid rgba(200,169,110,.2)', borderTop: `4px solid ${GOLDL}`, padding: '40px 42px', width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
        {/* logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <img src="/fountain-logo.png" alt="Hotel Fountain" style={{ width: 96, height: 'auto', objectFit: 'contain' }} />
        </div>
        {/* eyebrow divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#D4C9B5)' }} />
          <span style={{ fontSize: 8, color: TX3, letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 500, whiteSpace: 'nowrap' }}>{eyebrow}</span>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#D4C9B5,transparent)' }} />
        </div>

        {/* step dots (activation) */}
        {mode === 'activate' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 12 }}>
            {[1, 2].map((s) => {
              const on = s <= actStep;
              return <span key={s} style={{ width: on ? 20 : 7, height: 4, background: on ? GOLD : BR, transition: 'all .2s cubic-bezier(.4,0,.2,1)' }} />;
            })}
          </div>
        )}

        {/* title */}
        <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: TX, textAlign: 'center', lineHeight: 1.1 }}>
          {title[0]} <em style={{ fontStyle: 'italic', color: GOLD, fontWeight: 400 }}>{title[1]}</em>
        </div>

        {mode === 'signin' ? (
          <form onSubmit={login} autoComplete="off">
            <p style={subText}>Sign in with your email and password.</p>
            <div style={fieldWrap}>
              <label style={labelSt}>Work Email</label>
              <input style={inputSt} onFocus={onFocus} onBlur={onBlur} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="you@hotelfountain.com" autoComplete="username" />
            </div>
            <div style={fieldWrap}>
              <label style={labelSt}>Password</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...inputSt, paddingRight: 34 }} onFocus={onFocus} onBlur={onBlur} type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} placeholder="••••••••" autoComplete="current-password" />
                <span onClick={() => setShowPw((p) => !p)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', fontSize: 13, color: TX3, userSelect: 'none' }}>{showPw ? '🙈' : '👁'}</span>
              </div>
            </div>
            {err && errBox(err)}
            <button type="submit" style={goldBtn(busy)} disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: TX3 }}>
              First time here?{' '}
              <button type="button" style={linkBtn} onClick={() => { setMode('activate'); setErr(''); setActStep(1); setActErr(''); setActMsg(''); }}>Activate account</button>
            </div>
          </form>
        ) : actStep === 1 ? (
          <div>
            <p style={subText}>Enter your work email — we&apos;ll send a 5-digit code to verify it&apos;s you.</p>
            <div style={fieldWrap}>
              <label style={labelSt}>Work Email</label>
              <input style={inputSt} onFocus={onFocus} onBlur={onBlur} type="email" value={actEmail} onChange={(e) => { setActEmail(e.target.value); setActErr(''); }} placeholder="you@hotelfountain.com" autoFocus />
            </div>
            {actErr && errBox(actErr)}
            <button style={goldBtn(actBusy)} disabled={actBusy} onClick={requestOtp}>{actBusy ? 'Sending…' : 'Send Code'}</button>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: TX3 }}>
              Already activated?{' '}
              <button type="button" style={linkBtn} onClick={() => { setMode('signin'); setActErr(''); }}>Sign in</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={subText}>Enter the code sent to<br /><strong style={{ color: TX, fontFamily: mono, fontSize: 12 }}>{actEmail}</strong> and choose a password.</p>
            {actMsg && <div style={{ fontSize: 10.5, color: '#15803D', marginBottom: 14, textAlign: 'center', padding: 8, background: 'rgba(21,128,61,.07)', border: '1px solid rgba(21,128,61,.18)', fontFamily: sans, lineHeight: 1.5 }}>{actMsg}</div>}
            <div style={fieldWrap}>
              <label style={labelSt}>Verification Code</label>
              <input style={{ ...inputSt, letterSpacing: '.5em', fontSize: 20, textAlign: 'center', fontFamily: mono }} onFocus={onFocus} onBlur={onBlur} maxLength={5} inputMode="numeric" value={actOtp} onChange={(e) => { setActOtp(e.target.value.replace(/\D/g, '')); setActErr(''); }} placeholder="12345" />
            </div>
            <div style={fieldWrap}>
              <label style={labelSt}>New Password</label>
              <input style={inputSt} onFocus={onFocus} onBlur={onBlur} type="password" value={actPw} onChange={(e) => { setActPw(e.target.value); setActErr(''); }} placeholder="At least 6 characters" autoComplete="new-password" />
            </div>
            {actErr && errBox(actErr)}
            <button style={goldBtn(actBusy)} disabled={actBusy} onClick={activate}>{actBusy ? 'Activating…' : 'Set Password & Enter'}</button>
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button onClick={() => { setActStep(1); setActErr(''); setActMsg(''); }} style={{ ...linkBtn, fontSize: 10, color: TX3 }}>← Change email</button>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 9, letterSpacing: '.16em', color: TX3, textTransform: 'uppercase', marginTop: 24 }}>
          Dhaka, Bangladesh · Est. 2019
        </div>
      </div>
    </div>
  );
}
