'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lumea PMS — Marketing Landing (cinematic motion)
//
// Served at https://lumea.fountainbd.com/ via host-based rewrite in middleware.ts.
// Bold modern SaaS aesthetic (Linear / Vercel-style dark with gold gradient
// accents). All animations GPU-only (transform/opacity). Mouse spotlight,
// floating orbs, animated hero product mockup, scroll progress, 3D card tilt,
// letter-by-letter headline reveal, scroll-drawn section dividers, film grain.
// Respects prefers-reduced-motion. No external animation deps.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

const WHATSAPP_URL =
  'https://wa.me/8801322840799?text=Hi%20Lumea%20team%2C%20I%27d%20like%20to%20learn%20more%20about%20your%20PMS%20for%20my%20hotel.';
const EMAIL_URL = 'mailto:hotellfountainbd@gmail.com?subject=Lumea%20PMS%20-%20Inquiry';

const FEATURES = [
  {
    eyebrow: 'Front Office',
    title: 'Reservations · Room Matrix · Folio',
    body: 'Drag-and-drop room board, multi-room bookings, cascade-safe folios, and a reservation-centric data model that never produces orphaned ledger entries.',
    bullets: [
      'Visual room status grid (Available · Reserved · Occupied · Dirty)',
      'Multi-room reservations with per-room rate breakdown',
      'Auto-folio + Stay Extension auto-charge',
      'Cascade delete — no ghost transactions',
    ],
    accent: '#C8A96E',
  },
  {
    eyebrow: 'Revenue Ops',
    title: 'Billing · Tax-Compliant Invoicing',
    body: 'Multi-payment-method ledger with Bangladesh VAT 15% / Service 5% built-in. Branded print docs (Booking Confirmation · Tax Invoice · Daily Billing Report) ready to hand to the guest.',
    bullets: [
      'Cash · bKash · Nagad · Card · Bank Transfer · Advance Payment',
      'BDT-native with auto-currency expansion to USD/INR/LKR',
      'Editorial-grade print/PDF (Inter typography, tabular figures)',
      'Daily close-out workflow with Token deduction + closing balance',
    ],
    accent: '#9C7A3E',
  },
  {
    eyebrow: 'Intelligence',
    title: 'AI Assistant · Lead Pipeline · Lighthouse',
    body: 'Claude-powered guest insights and an autonomous corporate-leads agent. Lighthouse summarises your day every night so the owner walks in informed.',
    bullets: [
      'Outreach Bot — emails corporate leads on a cron',
      'CEO Auditor — heuristic + Claude-graded reply intelligence',
      'Reply-intake polling — Gmail IMAP / webhook hybrid',
      'Nightly Lighthouse Summary — occupancy, revenue, leads, dues',
    ],
    accent: '#4A7C59',
  },
  {
    eyebrow: 'Scale',
    title: 'Multi-Property · Housekeeping · Staff Portal',
    body: 'Subdomain-isolated tenants, role-based staff portal (Owner · Manager · Front-Desk · Housekeeping), and an HK task board that auto-syncs with room status.',
    bullets: [
      'Per-property isolation via subdomain routing',
      'Row-level security enforced at the DB layer (Supabase RLS)',
      'Housekeeping board with urgent-task triage',
      'Owner + Manager dashboard with realtime KPIs',
    ],
    accent: '#B14D4D',
  },
];

const STATS = [
  { from: 0, to: 80, suffix: '', prefix: '15–', label: 'Room sweet-spot', duration: 1200 },
  { from: 60, to: 30, suffix: 's', prefix: '<', label: 'New-res to invoice', duration: 1400 },
  { from: 0, to: 100, suffix: '%', prefix: '', label: 'BDT VAT compliant', duration: 1600 },
  { from: 0, to: 24, suffix: '/7', prefix: '', label: 'Auto-folio + close', duration: 1200 },
];

// ─── Count-up hook ──────────────────────────────────────────────────────────
function useCountUp(from: number, to: number, durationMs: number, trigger: boolean) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!trigger) return;
    let start: number | null = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, durationMs, trigger]);
  return value;
}

// ─── IntersectionObserver hook ──────────────────────────────────────────────
function useInView<T extends HTMLElement>(rootMargin = '-10% 0px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
          }
        });
      },
      { rootMargin, threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, inView]);
  return [ref, inView];
}

// ─── Letter-by-letter text reveal ───────────────────────────────────────────
function RevealText({ text, baseDelay = 0 }: { text: string; baseDelay?: number }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className="char"
          style={{ animationDelay: `${baseDelay + i * 22}ms` }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  );
}

// ─── Animated stat tile ─────────────────────────────────────────────────────
function StatTile({ stat, delay }: { stat: (typeof STATS)[number]; delay: number }) {
  const [ref, inView] = useInView<HTMLDivElement>('0px');
  const v = useCountUp(stat.from, stat.to, stat.duration, inView);
  return (
    <div
      ref={ref}
      className="stat-tile"
      style={{
        animation: inView ? `fadeUp .8s cubic-bezier(.16,1,.3,1) ${delay}ms both` : 'none',
      }}
    >
      <div className="stat-value">
        {stat.prefix}
        {v}
        {stat.suffix}
      </div>
      <div className="stat-label">{stat.label}</div>
    </div>
  );
}

