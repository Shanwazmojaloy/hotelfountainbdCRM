import type { Metadata } from 'next';
import Layout from '@/components/Layout';
import UiFonts from '../components/UiFonts';

// Staff CRM must never appear in search. robots.txt disallows /crm, but a page-level
// noindex is the authoritative directive (blocks indexing even of leaked/linked URLs).
export const metadata: Metadata = { robots: { index: false, follow: false } };
// Keep the CRM on the strict per-request nonce CSP: force-dynamic prevents static rendering,
// so Next injects the middleware nonce into its inline hydration scripts every request.
export const dynamic = 'force-dynamic';

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
