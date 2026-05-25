'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lumea PMS — Marketing Landing (animated)
//
// Served at https://lumea.fountainbd.com/ via host-based rewrite in middleware.ts.
// Bold modern SaaS aesthetic (Linear / Vercel-style dark with gold gradient
// accents). Motion via pure CSS keyframes + IntersectionObserver — no framer-
// motion dependency. All animations use transform/opacity for GPU acceleration.
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

// ─── Count-up hook (animates a number from 0 to target on mount) ─────────────
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
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, durationMs, trigger]);
  return value;
}

// ─── IntersectionObserver hook — fires once when element enters viewport ────
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

// ─── Single animated stat tile ───────────────────────────────────────────────
function StatTile({
  stat,
  delay,
}: {
  stat: (typeof STATS)[number];
  delay: number;
}) {
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

// ─── Single feature card with scroll-reveal ──────────────────────────────────
function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof FEATURES)[number];
  index: number;
}) {
  const [ref, inView] = useInView<HTMLElement>('-15% 0px');
  return (
    <article
      ref={ref}
      className={`feature-card ${index % 3 === 0 ? 'span-2' : ''}`}
      style={{
        animation: inView
          ? `fadeUp .9s cubic-bezier(.16,1,.3,1) ${index * 100}ms both`
          : 'none',
        ['--accent' as string]: feature.accent,
      }}
    >
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

export default function LumeaLandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="lumea-main">
      {/* Background motion layers */}
      <div className="bg-gradient" aria-hidden="true" />
      <div className="bg-gradient-2" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-vignette" aria-hidden="true" />

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

      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div
          className="badge"
          style={{ animation: 'fadeUp .8s cubic-bezier(.16,1,.3,1) 200ms both' }}
        >
          <span className="badge-dot" />
          <span>Now operating Hotel Fountain · Dhaka</span>
        </div>

        <h1 className="h1" style={{ animation: 'fadeUp .9s cubic-bezier(.16,1,.3,1) 400ms both' }}>
          The PMS your boutique hotel
          <br />
          <span className="h1-accent">actually wants to use.</span>
        </h1>

        <p className="lead" style={{ animation: 'fadeUp .9s cubic-bezier(.16,1,.3,1) 600ms both' }}>
          Reservations, billing, housekeeping, and an AI lead pipeline —
          engineered for 15&ndash;80 room hotels and trusted to run a property
          every day. One database. One staff portal. Zero spreadsheets.
        </p>

        <div className="cta-row" style={{ animation: 'fadeUp .9s cubic-bezier(.16,1,.3,1) 800ms both' }}>
          <a href={WHATSAPP_URL} className="cta-primary" target="_blank" rel="noopener noreferrer">
            <span>Talk to us on WhatsApp</span>
            <span className="cta-arrow">→</span>
          </a>
          <a href={EMAIL_URL} className="cta-secondary">
            Email · hotellfountainbd@gmail.com
          </a>
        </div>

        <div className="trust-row" style={{ animation: 'fadeUp .9s cubic-bezier(.16,1,.3,1) 1000ms both' }}>
          <span className="trust-label">Live in production at</span>
          <a href="https://fountainbd.com" target="_blank" rel="noopener noreferrer" className="trust-link">
            Hotel Fountain · Dhaka ↗
          </a>
        </div>
      </section>

      {/* ─── Stats strip ─────────────────────────────────────────────────── */}
      <section id="stats" className="stats-strip">
        {STATS.map((s, i) => (
          <StatTile key={s.label} stat={s} delay={i * 100} />
        ))}
      </section>

      {/* ─── Features bento ──────────────────────────────────────────────── */}
      <section id="features" className="features-section">
        <div className="section-eyebrow" style={{ animation: mounted ? 'fadeUp .8s cubic-bezier(.16,1,.3,1) both' : 'none' }}>
          What ships in Lumea
        </div>
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
        <div className="cta-card">
          <div className="cta-shimmer" aria-hidden="true" />
          <div className="section-eyebrow">Let&rsquo;s talk</div>
          <h2 className="h2-cta">
            We&rsquo;ll set up Lumea for your hotel in a week.
          </h2>
          <p className="cta-lead">
            Onboarding includes data migration from your current spreadsheet or PMS,
            staff training, and 30 days of priority support. Fixed price, no surprises.
          </p>
          <div className="cta-row">
            <a href={WHATSAPP_URL} className="cta-primary" target="_blank" rel="noopener noreferrer">
              <span>Start on WhatsApp</span>
              <span className="cta-arrow">→</span>
            </a>
            <a href={EMAIL_URL} className="cta-secondary">
              Or email us
            </a>
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

      {/* ─── Styles (scoped via styled-jsx alternative — pure <style>) ────── */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gradientDrift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(4%, -3%) scale(1.05); }
          66%      { transform: translate(-3%, 4%) scale(0.95); }
        }
        @keyframes gradientDrift2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50%      { transform: translate(-5%, 5%) rotate(180deg); }
        }
        @keyframes gridShift {
          from { transform: translateY(0); }
          to   { transform: translateY(64px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(74,124,89,0.6); }
          50%      { opacity: 0.8; transform: scale(1.15); box-shadow: 0 0 0 8px rgba(74,124,89,0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 10px 40px rgba(200,169,110,0.25), 0 0 0 1px rgba(200,169,110,0.4); }
          50%      { box-shadow: 0 14px 60px rgba(200,169,110,0.45), 0 0 0 1px rgba(200,169,110,0.6); }
        }
        @keyframes ctaShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

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
          --border: rgba(200,169,110,.15);
          --borderBright: rgba(200,169,110,.35);
        }

        .lumea-main {
          position: relative;
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 16px;
          line-height: 1.6;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        .bg-gradient {
          position: absolute;
          inset: -10%;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(200,169,110,0.20), transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 30%, rgba(156,122,62,0.14), transparent 70%),
            radial-gradient(ellipse 60% 60% at 20% 70%, rgba(74,124,89,0.10), transparent 70%);
          pointer-events: none;
          z-index: 0;
          animation: gradientDrift 22s ease-in-out infinite;
          will-change: transform;
        }
        .bg-gradient-2 {
          position: absolute;
          inset: -20%;
          background:
            radial-gradient(ellipse 40% 30% at 70% 80%, rgba(177,77,77,0.06), transparent 60%),
            radial-gradient(ellipse 30% 30% at 30% 20%, rgba(74,124,89,0.06), transparent 60%);
          pointer-events: none;
          z-index: 0;
          animation: gradientDrift2 30s ease-in-out infinite;
          will-change: transform;
        }
        .bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(200,169,110,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(200,169,110,0.04) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%);
          pointer-events: none;
          z-index: 0;
          animation: gridShift 12s linear infinite;
          will-change: transform;
        }
        .bg-vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at center, transparent 50%, rgba(7,9,14,0.8) 100%);
          pointer-events: none;
          z-index: 1;
        }

        /* Navigation */
        .nav {
          position: relative;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 22px 48px;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
        }
        .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
        .brand-word { font-size: 18px; font-weight: 700; letter-spacing: 0.18em; }
        .brand-dot { color: var(--gold); font-size: 14px; }
        .brand-sub { font-size: 12px; color: var(--text3); letter-spacing: 0.05em; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-link {
          color: var(--text2);
          text-decoration: none;
          font-size: 14px;
          transition: color .25s ease;
          position: relative;
        }
        .nav-link:hover { color: var(--gold); }
        .nav-link::after {
          content: '';
          position: absolute;
          left: 0; bottom: -4px;
          width: 0; height: 1px;
          background: var(--gold);
          transition: width .3s cubic-bezier(.16,1,.3,1);
        }
        .nav-link:hover::after { width: 100%; }
        .nav-cta {
          padding: 9px 18px;
          background: var(--gold);
          color: var(--bg);
          border-radius: 6px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s, background .2s;
        }
        .nav-cta:hover {
          transform: translateY(-1px);
          background: var(--goldBright);
          box-shadow: 0 8px 24px rgba(200,169,110,0.35);
        }

        /* Hero */
        .hero { position: relative; z-index: 10; max-width: 1100px; margin: 0 auto; padding: 80px 48px 100px; text-align: center; }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(200,169,110,0.08);
          border: 1px solid var(--border);
          border-radius: 99px;
          font-size: 12px;
          color: var(--text2);
          letter-spacing: 0.04em;
          margin-bottom: 32px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #4A7C59;
          animation: pulse 2.2s ease-in-out infinite;
        }
        .h1 {
          font-size: clamp(40px, 6vw, 72px);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.05;
          margin: 0 0 24px;
        }
        .h1-accent {
          font-style: italic;
          font-family: 'Cormorant Garamond', 'Libre Baskerville', serif;
          font-weight: 400;
          background: linear-gradient(120deg, var(--goldBright) 0%, var(--gold) 30%, var(--goldDeep) 50%, var(--gold) 70%, var(--goldBright) 100%);
          background-size: 200% auto;
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 6s linear infinite;
        }
        .lead {
          font-size: clamp(16px, 1.6vw, 19px);
          color: var(--text2);
          max-width: 680px;
          margin: 0 auto 40px;
          line-height: 1.55;
        }
        .cta-row { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 32px; }
        .cta-primary {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 26px;
          background: linear-gradient(135deg, var(--goldBright), var(--gold));
          color: var(--bg);
          border-radius: 10px;
          text-decoration: none;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.01em;
          transition: transform .25s cubic-bezier(.16,1,.3,1);
          animation: glowPulse 3s ease-in-out infinite;
          position: relative;
          overflow: hidden;
        }
        .cta-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
          transform: translateX(-100%);
          animation: ctaShimmer 3.5s ease-in-out infinite;
          pointer-events: none;
        }
        .cta-primary:hover { transform: translateY(-2px); }
        .cta-primary:hover .cta-arrow { transform: translateX(4px); }
        .cta-arrow { font-size: 18px; transition: transform .25s cubic-bezier(.16,1,.3,1); }
        .cta-secondary {
          display: inline-flex;
          align-items: center;
          padding: 14px 24px;
          color: var(--text);
          border-radius: 10px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          border: 1px solid var(--borderBright);
          background: rgba(200,169,110,0.04);
          transition: background .25s, border-color .25s, transform .25s cubic-bezier(.16,1,.3,1);
        }
        .cta-secondary:hover {
          background: rgba(200,169,110,0.10);
          border-color: var(--gold);
          transform: translateY(-1px);
        }
        .trust-row {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          background: rgba(255,255,255,0.02);
          border-radius: 99px;
          font-size: 12px;
          color: var(--text3);
          animation: float 4s ease-in-out infinite;
        }
        .trust-label { letter-spacing: 0.05em; }
        .trust-link { color: var(--gold); text-decoration: none; font-weight: 500; transition: color .2s; }
        .trust-link:hover { color: var(--goldBright); }

        /* Stats */
        .stats-strip {
          position: relative;
          z-index: 10;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1px;
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 48px 100px;
        }
        .stat-tile {
          padding: 32px 24px;
          background: rgba(255,255,255,0.015);
          border: 1px solid var(--border);
          text-align: center;
          transition: background .3s, border-color .3s, transform .3s cubic-bezier(.16,1,.3,1);
        }
        .stat-tile:hover {
          background: rgba(200,169,110,0.05);
          border-color: var(--borderBright);
          transform: translateY(-3px);
        }
        .stat-value {
          font-size: 40px;
          font-weight: 700;
          color: var(--gold);
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
          margin-bottom: 6px;
          line-height: 1;
        }
        .stat-label {
          font-size: 11px;
          color: var(--text3);
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }

        /* Features */
        .features-section { position: relative; z-index: 10; max-width: 1280px; margin: 0 auto; padding: 40px 48px 100px; }
        .section-eyebrow {
          display: inline-block;
          font-size: 11px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: var(--goldDeep);
          margin-bottom: 20px;
          font-weight: 600;
        }
        .h2 {
          font-size: clamp(28px, 4vw, 48px);
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin: 0 0 60px;
          max-width: 720px;
        }
        .h2-accent { color: var(--text3); font-weight: 400; }
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }
        .feature-card {
          position: relative;
          padding: 32px 30px;
          background: linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%);
          border: 1px solid var(--border);
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: transform .35s cubic-bezier(.16,1,.3,1), border-color .35s, box-shadow .35s;
          overflow: hidden;
        }
        .feature-card.span-2 { grid-column: span 2; }
        .feature-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent, var(--gold)), transparent);
          opacity: 0;
          transition: opacity .35s;
        }
        .feature-card:hover {
          transform: translateY(-4px);
          border-color: var(--borderBright);
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }
        .feature-card:hover::before { opacity: 1; }
        .feature-card:hover .feature-glow { opacity: 0.06; }
        .feature-glow {
          position: absolute;
          width: 200px;
          height: 200px;
          right: -80px;
          top: -80px;
          border-radius: 50%;
          filter: blur(60px);
          opacity: 0.03;
          transition: opacity .4s;
          pointer-events: none;
        }
        .feature-eyebrow {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .feature-title {
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1.2;
          color: var(--text);
          margin: 0;
        }
        .feature-body { font-size: 14px; color: var(--text2); line-height: 1.6; margin: 0; }
        .feature-list { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 8px; }
        .feature-bullet-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--text2); line-height: 1.5; transition: color .25s; }
        .feature-card:hover .feature-bullet-row { color: var(--text); }
        .feature-bullet { flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%; margin-top: 8px; }

        /* CTA section */
        .cta-section { position: relative; z-index: 10; max-width: 1100px; margin: 0 auto; padding: 40px 48px 100px; }
        .cta-card {
          position: relative;
          padding: 60px 56px;
          background: linear-gradient(135deg, var(--bg3) 0%, var(--bg2) 100%);
          border: 1px solid var(--borderBright);
          border-radius: 20px;
          text-align: center;
          overflow: hidden;
        }
        .cta-shimmer {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 50% 40% at 50% 0%, rgba(200,169,110,0.18), transparent 60%);
          pointer-events: none;
          animation: gradientDrift 18s ease-in-out infinite;
        }
        .h2-cta {
          font-size: clamp(28px, 3.5vw, 42px);
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.15;
          margin: 0 0 16px;
          position: relative;
        }
        .cta-lead {
          font-size: 16px;
          color: var(--text2);
          max-width: 540px;
          margin: 0 auto 32px;
          line-height: 1.6;
          position: relative;
        }
        .cta-card .cta-row { position: relative; }
        .contact-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 24px;
          margin-top: 48px;
          padding-top: 32px;
          border-top: 1px solid var(--border);
          text-align: left;
          position: relative;
        }
        .contact-label {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text3);
          margin-bottom: 6px;
          font-weight: 600;
        }
        .contact-value { font-size: 14px; color: var(--text); font-weight: 500; }

        /* Footer */
        .footer {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 40px 48px 60px;
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 32px;
          border-top: 1px solid var(--border);
        }
        .footer-col { display: flex; flex-direction: column; gap: 12px; }
        .footer-brand { font-size: 16px; font-weight: 700; letter-spacing: 0.18em; color: var(--text); }
        .footer-tagline { font-size: 13px; color: var(--text3); max-width: 380px; line-height: 1.6; }
        .footer-link { color: var(--text2); text-decoration: none; font-size: 13px; transition: color .2s; }
        .footer-link:hover { color: var(--gold); }
        .footer-copy {
          grid-column: 1 / -1;
          font-size: 12px;
          color: var(--text3);
          text-align: center;
          padding-top: 24px;
          margin-top: 8px;
          border-top: 1px solid var(--border);
        }

        /* Reduced-motion preference: kill the noisy bits but keep card hovers */
        @media (prefers-reduced-motion: reduce) {
          .bg-gradient, .bg-gradient-2, .bg-grid, .cta-shimmer { animation: none !important; }
          .cta-primary { animation: none !important; }
          .cta-primary::before { animation: none !important; display: none; }
          .badge-dot { animation: none !important; }
          .h1-accent { animation: none !important; background-position: 0 center; }
          .trust-row { animation: none !important; }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .nav { padding: 18px 24px; flex-wrap: wrap; gap: 12px; }
          .nav-links { gap: 16px; flex-wrap: wrap; }
          .nav-link { font-size: 13px; }
          .hero { padding: 40px 24px 60px; }
          .h1 { font-size: clamp(32px, 9vw, 48px); }
          .features-section, .cta-section, .stats-strip { padding-left: 24px; padding-right: 24px; }
          .feature-grid { grid-template-columns: 1fr; }
          .feature-card.span-2 { grid-column: span 1; }
          .cta-card { padding: 40px 28px; }
          .footer { padding: 32px 24px 40px; grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
