import type { Metadata } from 'next';
import Layout from '@/components/Layout';
import UiFonts from '../components/UiFonts';

// Staff CRM must never appear in search. robots.txt disallows /crm, but a page-level
// noindex is the authoritative directive (blocks indexing even of leaked/linked URLs).
export const metadata: Metadata = { robots: { index: false, follow: false } };
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
    </>
  );
}
