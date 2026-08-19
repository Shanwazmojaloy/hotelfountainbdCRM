import type { Metadata } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Layout from '@/components/Layout';
import UiFonts from '../components/UiFonts';

// Staff CRM must never appear in search. robots.txt disallows /crm, but a page-level
// noindex is the authoritative directive (blocks indexing even of leaked/linked URLs).
// Title is generic on purpose: /crm is served to EVERY tenant, so inheriting the root
// layout's "Hotel Fountain — Dhaka's Finest Luxury Hotel" put our hotel's name in a
// client's browser tab and window switcher. It cannot be per-tenant here — this tree is
// a static shell with no headers() read (see the note below), and adding one would turn
// the whole CRM back into a cold-bootable function.
export const metadata: Metadata = {
  title: 'Lumea — Hotel Growth OS',
  robots: { index: false, follow: false },
};
// STATIC SHELL (owner decision 2026-07-31): /crm left the strict nonce-CSP set
// (middleware STRICT_PREFIXES) so these pages can STATICALLY PRERENDER — CDN-served,
// no page function, no ~20s Hobby cold boot. Do NOT re-add `dynamic='force-dynamic'`
// or any headers()/cookies() read in this server tree — either one silently turns the
// whole CRM back into a cold-bootable function. Auth/session/data remain fully dynamic
// client-side via AuthGate + /api/crm/* (which keep the strict CSP + perimeter).

// Shared shell for ALL /crm/* routes. Mounted ONCE — AuthGate and the Header pill-nav persist
// across tab navigation, so switching pages only swaps the page body (no remount, no auth
// re-check, no flash). The inline <style> forces the Aurora near-black background for the
// whole CRM so a hard reload never flashes a mismatched body color before React paints.
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UiFonts />
      <style>{`html,body{background:#0B0A0F !important;}`}</style>
      <Layout>{children}</Layout>
      {/* Speed Insights RE-SCOPED to /crm (owner decision 2026-08-06): safe here since the
          static-shell CSP trade (ee5aad3) put /crm on the same 'unsafe-inline' policy as the
          public site — the SI inline stub no longer trips CSP. Staff hard loads + route
          changes are the desktop RES signal. Do NOT move this back to the ROOT layout: the
          strict-CSP surfaces (/admin /lumea /settings /billing /invoice) would block the
          stub again (see 4d10257). Client component — does not force dynamic rendering. */}
      <SpeedInsights />
    </>
  );
}
