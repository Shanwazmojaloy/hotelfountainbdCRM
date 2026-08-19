'use client';

// AuthGate — staff login gate for /crm. Rendered in the Hotel Fountain Design System
// "Warm Ivory Editorial" login (centered ivory card on a walnut field, gold-italic serif
// titles, OTP digits). Auth is server-side:
//   Sign In   -> POST /api/crm/login   (verifies pwh on the service role, sets HttpOnly cookie)
//   Activate  -> POST /api/crm/send-otp then /api/crm/activate (sets password, signs in)
// Session persisted as localStorage {id, session_v}; session_v match honours Logout-All.
import { useState, useEffect, createContext, useContext } from 'react';
import { clearSnaps } from '@/lib/snap';

const AuthContext = createContext({ user: null, signOut: () => {}, access: null });
export const useAuth = () => useContext(AuthContext);

// Modern SaaS palette (literals — AuthGate renders outside .crm-root).
// Aurora/Orbix login (2026-07-04): dark glass card on aurora field, lime CTA (ref frame 1).
const PARCH = 'rgba(22,20,28,.92)', WALNUT = '#0B0A0F', WHITE = 'rgba(255,255,255,.06)';
const GOLD = '#DFFF45', GOLD2 = '#C3E62E', GOLDL = '#DFFF45';
const TX = '#F2F1F5', TX2 = '#A7A4B0', TX3 = '#716E7B', BR = 'rgba(255,255,255,.14)';
const serif = "'DM Sans', system-ui, -apple-system, sans-serif";
const sans = "'DM Sans', system-ui, -apple-system, sans-serif";
const mono = "'IBM Plex Mono', ui-monospace, monospace";

