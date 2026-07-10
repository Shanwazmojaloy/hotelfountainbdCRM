/**
 * CRM/admin Google-fonts loader.
 *
 * PERF: this stylesheet used to live in the ROOT layout, so the public marketing
 * pages paid a render-blocking fonts.googleapis.com round-trip for families they
 * never use (FCP 3.36s / route "/" 4s on mobile). It is now mounted ONLY where
 * these families are actually referenced:
 *   - /crm/* layout          (DM Sans + Roboto = iv tokens; Reports PRINT_CSS)
 *   - /billing               (CRM-styled page outside /crm)
 *   - /admin/audit, /admin/onboard, /lumea (IBM Plex Mono + Libre Baskerville)
 *
 * React 19 hoists the `precedence` stylesheet into <head> and dedupes it, so
 * mounting this in several places costs one request. Playfair Display was moved
 * to next/font in the root layout (CLS fix) and must NOT be re-added here.
 */
export default function UiFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Roboto:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap"
      />
    </>
  );
}
