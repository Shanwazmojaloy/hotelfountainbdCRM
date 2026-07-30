"use client";

import { useEffect, useRef } from "react";

/**
 * CRM/admin Google-fonts loader — NON-RENDER-BLOCKING (2026-07-30).
 *
 * History: this stylesheet used to live in the ROOT layout (public pages paid for it
 * — FCP 3.36s), then was scoped here to CRM/admin only. It was still RENDER-BLOCKING
 * on those pages though: a plain <link rel="stylesheet"> to fonts.googleapis.com
 * serialized a third-party round trip in front of first paint — on a Bangladesh
 * mobile connection that's a large slice of the /crm FCP 2.19s p75.
 *
 * Now: `media="print"` makes the browser download the CSS WITHOUT blocking paint;
 * `rel="preload"` keeps the download at a sane priority; the media flips to "all"
 * the moment it loads. Two flip paths cover the hydration race:
 *   - onLoad handler (load fires after React hydrates),
 *   - useEffect check of link.sheet (load fired BEFORE hydration — onLoad missed).
 * All families are display=swap, so text always paints in fallback fonts first —
 * same visual contract as before, just without the paint block.
 *
 * Mounted at: /crm layout, /billing, /admin/audit, /admin/onboard, /lumea.
 * Playfair Display stays in next/font in the root layout (CLS fix) — do NOT add here.
 */
const HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Roboto:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap";

export default function UiFonts() {
  const ref = useRef<HTMLLinkElement>(null);

  useEffect(() => {
    const l = ref.current;
    // If the CSS finished loading before hydration, the onLoad prop never fired —
    // flip the media type here. `sheet` is non-null once the stylesheet is loaded.
    if (l && l.media !== "all" && l.sheet) l.media = "all";
  }, []);

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="preload" as="style" href={HREF} />
      <link
        ref={ref}
        rel="stylesheet"
        href={HREF}
        media="print"
        onLoad={(e) => {
          e.currentTarget.media = "all";
        }}
      />
    </>
  );
}
