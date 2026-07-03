'use client';

// Hotel Fountain Design System primitives (Warm Ivory Editorial) — shared across CRM screens.
// Mirrors the handoff components: Badge, Avatar, StatCard, Card, Tabs + table cell styles.
import { useState, useEffect, useRef } from 'react';

// Skeleton shimmer — shown while a value is still loading (instead of a blank/dash).
export function Skeleton({ w = 88, h = 30, style }) {
  return <span className="iv-skel" style={{ width: w, height: h, ...style }} />;
}

// CountUp — animates a numeric value (preserving ৳ / %, thousands separators) so KPIs
// "tick up" like a professional dashboard. Non-numeric values (e.g. text) render as-is.
export function CountUp({ value, duration = 650, animateMount = false }) {
  const str = String(value ?? '');
  const target = typeof value === 'number' ? value : parseFloat(str.replace(/[^0-9.-]/g, ''));
  const finite = Number.isFinite(target);
  const prefix = finite ? (str.match(/^[^\d-]*/)?.[0] || '') : '';
  const suffix = finite ? (str.match(/[^\d.,-]*$/)?.[0] || '') : '';
  const [disp, setDisp] = useState(finite ? (animateMount ? 0 : target) : value);
  const prev = useRef(animateMount ? 0 : (finite ? target : 0));
  useEffect(() => {
    if (!finite) { setDisp(value); return; }
    let raf; const from = Number.isFinite(prev.current) ? prev.current : 0; const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisp(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick); else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  if (!finite) return <>{value}</>;
  return <>{prefix}{Number(disp).toLocaleString('en-US')}{suffix}</>;
}

const isLoadingVal = (v) => v == null || v === '—' || v === '';

// Aurora/Orbix palette (2026-07-04): lime accent + saturated series colors on dark glass.
// Token KEYS unchanged — 'gold' now resolves to the lime accent CRM-wide.
export const C = {
  grn: '#7BE04A', gold: '#DFFF45', gold2: '#C3E62E', goldL: '#DFFF45', sky: '#6AA5FF',
  rose: '#FF6B6B', amb: '#F5A93B', teal: '#3ED3C1', pur: '#C08BFF', walnut: '#0F172A',
  ink: '#F2F1F5', ink2: '#A7A4B0', ink3: '#716E7B', br: 'rgba(255,255,255,.09)', br2: 'rgba(255,255,255,.055)', sunken: 'rgba(255,255,255,.035)', card: 'rgba(23,21,28,.78)',
};

const TONES = {
  neutral: { bg: 'rgba(148,152,166,.1)', fg: '#A7A4B0', bd: 'rgba(148,152,166,.25)' },
  green: { bg: 'rgba(123,224,74,.11)', fg: C.grn, bd: 'rgba(123,224,74,.3)' },
  blue: { bg: 'rgba(106,165,255,.11)', fg: C.sky, bd: 'rgba(106,165,255,.3)' },
  amber: { bg: 'rgba(245,169,59,.11)', fg: C.amb, bd: 'rgba(245,169,59,.3)' },
  rose: { bg: 'rgba(255,107,107,.11)', fg: C.rose, bd: 'rgba(255,107,107,.3)' },
  gold: { bg: 'rgba(223,255,69,.1)', fg: C.gold, bd: 'rgba(223,255,69,.28)' },
  teal: { bg: 'rgba(62,211,193,.11)', fg: C.teal, bd: 'rgba(62,211,193,.3)' },
  purple: { bg: 'rgba(192,139,255,.11)', fg: C.pur, bd: 'rgba(192,139,255,.3)' },
};

export function Badge({ tone = 'neutral', children, style }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', fontFamily: 'var(--iv-body)', fontSize: 11, letterSpacing: '.01em', fontWeight: 600, textTransform: 'none', whiteSpace: 'nowrap', borderRadius: 999, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, ...style }}>
      {children}
    </span>
  );
}

const AV_TONES = {
  gold: 'linear-gradient(135deg,#C8A96E,#8B6914)', teal: 'linear-gradient(135deg,#2DD4BF,#3ED3C1)',
  walnut: 'linear-gradient(135deg,#475569,#0F172A)', rose: 'linear-gradient(135deg,#F87171,#FF6B6B)',
  sky: 'linear-gradient(135deg,#60A5FA,#6AA5FF)',
};
export function Avatar({ name = '', size = 32, tone }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const keys = Object.keys(AV_TONES);
  const grad = AV_TONES[tone] || AV_TONES[keys[(name || '').length % keys.length]];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, flexShrink: 0, borderRadius: 999, background: grad, color: '#fff', fontFamily: 'var(--iv-body)', fontWeight: 700, fontSize: Math.round(size * 0.38), letterSpacing: '.04em' }}>
      {initials}
    </span>
  );
}