// Persists the verified session across route re-mounts so switching tabs is instant
// (no LOADING flash / re-fetch). Cleared on sign-out.
let _authCache = null;

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(_authCache ? 'in' : 'checking'); // checking | in | out
  const [user, setUser] = useState(_authCache);
  // Set only when /api/crm/login answers 403 demo_expired — a valid password on a
  // dead trial. Never persisted: a reload returns to the normal sign-in card.
  const [demoEnded, setDemoEnded] = useState(null);
  // Demo / subscription clock, refreshed by the session ping below. Null for the home
  // tenant, which is neither — the route short-circuits it before any DB call.
  const [access, setAccess] = useState(null);

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
    // A session stored before tenant_id/hotel_name were persisted cannot be rendered
    // correctly: the header falls back to "Hotel Fountain" and the platform pills read as
    // present. One re-login repopulates both. Cheaper than guessing, and it only happens
    // once per browser. The HttpOnly cookie is untouched, so this is a UI re-hydrate.
    if (saved?.id && !saved.tenant_id) {
      try { localStorage.removeItem('lumea_session'); } catch { /* ignore */ }
      setStatus('out');
      return;
    }
    if (saved?.id) {
      const optimistic = { id: saved.id, name: saved.name, role: saved.role, email: saved.email, tenant_id: saved.tenant_id, hotel_name: saved.hotel_name, hotel_city: saved.hotel_city };
      _authCache = optimistic; setUser(optimistic); setStatus('in');
      validateSession(saved);
    } else {
      setStatus('out');
    }
  }, []);

  // Sliding session: keep the HttpOnly lumea_sess cookie fresh while the app is open so staff
  // are never logged out mid-shift. Re-issues on mount, every 2 min, and on tab focus.
  // The 2-min cadence doubles as the PRESENCE heartbeat (server stamps staff.last_seen_at;
  // Settings→Staff shows "Active" ≤5 min) and makes Logout-All bite within ~2 min.
  // A 401 here means the session is truly revoked/idle-expired -> sign out cleanly to login.
  useEffect(() => {
    if (status !== 'in') return;
    let alive = true;
    const ping = async () => {
      try {
        const r = await fetch('/api/crm/session', { method: 'GET', cache: 'no-store' });
        if (r.status === 401 && alive) return signOut();
        if (r.ok && alive) {
          const j = await r.json().catch(() => null);
          if (j && 'access' in j) setAccess(j.access || null);
        }
      } catch { /* offline/transient - keep the session */ }
    };
    ping();
    // PERF (2026-08-15): gate on visibility. The onVis/focus handlers below already re-ping
    // the moment the tab is looked at again, so a hidden tab polling every 2 min bought
    // nothing but Vercel invocations (~22k/month per tab left open).
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') ping();
    }, 2 * 60 * 1000);
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function validateSession(saved) {
    try {
      // Server-authoritative session check on the service role — the browser anon key cannot
      // read `staff` (RLS revoked). 200 = session_v still valid; 401 = revoked/rotated
      // (Logout-All) -> sign out cleanly. Mirrors the sliding-session ping() below.
      const r = await fetch('/api/crm/session', { method: 'GET', cache: 'no-store' });
      if (r.status === 401) {
        try { localStorage.removeItem('lumea_session'); } catch { /* ignore */ }
        _authCache = null; setUser(null); setStatus('out');
        return;
      }
      if (r.ok) {
        const u = { id: saved.id, name: saved.name, role: saved.role, email: saved.email, session_v: saved.session_v, tenant_id: saved.tenant_id, hotel_name: saved.hotel_name, hotel_city: saved.hotel_city };
        _authCache = u; setUser(u);
      }
    } catch { /* transient/offline — keep the optimistic session, don't bounce the user to login */ }
  }

  function applySession(s) {
    // tenant_id is persisted so the nav can hide PLATFORM-only sections (Growth,
    // Subscriber Access) from customer tenants. Display only — the API re-checks the
    // signed cookie, so editing this in localStorage buys nothing.
    localStorage.setItem('lumea_session', JSON.stringify({ id: s.id, session_v: s.session_v || 1, name: s.name, role: s.role, email: s.email, tenant_id: s.tenant_id, hotel_name: s.hotel_name, hotel_city: s.hotel_city }));
    _authCache = s; setUser(s); setStatus('in'); setPw(''); setActPw(''); setActOtp('');
  }

  async function login(e) {
    e?.preventDefault?.();
    if (!email || !pw) return setErr('Enter your email and password.');
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/crm/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pw }) });
      const j = await r.json().catch(() => ({}));
      // Demo trial over: the credentials were correct, the clock was not. Show the
      // contact screen instead of a generic error — this is a sales moment.
      if (r.status === 403 && j.code === 'demo_expired') {
        setPw('');
        setDemoEnded({ hotel: j.hotel_name || '', at: j.expired_at || null });
        return;
      }
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
      setActMsg('A 6-digit code was sent to ' + actEmail.trim() + '. Valid 5 minutes.');
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

  function signOut() { try { localStorage.removeItem('lumea_session'); } catch {} clearSnaps(); _authCache = null; setUser(null); setStatus('out'); }

  if (status === 'checking') {
    // Ivory (never near-black) so the split-second before the optimistic flip is seamless.
    return <div style={{ minHeight: '100vh', background: PARCH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TX3, fontFamily: mono, letterSpacing: '.2em', fontSize: 12 }} />;
  }
  if (status === 'in') {
    return <AuthContext.Provider value={{ user, signOut, access }}>{children}</AuthContext.Provider>;
  }

  // ── logged-out: design-system ivory login on a walnut field ──
  // Eyebrow ("Staff Portal" / "Staff Activation") + its hairline divider were removed
  // on 2026-08-20 — the Lumea lockup now carries the brand line above the title.
  const title = mode === 'signin' ? ['Welcome', 'Back']
    : actStep === 1 ? ['Activate', 'Account'] : ['Verify &', 'Finish'];

  const fieldWrap = { marginBottom: 14 };
  const labelSt = { display: 'block', fontFamily: sans, fontSize: 9, letterSpacing: '.14em', color: TX3, textTransform: 'uppercase', fontWeight: 600, marginBottom: 5 };
  const inputSt = { width: '100%', background: WHITE, border: `1px solid ${BR}`, color: TX, fontFamily: sans, fontSize: 13, padding: '10px 12px', outline: 'none', boxSizing: 'border-box', borderRadius: 8 };
  const onFocus = (e) => (e.target.style.borderColor = GOLD);
  const onBlur = (e) => (e.target.style.borderColor = BR);
  const goldBtn = (disabled) => ({ width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: sans, fontWeight: 600, letterSpacing: 0, textTransform: 'none', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 8, padding: '12px 24px', fontSize: 14, marginTop: 8, background: GOLDL, color: '#1C1510', border: `1px solid ${GOLDL}`, opacity: disabled ? 0.5 : 1, transition: 'background .15s cubic-bezier(.4,0,.2,1)' });
  const linkBtn = { background: 'none', border: 'none', cursor: 'pointer', fontFamily: sans, fontSize: 12, letterSpacing: 0, color: GOLD, textTransform: 'none', fontWeight: 600, padding: 0 };
  const subText = { textAlign: 'center', fontSize: 12, color: TX2, lineHeight: 1.5, margin: '8px 0 20px' };
  const errBox = (t) => <div style={{ marginTop: 10, marginBottom: 4, fontSize: 11, color: '#FF6B6B', fontFamily: sans }}>{t}</div>;

  // ── demo trial ended: contact screen, not an error ──
  // Placed AFTER the style consts above — they are `const`, so referencing them
  // from an earlier return would hit the temporal dead zone.
  // No pricing on this screen on purpose. Its only job is to get a reply.
  if (demoEnded) {
    const waHref = 'https://wa.me/8801768880806?text=' + encodeURIComponent(
      `Hi Shan — our Hotel Growth OS demo${demoEnded.hotel ? ` for ${demoEnded.hotel}` : ''} has ended. We would like to talk about continuing.`
    );
    return (
      <div style={{ minHeight: '100vh', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: WALNUT, position: 'relative', overflow: 'hidden', fontFamily: sans }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 55% at 18% 22%, rgba(124,58,183,.32), transparent 62%), radial-gradient(ellipse 60% 60% at 80% 88%, rgba(178,84,32,.3), transparent 60%)' }} />
        <div style={{ background: PARCH, border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: '40px 42px', width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, boxShadow: '0 40px 100px rgba(0,0,0,.6)', backdropFilter: 'blur(20px)', textAlign: 'center' }}>
          {/* Lumea lockup — 160px (vs 186 on sign-in): this card carries more copy below,
              so the mark yields to the "Your 5 days are up" headline. */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <img
              src="/lumea-logo.png"
              alt="Lumea — Smarter operations. Better growth."
              width={160}
              height={103}
              style={{ width: 160, height: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div style={{ fontSize: 8, color: TX3, letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 500, marginBottom: 16 }}>Trial Complete</div>
          <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: TX, lineHeight: 1.15, letterSpacing: '-.01em' }}>
            Your 5 days are <em style={{ fontStyle: 'normal', color: GOLD, fontWeight: 700 }}>up</em>
          </div>
          <p style={{ ...subText, marginTop: 12 }}>
            {demoEnded.hotel ? `${demoEnded.hotel}'s ` : 'Your '}demo has ended. Your password still works — only the clock stopped.
          </p>
          <p style={{ fontSize: 12, color: TX2, lineHeight: 1.5, margin: '0 0 22px' }}>
            Everything you set up is kept for <strong style={{ color: TX }}>30 days</strong>. Pick up where you left off rather than starting again.
          </p>
          <a href={waHref} target="_blank" rel="noreferrer" style={{ ...goldBtn(false), textDecoration: 'none', marginTop: 0 }}>
            Talk to Shan on WhatsApp
          </a>
          <div style={{ fontFamily: mono, fontSize: 11, color: TX3, marginTop: 14, letterSpacing: '.04em' }}>+880 1768 880806</div>
          <button onClick={() => { setDemoEnded(null); setErr(''); }} style={{ ...linkBtn, marginTop: 18 }}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: WALNUT, position: 'relative', overflow: 'hidden', fontFamily: sans }}>
      {/* aurora glow — purple top, burnt orange bottom (Orbix reference) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 55% at 18% 22%, rgba(124,58,183,.32), transparent 62%), radial-gradient(ellipse 60% 55% at 85% 15%, rgba(147,72,196,.2), transparent 58%), radial-gradient(ellipse 60% 60% at 80% 88%, rgba(178,84,32,.3), transparent 60%)' }} />
      {/* fine grid texture */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(0deg, rgba(148,163,184,.05) 0px, rgba(148,163,184,.05) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(148,163,184,.05) 0px, rgba(148,163,184,.05) 1px, transparent 1px, transparent 40px)' }} />

      <div style={{ background: PARCH, border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: '40px 42px', width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, boxShadow: '0 40px 100px rgba(0,0,0,.6)', backdropFilter: 'blur(20px)' }}>
        {/* Lumea lockup — mark + wordmark + tagline. 186px keeps the tagline legible
            (~8px cap height) without pushing the form below the fold on a 360px viewport. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <img
            src="/lumea-logo.png"
            alt="Lumea — Smarter operations. Better growth."
            width={186}
            height={119}
            style={{ width: 186, height: 'auto', objectFit: 'contain' }}
          />
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

        {/* title — stepped down 24→19 so the lockup, not the heading, leads the hierarchy */}
        <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: TX, textAlign: 'center', lineHeight: 1.15, letterSpacing: '-.01em' }}>
          {title[0]} <em style={{ fontStyle: 'normal', color: GOLD, fontWeight: 700 }}>{title[1]}</em>
        </div>

        {mode === 'signin' ? (
          <form onSubmit={login} autoComplete="off">
            <p style={subText}>Sign in with your email and password.</p>
            <div style={fieldWrap}>
              <label style={labelSt}>Work Email</label>
              <input style={inputSt} onFocus={onFocus} onBlur={onBlur} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="you@yourhotel.com" autoComplete="username" />
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
            <p style={subText}>Enter your work email — we&apos;ll send a 6-digit code to verify it&apos;s you.</p>
            <div style={fieldWrap}>
              <label style={labelSt}>Work Email</label>
              <input style={inputSt} onFocus={onFocus} onBlur={onBlur} type="email" value={actEmail} onChange={(e) => { setActEmail(e.target.value); setActErr(''); }} placeholder="you@yourhotel.com" autoFocus />
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
            {actMsg && <div style={{ fontSize: 10.5, color: '#7BE04A', marginBottom: 14, textAlign: 'center', padding: 8, background: 'rgba(123,224,74,.09)', border: '1px solid rgba(123,224,74,.25)', borderRadius: 8, fontFamily: sans, lineHeight: 1.5 }}>{actMsg}</div>}
            <div style={fieldWrap}>
              <label style={labelSt}>Verification Code</label>
              <input style={{ ...inputSt, letterSpacing: '.5em', fontSize: 20, textAlign: 'center', fontFamily: mono }} onFocus={onFocus} onBlur={onBlur} maxLength={6} inputMode="numeric" value={actOtp} onChange={(e) => { setActOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setActErr(''); }} placeholder="123456" />
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