// ─── Feature card with 3D tilt on hover ─────────────────────────────────────
function FeatureCard({ feature, index }: { feature: (typeof FEATURES)[number]; index: number }) {
  const [ref, inView] = useInView<HTMLElement>('-15% 0px');
  const cardRef = useRef<HTMLElement | null>(null);

  // Combine refs
  const setRefs = (el: HTMLElement | null) => {
    cardRef.current = el;
    (ref as React.MutableRefObject<HTMLElement | null>).current = el;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
    const dy = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
    card.style.setProperty('--rx', `${-dy * 5}deg`);
    card.style.setProperty('--ry', `${dx * 5}deg`);
    card.style.setProperty('--shine-x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    card.style.setProperty('--shine-y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
  };
  const onMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  };

  return (
    <article
      ref={setRefs}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`feature-card ${index % 3 === 0 ? 'span-2' : ''}`}
      style={{
        animation: inView ? `fadeUp .9s cubic-bezier(.16,1,.3,1) ${index * 100}ms both` : 'none',
        ['--accent' as string]: feature.accent,
      }}
    >
      <div className="feature-shine" aria-hidden="true" />
      <div className="feature-eyebrow" style={{ color: feature.accent }}>
        {feature.eyebrow}
      </div>
      <h3 className="feature-title">{feature.title}</h3>
      <p className="feature-body">{feature.body}</p>
      <ul className="feature-list">
        {feature.bullets.map((b) => (
          <li key={b} className="feature-bullet-row">
            <span
              className="feature-bullet"
              style={{ background: feature.accent, boxShadow: `0 0 6px ${feature.accent}` }}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="feature-glow" style={{ background: feature.accent }} />
    </article>
  );
}

// ─── Animated mini Lumea CRM mockup (hero right column) ─────────────────────
function HeroMockup() {
  // Cycle the room states + the BIZ DAY counter for visual life
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(id);
  }, []);

  // 16 rooms, each gets a state derived from (tick + index) — produces a slow shimmer
  const rooms = Array.from({ length: 16 }).map((_, i) => {
    const states = ['ok', 'ok', 'ok', 'in', 'in', 'in', 'res', 'dirty'];
    const stateIdx = (i * 3 + tick) % states.length;
    return { num: 301 + i, state: states[stateIdx] };
  });

  // Cycle the BIZ DAY revenue between a few realistic values
  const bizDays = ['৳17,040', '৳18,500', '৳22,100', '৳16,200'];
  const bizDay = bizDays[tick % bizDays.length];
  const occupied = 8 + (tick % 4);

  return (
    <div className="mockup">
      <div className="mockup-frame">
        <div className="mockup-header">
          <div className="mockup-dots">
            <span className="dot dot-r" />
            <span className="dot dot-y" />
            <span className="dot dot-g" />
          </div>
          <div className="mockup-url">lumea.fountainbd.com/crm</div>
        </div>
        <div className="mockup-body">
          <div className="mockup-stats">
            <div className="mockup-stat">
              <div className="mockup-stat-lbl">Biz Day</div>
              <div className="mockup-stat-val" key={tick}>{bizDay}</div>
            </div>
            <div className="mockup-stat">
              <div className="mockup-stat-lbl">Occupied</div>
              <div className="mockup-stat-val">{occupied}/24</div>
            </div>
            <div className="mockup-stat">
              <div className="mockup-stat-lbl">Due</div>
              <div className="mockup-stat-val due">৳106K</div>
            </div>
          </div>

          <div className="mockup-section-lbl">Room Matrix</div>
          <div className="mockup-grid">
            {rooms.map((r) => (
              <div key={r.num} className={`mockup-room ${r.state}`}>
                <span>{r.num}</span>
              </div>
            ))}
          </div>

          <div className="mockup-section-lbl">Today&rsquo;s Activity</div>
          <div className="mockup-feed">
            <div className="feed-row">
              <span className="feed-dot pay" />
              <span className="feed-text">Faysal Mia · Cash · ৳4,500</span>
              <span className="feed-time">12:11</span>
            </div>
            <div className="feed-row">
              <span className="feed-dot res" />
              <span className="feed-text">Hau Boon Yap · Royal Suite · 6 nights</span>
              <span className="feed-time">10:42</span>
            </div>
            <div className="feed-row">
              <span className="feed-dot ai" />
              <span className="feed-text">Outreach Bot · 13 leads sent</span>
              <span className="feed-time">09:00</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mockup-shadow" aria-hidden="true" />
      <div className="mockup-orbit" aria-hidden="true" />
    </div>
  );
}

