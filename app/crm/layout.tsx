import Layout from '@/components/Layout';
import UiFonts from '../components/UiFonts';

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
