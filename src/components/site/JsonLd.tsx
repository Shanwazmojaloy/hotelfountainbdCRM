import { headers } from "next/headers";

// CSP-safe JSON-LD injector for the public site. Reads the per-request nonce
// (set by middleware) so the structured-data <script> satisfies the nonce-based
// Content-Security-Policy — mirrors the Hotel schema pattern in (site)/layout.tsx.
// The site already renders dynamically (nonce), so headers() adds no new cost.
export default async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
