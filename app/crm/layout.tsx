import Layout from '@/components/Layout';

// Shared shell for ALL /crm/* routes. Mounted ONCE — AuthGate, Sidebar and Header
// persist across tab navigation, so switching pages only swaps the page body (no
// remount, no auth re-check, no LOADING flash). Per-page wrappers were removed.
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}
