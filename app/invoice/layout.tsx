import type { Metadata } from "next";
import { headers } from "next/headers";

// /invoice/[id] renders a guest's billing document. Staff/guest-linked, must stay out of search.
export const metadata: Metadata = { robots: { index: false, follow: false } };
// Stay on the strict per-request nonce CSP (force-dynamic → Next nonces its inline scripts).
export const dynamic = "force-dynamic";

export default async function InvoiceLayout({ children }: { children: React.ReactNode }) {
  // CSP FIX 2026-07-30: force-dynamic alone doesn't make Next apply the nonce to its
  // own inline hydration scripts — reading headers() is what does (see app/crm/layout.tsx).
  await headers();
  return <>{children}</>;
}
