import Layout from '@/components/Layout';

// Shared shell for ALL /crm/* routes. Mounted ONCE — AuthGate, Sidebar and Header persist
// across tab navigation, so switching pages only swaps the page body (no remount, no auth
// re-check, no flash). The inline <style> forces an ivory page background for the whole CRM
// so a hard reload never flashes the marketing site's near-black body before React paints.
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html,body{background:#EEF2F7 !important;}`}</style>
      <Layout>{children}</Layout>
    </>
  );
}
