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
    if (user && pathname && !canAccess(user.role, pathname)) router.replace(homeRoute(user.role));
  }, [user, pathname, router]);
  if (user && pathname && !canAccess(user.role, pathname)) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--iv-ink3)', fontSize: 13 }}>Redirecting…</div>;
  }
  return children;
}

// KEEP-WARM (2026-07-31): the /crm PAGE function's cold boot is ~20s (heavy server
// bundle — workflow SDK et al, see crm_slowness memory), while APIs boot in ~1s. Every
// deploy/scale-out replaces warm instances, so the next staff page-load paid the full
// cold boot — the recurring "20 seconds again" complaint. While ANY staff tab is open,
// this pings the /crm document every 4 min so a warm page-function instance always
// exists (288 tiny invocations/day worst case — trivial). The pre-shift Vercel cron
// (vercel.json /crm @ 00:45 UTC) covers the overnight-cold morning first-hit. The REAL
// fix is shrinking the server bundle — tracked as a follow-up.
function useKeepWarm() {
  useEffect(() => {
    const ping = () => { fetch('/crm', { cache: 'no-store' }).catch(() => {}); };
    const iv = setInterval(ping, 4 * 60_000);
    return () => clearInterval(iv);
  }, []);
}

// App shell — Aurora/Orbix (2026-07-04): full-width top pill-nav bar + scrolling content.
// The old walnut Sidebar is retired; all nav lives in Header pills (desktop) / BottomNav (mobile).
export default function Layout({ children }) {
  useKeepWarm();
  return (
    <AuthGate>
      <div className="crm-root flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Main column: fixed topbar + scrolling content */}
        <div className="flex-1 flex flex-col min-w-0" style={{ height: '100vh' }}>
          <Header />
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