export function StatCard({ icon, label, value, sub, accent = C.gold }) {
  return (
    <div className="iv-card--hover" style={{ background: 'var(--iv-card)', border: '1px solid var(--iv-border)', borderRadius: 18, boxShadow: 'var(--iv-card-shadow)', padding: '16px 18px', transition: 'box-shadow .25s var(--iv-ease), transform .25s var(--iv-ease), border-color .25s var(--iv-ease)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '.01em', color: 'var(--iv-ink2)', fontWeight: 500 }}>{label}</div>
        {icon != null && <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: accent, background: `${accent}14` }}>{icon}</div>}
      </div>
      <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 28, fontWeight: 700, color: 'var(--iv-ink)', lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{isLoadingVal(value) ? <Skeleton w={84} h={30} /> : <CountUp value={value} />}</div>
      {sub != null && <div style={{ fontSize: 11.5, color: 'var(--iv-ink3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function Card({ title, titleAccent, accent, action, bodyStyle, children, style }) {
  return (
    <section style={{ background: 'var(--iv-card)', border: '1px solid var(--iv-border)', borderRadius: 18, boxShadow: 'var(--iv-card-shadow)', overflow: 'hidden', marginBottom: 20, ...style }}>
      {(title || action) && (
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, flexWrap: 'wrap' }}>
          {title != null && (
            <h3 style={{ margin: 0, fontFamily: 'var(--iv-head)', fontSize: 15, fontWeight: 700, color: 'var(--iv-ink)', letterSpacing: '-.01em' }}>
              {title}{titleAccent && <em style={{ fontStyle: 'normal', color: 'var(--iv-gold)', fontWeight: 700 }}> {titleAccent}</em>}
            </h3>
          )}
          {action}
        </header>
      )}
      <div style={{ padding: '16px 18px', ...bodyStyle }}>{children}</div>
    </section>
  );
}

// Underline tab bar with a sliding gilded indicator. tabs: [{id,label,count?,color?}]
export function Tabs({ tabs, value, onChange, style }) {
  const barRef = useRef(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const bar = barRef.current; if (!bar) return;
    const measure = () => {
      const el = bar.querySelector('button[data-on="1"]');
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, tabs]);
  return (
    <div ref={barRef} className="iv-tabbar" style={{ position: 'relative', display: 'flex', gap: 2, borderBottom: '1px solid var(--iv-border)', marginBottom: 16, overflowX: 'auto', ...style }}>
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} data-on={on ? '1' : '0'} onClick={() => onChange(t.id)} style={{ padding: '10px 14px', fontFamily: 'var(--iv-body)', fontSize: 13, fontWeight: on ? 600 : 500, color: on ? 'var(--iv-gold)' : (t.color || 'var(--iv-ink2)'), letterSpacing: 0, textTransform: 'none', cursor: 'pointer', background: 'transparent', border: 'none', whiteSpace: 'nowrap', transition: 'color .2s var(--iv-ease)' }}>
            {t.label}{t.count != null ? <span style={{ fontVariantNumeric: 'tabular-nums', color: on ? 'var(--iv-gold)' : 'var(--iv-ink3)' }}> <CountUp value={t.count} animateMount duration={520} /></span> : ''}
          </button>
        );
      })}
      {ind.width > 0 && (
        <span aria-hidden style={{ position: 'absolute', bottom: 0, left: ind.left, width: ind.width, height: 2, borderRadius: 2, background: 'var(--iv-gold)', transition: 'left .3s var(--iv-ease), width .3s var(--iv-ease)', pointerEvents: 'none' }} />
      )}
    </div>
  );
}

export const TH = { fontFamily: 'var(--iv-body)', fontSize: 12, letterSpacing: '.01em', color: '#64748B', textTransform: 'none', padding: '11px 14px', textAlign: 'left', borderBottom: '1px solid var(--iv-border)', background: 'var(--iv-sunken)', fontWeight: 600, whiteSpace: 'nowrap' };
export const TD = { padding: '12px 14px', fontSize: 13, color: 'var(--iv-ink)', verticalAlign: 'middle', borderBottom: '1px solid var(--iv-border2)' };
export const MONO = { fontFamily: 'var(--iv-mono)', fontSize: 11 };

export function Table({ head, children }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={TH}>{h}</th>)}</tr></thead>
        <tbody className="iv-tbody">{children}</tbody>
      </table>
    </div>
  );
}

export function HoverRow({ children, onClick }) {
  return (
    <tr onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', transition: 'background .18s var(--iv-ease)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {children}
    </tr>
  );
}

export const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
