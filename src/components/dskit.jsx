'use client';

// Hotel Fountain Design System primitives (Warm Ivory Editorial) — shared across CRM screens.
// Mirrors the handoff components: Badge, Avatar, StatCard, Card, Tabs + table cell styles.
import { useState } from 'react';

export const C = {
  grn: '#15803D', gold: '#8B6914', gold2: '#6B4E0A', goldL: '#C8A96E', sky: '#1D4ED8',
  rose: '#B91C1C', amb: '#B45309', teal: '#0F766E', pur: '#6D28D9', walnut: '#1C1510',
  ink: '#1C1510', ink2: '#5C4A2A', ink3: '#9A8070', br: '#D4C9B5', br2: '#E8E0D0', sunken: '#F9F6F1', card: '#FFFFFF',
};

const TONES = {
  neutral: { bg: 'rgba(154,128,112,.10)', fg: '#9A8070', bd: 'rgba(154,128,112,.25)' },
  green: { bg: 'rgba(21,128,61,.08)', fg: C.grn, bd: 'rgba(21,128,61,.2)' },
  blue: { bg: 'rgba(29,78,216,.08)', fg: C.sky, bd: 'rgba(29,78,216,.2)' },
  amber: { bg: 'rgba(180,83,9,.08)', fg: C.amb, bd: 'rgba(180,83,9,.2)' },
  rose: { bg: 'rgba(185,28,28,.08)', fg: C.rose, bd: 'rgba(185,28,28,.2)' },
  gold: { bg: 'rgba(139,105,20,.08)', fg: C.gold, bd: 'rgba(139,105,20,.2)' },
  teal: { bg: 'rgba(15,118,110,.08)', fg: C.teal, bd: 'rgba(15,118,110,.2)' },
  purple: { bg: 'rgba(109,40,217,.08)', fg: C.pur, bd: 'rgba(109,40,217,.2)' },
};

export function Badge({ tone = 'neutral', children, style }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', fontFamily: 'var(--iv-body)', fontSize: 9, letterSpacing: '.06em', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap', borderRadius: 2, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, ...style }}>
      {children}
    </span>
  );
}

const AV_TONES = {
  gold: 'linear-gradient(135deg,#C8A96E,#8B6914)', teal: 'linear-gradient(135deg,#2EC4B6,#0F766E)',
  walnut: 'linear-gradient(135deg,#5C4A2A,#1C1510)', rose: 'linear-gradient(135deg,#E0848C,#B91C1C)',
  sky: 'linear-gradient(135deg,#6FA0F0,#1D4ED8)',
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

export function StatCard({ icon, label, value, sub, accent = C.walnut }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--iv-border)', borderTop: `3px solid ${accent}`, padding: '14px 18px 16px', transition: 'box-shadow .2s var(--iv-ease)' }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--iv-shadow-stat)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 }}>
        <div style={{ fontSize: 8, letterSpacing: '.16em', color: 'var(--iv-ink3)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
        {icon != null && <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: accent }}>{icon}</div>}
      </div>
      <div style={{ fontFamily: 'var(--iv-mono)', fontSize: 29, fontWeight: 700, color: 'var(--iv-ink)', lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{value}</div>
      {sub != null && <div style={{ fontSize: 11, color: 'var(--iv-ink2)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function Card({ title, titleAccent, accent = 'var(--iv-side)', action, bodyStyle, children, style }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--iv-border)', borderTop: `3px solid ${accent}`, overflow: 'hidden', marginBottom: 16, ...style }}>
      {(title || action) && (
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--iv-border2)', background: 'var(--iv-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, flexWrap: 'wrap' }}>
          {title != null && (
            <h3 style={{ margin: 0, fontFamily: 'var(--iv-head)', fontSize: 16, fontWeight: 700, color: 'var(--iv-ink)' }}>
              {title}{titleAccent && <em style={{ fontStyle: 'italic', color: 'var(--iv-gold)', fontWeight: 400 }}> {titleAccent}</em>}
            </h3>
          )}
          {action}
        </header>
      )}
      <div style={{ padding: '16px 18px', ...bodyStyle }}>{children}</div>
    </section>
  );
}

// Underline tab bar (walnut active border). tabs: [{id,label,count?,color?}]
export function Tabs({ tabs, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--iv-side)', marginBottom: 16, overflowX: 'auto', ...style }}>
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: '9px 16px', fontFamily: 'var(--iv-body)', fontSize: 11, fontWeight: on ? 700 : 500, color: on ? 'var(--iv-ink)' : (t.color || 'var(--iv-ink3)'), letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', background: on ? '#fff' : 'transparent', border: 'none', borderBottom: `2px solid ${on ? 'var(--iv-side)' : 'transparent'}`, marginBottom: -2, whiteSpace: 'nowrap' }}>
            {t.label}{t.count != null ? ` (${t.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}

export const TH = { fontFamily: 'var(--iv-body)', fontSize: 8, letterSpacing: '.16em', color: 'var(--iv-ink3)', textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid var(--iv-side)', background: 'var(--iv-sunken)', fontWeight: 600, whiteSpace: 'nowrap' };
export const TD = { padding: '11px 14px', fontSize: 12, color: 'var(--iv-ink)', verticalAlign: 'middle', borderBottom: '1px solid var(--iv-border2)' };
export const MONO = { fontFamily: 'var(--iv-mono)', fontSize: 11 };

export function Table({ head, children }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function HoverRow({ children, onClick }) {
  return (
    <tr onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(197,160,89,.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {children}
    </tr>
  );
}

export const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
