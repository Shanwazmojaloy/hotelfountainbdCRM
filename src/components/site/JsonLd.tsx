// Shared JSON-LD injector for the public site. `application/ld+json` is a data block, not
// executable JS, so the CSP script-src does NOT gate it — no nonce is required (this is why
// these run fine under the public static CSP without forcing dynamic rendering). Kept as a
// shared component so structured data is emitted consistently across the (site) pages.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
