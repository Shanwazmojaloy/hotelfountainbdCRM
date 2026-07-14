import type { Metadata } from "next";

// The Lumea CRM entry is staff-only and must stay out of search. The page is a
// client component (cannot export metadata), so this server layout carries the
// authoritative noindex directive alongside the robots.txt disallow.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LumeaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
