import type { Metadata } from "next";

// Admin surfaces (/admin/audit, /admin/onboard) must never be indexed. This
// page-level noindex is authoritative — robots.txt alone only discourages crawl,
// it does not prevent indexing of a leaked or externally-linked URL.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