// ─── Section divider that draws itself on scroll ────────────────────────────
function SectionDivider() {
  const [ref, inView] = useInView<HTMLDivElement>('-10% 0px');
  return <div ref={ref} className={`section-divider ${inView ? 'drawn' : ''}`} />;
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function LumeaLandingPage() {
  const [scrollProgress, setScrollProgress] = useState(0);

  // Mouse spotlight tracking — writes CSS vars on <html>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf: number | null = null;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--mx', `${e.clientX}px`);
        document.documentElement.style.setProperty('--my', `${e.clientY}px`);
        raf = null;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Scroll progress bar
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const scroll = window.scrollY;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        setScrollProgress(Math.min(1, scroll / max));
        raf = null;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <main className="lumea-main">
      {/* Cinematic background layers */}
      <div className="bg-gradient" aria-hidden="true" />
      <div className="bg-gradient-2" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-vignette" aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="cursor-spotlight" aria-hidden="true" />

      {/* Floating decorative orbs (hero only) */}
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />

      {/* Scroll progress bar — fixed at top of viewport */}
      <div
        className="scroll-progress"
        style={{ transform: `scaleX(${scrollProgress})` }}
        aria-hidden="true"
      />

      {/* ─── Navigation ──────────────────────────────────────────────────── */}
      <nav className="nav" style={{ animation: 'fadeDown .8s cubic-bezier(.16,1,.3,1) both' }}>
        <a href="/" className="brand">
          <span className="brand-word">LUMEA</span>
          <span className="brand-dot">·</span>
          <span className="brand-sub">PMS for Boutique Hotels</span>
        </a>
        <div className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#stats" className="nav-link">Numbers</a>
          <a href="#contact" className="nav-link">Contact</a>
          <a href={WHATSAPP_URL} className="nav-cta" target="_blank" rel="noopener noreferrer">
            Talk on WhatsApp →
          </a>
        </div>
      </nav>

      {/* ─── Hero (split layout: text left, mockup right) ────────────────── */}
      <section className="hero">
        <div className="hero-text">
          <div className="badge" style={{ animation: 'fadeUp .8s cubic-bezier(.16,1,.3,1) 200ms both' }}>
            <span className="badge-dot" />
            <span>Now operating Hotel Fountain · Dhaka</span>
          </div>

          <h1 className="h1">
            <span className="h1-line">
              <RevealText text="The PMS your boutique hotel" baseDelay={400} />
            </span>
            <span className="h1-line h1-accent">
              <RevealText text="actually wants to use." baseDelay={400 + 28 * 25} />
            </span>
          </h1>

          <p className="lead" style={{ animation: 'fadeUp .9s cubic-bezier(.16,1,.3,1) 1400ms both' }}>
            Reservations, billing, housekeeping, and an AI lead pipeline —
            engineered for 15&ndash;80 room hotels and trusted to run a property
            every day. One database. One staff portal. Zero spreadsheets.
          </p>

          <div className="cta-row" style={{ animation: 'fadeUp .9s cubic-bezier(.16,1,.3,1) 1600ms both' }}>
            <a href={WHATSAPP_URL} className="cta-primary" target="_blank" rel="noopener noreferrer">
              <span>Talk to us on WhatsApp</span>
              <span className="cta-arrow">→</span>
            </a>
            <a href={EMAIL_URL} className="cta-secondary">Email us</a>
          </div>

          <div className="trust-row" style={{ animation: 'fadeUp .9s cubic-bezier(.16,1,.3,1) 1800ms both' }}>
            <span className="trust-label">Live in production at</span>
            <a href="https://fountainbd.com" target="_blank" rel="noopener noreferrer" className="trust-link">
              Hotel Fountain · Dhaka ↗
            </a>
          </div>
        </div>

        <div className="hero-mockup-wrap" style={{ animation: 'fadeUp 1.2s cubic-bezier(.16,1,.3,1) 800ms both' }}>
          <HeroMockup />
        </div>
      </section>

      {/* ─── Stats strip ─────────────────────────────────────────────────── */}
      <section id="stats">
        <SectionDivider />
        <div className="stats-strip">
          {STATS.map((s, i) => (
            <StatTile key={s.label} stat={s} delay={i * 100} />
          ))}
        </div>
      </section>

      {/* ─── Features bento ──────────────────────────────────────────────── */}
      <section id="features" className="features-section">
        <SectionDivider />
        <div className="section-eyebrow">What ships in Lumea</div>
        <h2 className="h2">
          A full PMS in one repo.
          <br />
          <span className="h2-accent">Built like a product, not a toolbox.</span>
        </h2>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </section>

      {/* ─── CTA section ─────────────────────────────────────────────────── */}
      <section id="contact" className="cta-section">
        <SectionDivider />
        <div className="cta-card">
          <div className="cta-shimmer" aria-hidden="true" />
          <div className="section-eyebrow">Let&rsquo;s talk</div>
          <h2 className="h2-cta">We&rsquo;ll set up Lumea for your hotel in a week.</h2>
          <p className="cta-lead">
            Onboarding includes data migration from your current spreadsheet or PMS,
            staff training, and 30 days of priority support. Fixed price, no surprises.
          </p>
          <div className="cta-row">
            <a href={WHATSAPP_URL} className="cta-primary" target="_blank" rel="noopener noreferrer">
              <span>Start on WhatsApp</span>
              <span className="cta-arrow">→</span>
            </a>
            <a href={EMAIL_URL} className="cta-secondary">Or email us</a>
          </div>
          <div className="contact-meta">
            <div>
              <div className="contact-label">WhatsApp</div>
              <div className="contact-value">+880 1322-840799</div>
            </div>
            <div>
              <div className="contact-label">Email</div>
              <div className="contact-value">hotellfountainbd@gmail.com</div>
            </div>
            <div>
              <div className="contact-label">Office</div>
              <div className="contact-value">House-05, Road-02, Nikunja-02 · Dhaka 1229, BD</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer-col">
          <span className="footer-brand">LUMEA</span>
          <span className="footer-tagline">
            Property Management System · Built in Dhaka, made for the world.
          </span>
        </div>
        <div className="footer-col">
          <a href="https://fountainbd.com" className="footer-link">Hotel Fountain ↗</a>
          <a href="/crm.html" className="footer-link">Staff Portal</a>
          <a href={WHATSAPP_URL} className="footer-link" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </div>
        <div className="footer-copy">
          © {new Date().getFullYear()} Lumea PMS · All rights reserved.
        </div>
      </footer>

      {/* ─── Styles ──────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fadeUp   { from { opacity:0; transform: translateY(24px); } to { opacity:1; transform: translateY(0); } }
        @keyframes fadeDown { from { opacity:0; transform: translateY(-16px); } to { opacity:1; transform: translateY(0); } }
        @keyframes charIn   { from { opacity:0; transform: translateY(40%) rotateX(60deg); } to { opacity:1; transform: translateY(0) rotateX(0); } }
        @keyframes gradientDrift   { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(4%,-3%) scale(1.05); } 66% { transform: translate(-3%,4%) scale(.95); } }
        @keyframes gradientDrift2  { 0%,100% { transform: translate(0,0) rotate(0); } 50% { transform: translate(-5%,5%) rotate(180deg); } }
        @keyframes gridShift       { from { transform: translateY(0); } to { transform: translateY(64px); } }
        @keyframes pulse           { 0%,100% { opacity:1; transform: scale(1); box-shadow: 0 0 0 0 rgba(74,124,89,.6); } 50% { opacity:.8; transform: scale(1.15); box-shadow: 0 0 0 8px rgba(74,124,89,0); } }
        @keyframes shimmer         { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
        @keyframes float           { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes glowPulse       { 0%,100% { box-shadow: 0 10px 40px rgba(200,169,110,.25), 0 0 0 1px rgba(200,169,110,.4); } 50% { box-shadow: 0 14px 60px rgba(200,169,110,.45), 0 0 0 1px rgba(200,169,110,.6); } }
        @keyframes ctaShimmer      { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes orb1            { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(180px,90px) scale(1.15); } }
        @keyframes orb2            { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-150px,80px) scale(.9); } }
        @keyframes orb3            { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(100px,-130px) scale(1.1); } }
        @keyframes mockupBob       { 0%,100% { transform: translateY(0) rotateZ(0); } 50% { transform: translateY(-8px) rotateZ(-.3deg); } }
        @keyframes mockupOrbit     { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes roomFlash       { from { opacity:.4; transform: scale(.94); } to { opacity:1; transform: scale(1); } }
        @keyframes statBump        { from { opacity:.5; transform: scale(.96); } to { opacity:1; transform: scale(1); } }

        :root {
          --bg: #07090E;
          --bg2: #0D1117;
          --bg3: #131B26;
          --text: #EEE9E2;
          --text2: #C8BFB0;
          --text3: #9A907C;
          --gold: #C8A96E;
          --goldBright: #E0C585;
          --goldDeep: #9C7A3E;
          --green: #4A7C59;
          --red: #B14D4D;
          --border: rgba(200,169,110,.15);
          --borderBright: rgba(200,169,110,.35);
          --mx: 50vw;
          --my: 50vh;
        }

        .lumea-main {
          position: relative;
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: 'Geist','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
          font-size: 16px;
          line-height: 1.6;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Background motion layers ───────────────────────────── */
        .bg-gradient {
          position: absolute; inset: -10%;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(200,169,110,.22), transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 30%, rgba(156,122,62,.16), transparent 70%),
            radial-gradient(ellipse 60% 60% at 20% 70%, rgba(74,124,89,.12), transparent 70%);
          pointer-events: none; z-index: 0;
          animation: gradientDrift 22s ease-in-out infinite;
          will-change: transform;
        }
        .bg-gradient-2 {
          position: absolute; inset: -20%;
          background:
            radial-gradient(ellipse 40% 30% at 70% 80%, rgba(177,77,77,.08), transparent 60%),
            radial-gradient(ellipse 30% 30% at 30% 20%, rgba(74,124,89,.08), transparent 60%);
          pointer-events: none; z-index: 0;
          animation: gradientDrift2 30s ease-in-out infinite;
          will-change: transform;
        }
        .bg-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(to right, rgba(200,169,110,.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(200,169,110,.04) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%);
          pointer-events: none; z-index: 0;
          animation: gridShift 12s linear infinite;
          will-change: transform;
        }
        .bg-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 50%, rgba(7,9,14,.8) 100%);
          pointer-events: none; z-index: 1;
        }
        .noise-overlay {
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          opacity: .035;
          mix-blend-mode: overlay;
          pointer-events: none; z-index: 2;
        }
        .cursor-spotlight {
          position: fixed; inset: 0; pointer-events: none; z-index: 3;
          background: radial-gradient(700px circle at var(--mx) var(--my), rgba(200,169,110,.08), transparent 40%);
          transition: background .15s ease-out;
        }
        @media (hover: none), (pointer: coarse) {
          .cursor-spotlight { display: none; }
        }

        /* ── Floating orbs ──────────────────────────────────────── */
        .orb {
          position: absolute; border-radius: 50%; filter: blur(70px); opacity: .35;
          pointer-events: none; z-index: 1; will-change: transform;
        }
        .orb-1 { width: 380px; height: 380px; background: #C8A96E; top: 8%;  left: -120px; animation: orb1 20s ease-in-out infinite; }
        .orb-2 { width: 460px; height: 460px; background: #4A7C59; top: 24%; right: -160px; animation: orb2 24s ease-in-out infinite; opacity: .25; }
        .orb-3 { width: 280px; height: 280px; background: #9C7A3E; top: 80vh; left: 40%; animation: orb3 18s ease-in-out infinite; opacity: .22; }

        /* ── Scroll progress bar ───────────────────────────────── */
        .scroll-progress {
          position: fixed; top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--goldBright), var(--gold), var(--goldDeep));
          transform-origin: 0 50%;
          z-index: 100;
          box-shadow: 0 0 10px rgba(200,169,110,.5);
          transition: transform .1s linear;
        }

        /* ── Navigation ─────────────────────────────────────────── */
        .nav {
          position: relative; z-index: 10;
          display: flex; justify-content: space-between; align-items: center;
          padding: 22px 48px; max-width: 1280px; margin: 0 auto; width: 100%;
        }
        .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
        .brand-word { font-size: 18px; font-weight: 700; letter-spacing: .18em; }
        .brand-dot { color: var(--gold); font-size: 14px; }
        .brand-sub { font-size: 12px; color: var(--text3); letter-spacing: .05em; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-link { color: var(--text2); text-decoration: none; font-size: 14px; position: relative; transition: color .25s; }
        .nav-link:hover { color: var(--gold); }
        .nav-link::after {
          content: ''; position: absolute; left: 0; bottom: -4px;
          width: 0; height: 1px; background: var(--gold);
          transition: width .3s cubic-bezier(.16,1,.3,1);
        }
        .nav-link:hover::after { width: 100%; }
        .nav-cta {
          padding: 9px 18px; background: var(--gold); color: var(--bg);
          border-radius: 6px; text-decoration: none;
          font-size: 13px; font-weight: 600; letter-spacing: .02em;
          transition: transform .2s, box-shadow .2s, background .2s;
        }
        .nav-cta:hover { transform: translateY(-1px); background: var(--goldBright); box-shadow: 0 8px 24px rgba(200,169,110,.35); }

        /* ── Hero ───────────────────────────────────────────────── */
        .hero {
          position: relative; z-index: 10;
          max-width: 1280px; margin: 0 auto;
          padding: 60px 48px 80px;
          display: grid; grid-template-columns: 1.05fr .95fr;
          gap: 56px; align-items: center;
        }
        .hero-text { min-width: 0; }
        .hero-mockup-wrap { min-width: 0; perspective: 1500px; }

        .badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 14px;
          background: rgba(200,169,110,.08);
          border: 1px solid var(--border);
          border-radius: 99px;
          font-size: 12px; color: var(--text2); letter-spacing: .04em;
          margin-bottom: 28px;
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--green);
          animation: pulse 2.2s ease-in-out infinite;
        }
        .h1 {
          font-size: clamp(36px, 5.4vw, 64px);
          font-weight: 700; letter-spacing: -.03em; line-height: 1.05;
          margin: 0 0 24px;
        }
        .h1-line { display: block; }
        .h1 .char {
          display: inline-block;
          opacity: 0;
          animation: charIn .65s cubic-bezier(.16,1,.3,1) both;
          transform-origin: 50% 100%;
        }
        .h1-accent {
          font-style: italic;
          font-family: 'Cormorant Garamond','Libre Baskerville',serif;
          font-weight: 400;
        }
        .h1-accent .char {
          background: linear-gradient(120deg, var(--goldBright) 0%, var(--gold) 30%, var(--goldDeep) 50%, var(--gold) 70%, var(--goldBright) 100%);
          background-size: 200% auto;
          background-clip: text; -webkit-background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
          animation: charIn .65s cubic-bezier(.16,1,.3,1) both, shimmer 6s linear infinite;
        }
        .lead {
          font-size: clamp(15px, 1.5vw, 18px);
          color: var(--text2);
          max-width: 560px;
          margin: 0 0 32px;
          line-height: 1.55;
        }
        .cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
        .cta-primary {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 13px 24px;
          background: linear-gradient(135deg, var(--goldBright), var(--gold));
          color: var(--bg);
          border-radius: 10px; text-decoration: none;
          font-size: 15px; font-weight: 600; letter-spacing: .01em;
          transition: transform .25s cubic-bezier(.16,1,.3,1);
          animation: glowPulse 3s ease-in-out infinite;
          position: relative; overflow: hidden;
        }
        .cta-primary::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
          transform: translateX(-100%);
          animation: ctaShimmer 3.5s ease-in-out infinite;
          pointer-events: none;
        }
        .cta-primary:hover { transform: translateY(-2px); }
        .cta-primary:hover .cta-arrow { transform: translateX(5px); }
        .cta-arrow { font-size: 18px; transition: transform .25s cubic-bezier(.16,1,.3,1); }
        .cta-secondary {
          display: inline-flex; align-items: center;
          padding: 13px 22px;
          color: var(--text);
          border-radius: 10px; text-decoration: none;
          font-size: 14px; font-weight: 500;
          border: 1px solid var(--borderBright);
          background: rgba(200,169,110,.04);
          transition: background .25s, border-color .25s, transform .25s cubic-bezier(.16,1,.3,1);
        }
        .cta-secondary:hover { background: rgba(200,169,110,.10); border-color: var(--gold); transform: translateY(-1px); }
        .trust-row {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 8px 16px;
          background: rgba(255,255,255,.02);
          border-radius: 99px;
          font-size: 12px; color: var(--text3);
          animation: float 4s ease-in-out infinite;
        }
        .trust-label { letter-spacing: .05em; }
        .trust-link { color: var(--gold); text-decoration: none; font-weight: 500; transition: color .2s; }
        .trust-link:hover { color: var(--goldBright); }

        /* ── Hero mockup ────────────────────────────────────────── */
        .mockup {
          position: relative;
          animation: mockupBob 7s ease-in-out infinite;
          transform-style: preserve-3d;
          transform: perspective(1500px) rotateY(-8deg) rotateX(4deg);
        }
        .mockup-frame {
          position: relative; z-index: 2;
          background: linear-gradient(180deg, #0F1419 0%, #0A0D12 100%);
          border: 1px solid rgba(200,169,110,.20);
          border-radius: 14px;
          overflow: hidden;
          box-shadow:
            0 30px 80px rgba(0,0,0,.6),
            0 0 0 1px rgba(200,169,110,.08),
            inset 0 1px 0 rgba(255,255,255,.04);
        }
        .mockup-header {
          display: flex; align-items: center; gap: 14px;
          padding: 12px 16px;
          background: rgba(255,255,255,.02);
          border-bottom: 1px solid rgba(200,169,110,.08);
        }
        .mockup-dots { display: flex; gap: 6px; }
        .mockup-dots .dot { width: 10px; height: 10px; border-radius: 50%; opacity: .55; }
        .dot-r { background: #FF5F57; }
        .dot-y { background: #FEBC2E; }
        .dot-g { background: #28C840; }
        .mockup-url {
          font-family: 'Geist Mono','IBM Plex Mono',monospace;
          font-size: 11px; color: var(--text3);
          letter-spacing: .02em;
        }
        .mockup-body { padding: 20px; }
        .mockup-stats {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
          margin-bottom: 18px;
        }
        .mockup-stat {
          padding: 12px 14px;
          background: rgba(255,255,255,.025);
          border: 1px solid rgba(200,169,110,.08);
          border-radius: 8px;
        }
        .mockup-stat-lbl {
          font-size: 9px; letter-spacing: .15em; text-transform: uppercase;
          color: var(--text3); margin-bottom: 4px;
        }
        .mockup-stat-val {
          font-size: 18px; font-weight: 700;
          color: var(--gold);
          font-variant-numeric: tabular-nums;
          letter-spacing: -.01em;
          animation: statBump .5s ease-out;
        }
        .mockup-stat-val.due { color: var(--red); }
        .mockup-section-lbl {
          font-size: 9px; letter-spacing: .2em; text-transform: uppercase;
          color: var(--text3); margin-bottom: 8px; font-weight: 600;
        }
        .mockup-grid {
          display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;
          margin-bottom: 18px;
        }
        .mockup-room {
          aspect-ratio: 1; border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 600;
          font-family: 'Geist Mono','IBM Plex Mono',monospace;
          font-variant-numeric: tabular-nums;
          transition: background .8s ease, color .8s ease, transform .4s;
          animation: roomFlash .5s ease-out;
        }
        .mockup-room.ok    { background: rgba(74,124,89,.18);  color: #6FAE7E;  border: 1px solid rgba(74,124,89,.3); }
        .mockup-room.in    { background: rgba(200,169,110,.18); color: var(--gold); border: 1px solid rgba(200,169,110,.3); }
        .mockup-room.res   { background: rgba(88,166,255,.15);  color: #79B5F5;  border: 1px solid rgba(88,166,255,.25); }
        .mockup-room.dirty { background: rgba(177,77,77,.18);   color: #E08585;  border: 1px solid rgba(177,77,77,.3); }
        .mockup-feed {
          display: flex; flex-direction: column; gap: 8px;
        }
        .feed-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px;
          background: rgba(255,255,255,.015);
          border: 1px solid rgba(200,169,110,.06);
          border-radius: 6px;
          font-size: 11px;
        }
        .feed-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .feed-dot.pay { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .feed-dot.res { background: #58A6FF; box-shadow: 0 0 6px #58A6FF; }
        .feed-dot.ai  { background: var(--gold); box-shadow: 0 0 6px var(--gold); }
        .feed-text { flex: 1; color: var(--text2); }
        .feed-time {
          color: var(--text3); font-size: 10px;
          font-family: 'Geist Mono','IBM Plex Mono',monospace;
        }
        .mockup-shadow {
          position: absolute;
          left: 5%; right: 5%; bottom: -20px; height: 40px;
          background: radial-gradient(ellipse at center, rgba(200,169,110,.25), transparent 70%);
          filter: blur(20px);
          z-index: 1;
        }
        .mockup-orbit {
          position: absolute;
          inset: -40px;
          border: 1px dashed rgba(200,169,110,.06);
          border-radius: 30px;
          z-index: 0;
          animation: mockupOrbit 40s linear infinite;
          pointer-events: none;
        }

        /* ── Section divider ────────────────────────────────────── */
        .section-divider {
          height: 1px;
          background: linear-gradient(to right, transparent, var(--gold), transparent);
          width: 0%; margin: 0 auto 56px;
          transition: width 1.6s cubic-bezier(.16,1,.3,1);
        }
        .section-divider.drawn { width: 70%; }

        /* ── Stats strip ────────────────────────────────────────── */
        #stats { position: relative; z-index: 10; max-width: 1100px; margin: 0 auto; padding: 20px 48px 100px; }
        .stats-strip {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1px;
        }
        .stat-tile {
          padding: 32px 24px;
          background: rgba(255,255,255,.015);
          border: 1px solid var(--border);
          text-align: center;
          transition: background .3s, border-color .3s, transform .3s cubic-bezier(.16,1,.3,1);
        }
        .stat-tile:hover {
          background: rgba(200,169,110,.05);
          border-color: var(--borderBright);
          transform: translateY(-3px);
        }
        .stat-value {
          font-size: 40px; font-weight: 700; color: var(--gold);
          font-variant-numeric: tabular-nums; letter-spacing: -.02em;
          margin-bottom: 6px; line-height: 1;
        }
        .stat-label {
          font-size: 11px; color: var(--text3);
          letter-spacing: .15em; text-transform: uppercase;
        }

        /* ── Features ───────────────────────────────────────────── */
        .features-section {
          position: relative; z-index: 10;
          max-width: 1280px; margin: 0 auto; padding: 20px 48px 100px;
        }
        .section-eyebrow {
          display: inline-block;
          font-size: 11px; letter-spacing: .25em; text-transform: uppercase;
          color: var(--goldDeep); margin-bottom: 20px; font-weight: 600;
        }
        .h2 {
          font-size: clamp(28px, 4vw, 48px);
          font-weight: 700; letter-spacing: -.02em; line-height: 1.1;
          margin: 0 0 60px; max-width: 720px;
        }
        .h2-accent { color: var(--text3); font-weight: 400; }
        .feature-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;
        }
        .feature-card {
          position: relative;
          padding: 32px 30px;
          background: linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%);
          border: 1px solid var(--border);
          border-radius: 14px;
          display: flex; flex-direction: column; gap: 14px;
          transform: perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));
          transition: border-color .35s, box-shadow .35s, transform .15s ease-out;
          transform-style: preserve-3d;
          overflow: hidden; will-change: transform;
        }
        .feature-card.span-2 { grid-column: span 2; }
        .feature-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent, var(--gold)), transparent);
          opacity: 0; transition: opacity .35s;
        }
        .feature-card:hover {
          border-color: var(--borderBright);
          box-shadow: 0 20px 60px rgba(0,0,0,.5);
        }
        .feature-card:hover::before { opacity: 1; }
        .feature-card:hover .feature-glow { opacity: .08; }
        .feature-card:hover .feature-shine { opacity: 1; }
        .feature-shine {
          position: absolute; inset: 0;
          background: radial-gradient(400px circle at var(--shine-x,50%) var(--shine-y,50%), rgba(200,169,110,.08), transparent 40%);
          opacity: 0; transition: opacity .3s;
          pointer-events: none;
        }
        .feature-glow {
          position: absolute; width: 240px; height: 240px;
          right: -90px; top: -90px;
          border-radius: 50%; filter: blur(70px);
          opacity: .04; transition: opacity .4s;
          pointer-events: none;
        }
        .feature-eyebrow { font-size: 10px; letter-spacing: .2em; text-transform: uppercase; font-weight: 700; }
        .feature-title { font-size: 22px; font-weight: 600; letter-spacing: -.01em; line-height: 1.2; color: var(--text); margin: 0; }
        .feature-body { font-size: 14px; color: var(--text2); line-height: 1.6; margin: 0; }
        .feature-list { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 8px; }
        .feature-bullet-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--text2); line-height: 1.5; transition: color .25s; }
        .feature-card:hover .feature-bullet-row { color: var(--text); }
        .feature-bullet { flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; margin-top: 8px; }

        /* ── CTA section ────────────────────────────────────────── */
        .cta-section { position: relative; z-index: 10; max-width: 1100px; margin: 0 auto; padding: 20px 48px 100px; }
        .cta-card {
          position: relative;
          padding: 60px 56px;
          background: linear-gradient(135deg, var(--bg3) 0%, var(--bg2) 100%);
          border: 1px solid var(--borderBright);
          border-radius: 20px;
          text-align: center; overflow: hidden;
        }
        .cta-shimmer {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 50% 40% at 50% 0%, rgba(200,169,110,.20), transparent 60%);
          pointer-events: none;
          animation: gradientDrift 18s ease-in-out infinite;
        }
        .h2-cta { font-size: clamp(28px, 3.5vw, 42px); font-weight: 700; letter-spacing: -.02em; line-height: 1.15; margin: 0 0 16px; position: relative; }
        .cta-lead { font-size: 16px; color: var(--text2); max-width: 540px; margin: 0 auto 32px; line-height: 1.6; position: relative; }
        .cta-card .cta-row { position: relative; justify-content: center; }
        .contact-meta {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 24px; margin-top: 48px; padding-top: 32px;
          border-top: 1px solid var(--border);
          text-align: left; position: relative;
        }
        .contact-label { font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: var(--text3); margin-bottom: 6px; font-weight: 600; }
        .contact-value { font-size: 14px; color: var(--text); font-weight: 500; }

        /* ── Footer ─────────────────────────────────────────────── */
        .footer {
          position: relative; z-index: 10;
          max-width: 1280px; margin: 0 auto;
          padding: 40px 48px 60px;
          display: grid; grid-template-columns: 2fr 1fr; gap: 32px;
          border-top: 1px solid var(--border);
        }
        .footer-col { display: flex; flex-direction: column; gap: 12px; }
        .footer-brand { font-size: 16px; font-weight: 700; letter-spacing: .18em; color: var(--text); }
        .footer-tagline { font-size: 13px; color: var(--text3); max-width: 380px; line-height: 1.6; }
        .footer-link { color: var(--text2); text-decoration: none; font-size: 13px; transition: color .2s; }
        .footer-link:hover { color: var(--gold); }
        .footer-copy {
          grid-column: 1 / -1; font-size: 12px; color: var(--text3);
          text-align: center; padding-top: 24px; margin-top: 8px;
          border-top: 1px solid var(--border);
        }

        /* ── Reduced motion ─────────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          .bg-gradient, .bg-gradient-2, .bg-grid, .cta-shimmer { animation: none !important; }
          .cta-primary { animation: none !important; }
          .cta-primary::before { animation: none !important; display: none; }
          .badge-dot { animation: none !important; }
          .h1-accent .char { animation: charIn .65s cubic-bezier(.16,1,.3,1) both !important; }
          .trust-row, .orb, .mockup, .mockup-orbit { animation: none !important; }
          .cursor-spotlight { display: none; }
        }

        /* ── Responsive ─────────────────────────────────────────── */
        @media (max-width: 980px) {
          .hero { grid-template-columns: 1fr; gap: 48px; padding: 40px 24px 60px; }
          .hero-mockup-wrap { order: 2; max-width: 520px; margin: 0 auto; }
          .nav { padding: 18px 24px; flex-wrap: wrap; gap: 12px; }
          .nav-links { gap: 16px; flex-wrap: wrap; }
          .nav-link { font-size: 13px; }
          .h1 { font-size: clamp(32px, 9vw, 48px); }
          .features-section, .cta-section, #stats { padding-left: 24px; padding-right: 24px; }
          .feature-grid { grid-template-columns: 1fr; }
          .feature-card.span-2 { grid-column: span 1; }
          .cta-card { padding: 40px 28px; }
          .footer { padding: 32px 24px 40px; grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
