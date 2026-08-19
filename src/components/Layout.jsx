'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from "./Header";
import BottomNav from "./BottomNav";
import AuthGate, { useAuth } from "./AuthGate";
import { canAccess, homeRoute } from '@/lib/permissions';
// PERF (2026-07-21): the Lumea CRM theme (.crm-root .iv-* etc, ~580 rules) used to live
// in app/globals.css, which the ROOT layout imports on every route -- including every
// public marketing pageview. Split out here so only routes that render this Layout (the
// sole renderer of .crm-root) pay for it. See app/globals.css header + src/components/crm-theme.css.
import "./crm-theme.css";

// RBAC route guard — runs inside AuthGate so `user` is resolved. A role that deep-links
// (or is redirected back) to a page outside its department is bounced to the Dashboard.
// This is the in-app guard; the API routes re-check independently (server is authoritative).
function RouteGuard({ children }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (user && pathname && !canAccess(user.role, pathname, user.tenant_id, user.email)) router.replace(homeRoute(user.role));
  }, [user, pathname, router]);
  if (user && pathname && !canAccess(user.role, pathname, user.tenant_id, user.email)) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--iv-ink3)', fontSize: 13 }}>Redirecting…</div>;
  }
  return children;
}

// (Keep-warm pinger removed 2026-07-31 same-day: /crm pages are now STATIC shells —
// CDN-served, no page function to keep warm. See app/crm/layout.tsx.)

// Access banner — the ONLY warning a SUBSCRIBER gets before writes stop.
//
// Without it the first signal of an unpaid invoice is a save failing on the 10th, which
// reads as the product being broken rather than the bill being due. State comes from the
// session ping (already running every 2 min), so this costs no extra polling.
//
// DEMOS ARE DELIBERATELY SILENT (owner rule, 2026-08-19). A prospect evaluating the
// product sees no countdown, no invoice notice, nothing — until they choose to subscribe.
// A trial that nags is a trial that feels like a bill. The only touch a demo ever gets is
// the "Trial Complete" card at the moment it ends, which is a sales moment, not a warning.
// `platform_open_month()` already excludes demos from invoicing for the same reason.
//
// Not dismissible: it is dismissed by paying, or by the clock running out.
function AccessBanner() {
  const { access } = useAuth();
  if (!access || !access.state) return null;
  if (access.kind === 'demo') return null; // silent for the whole trial, by design

  let tone = null; let text = null;
  if (access.state === 'due_soon') {
    tone = 'warn';
    text = 'This month’s invoice is unpaid. From the 10th the system becomes read-only until it is settled — no data is deleted.';
  } else if (access.state === 'past_due') {
    tone = 'stop';
    text = 'Read-only: this month’s invoice is unpaid. You can view everything, but new bookings, charges and payments are paused until it is settled.';
  } else if (access.state === 'blocked') {
    tone = 'stop';
    text = 'This account is paused. Your data is safe and untouched.';
  }
  if (!text) return null;

  const bg = tone === 'stop' ? 'rgba(255,107,107,.12)' : 'rgba(245,169,59,.12)';
  const bd = tone === 'stop' ? 'rgba(255,107,107,.35)' : 'rgba(245,169,59,.35)';
  const fg = tone === 'stop' ? '#FF8F8F' : '#F5A93B';

  return (
    <div role="status" style={{ background: bg, borderBottom: `1px solid ${bd}`, color: fg, padding: '9px 28px', fontSize: 13, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 240 }}>{text}</span>
      <a href="https://wa.me/8801768880806" target="_blank" rel="noreferrer"
        style={{ color: fg, fontWeight: 600, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
        Talk to Shan
      </a>
    </div>
  );
}

// App shell — Aurora/Orbix (2026-07-04): full-width top pill-nav bar + scrolling content.
// The old walnut Sidebar is retired; all nav lives in Header pills (desktop) / BottomNav (mobile).
export default function Layout({ children }) {
  return (
    <AuthGate>
      <div className="crm-root flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Main column: fixed topbar + scrolling content */}
        <div className="flex-1 flex flex-col min-w-0" style={{ height: '100vh' }}>
          <Header />
          <AccessBanner />
          <main className="flex-1 overflow-y-auto pb-24 md:pb-8" style={{ padding: '24px 28px', background: 'var(--iv-bg)' }}>
            <RouteGuard>{children}</RouteGuard>
          </main>
        </div>

        {/* Mobile bottom nav */}
        <BottomNav />
      </div>
    </AuthGate>
  );
}
