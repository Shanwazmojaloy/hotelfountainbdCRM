"use client";

import { useState } from "react";
import { CONTACT } from "@/lib/site";

/**
 * Google Map embed that is non-interactive until tapped — so scrolling the page
 * (especially on mobile) never gets trapped inside the map.
 */
export default function MapEmbed() {
  const [active, setActive] = useState(false);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-xl2">
      <iframe
        src={CONTACT.mapEmbed}
        title="Hotel Fountain location map"
        className={`absolute inset-0 h-full w-full grayscale-[0.2] contrast-110 ${
          active ? "" : "pointer-events-none"
        }`}
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      {!active && (
        <button
          type="button"
          onClick={() => setActive(true)}
          aria-label="Activate interactive map"
          className="absolute inset-0 z-10 flex items-center justify-center bg-abyss/25 transition hover:bg-abyss/10"
        >
          <span className="rounded-full border border-gold/40 bg-abyss/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/90">
            Tap to interact
          </span>
        </button>
      )}
    </div>
  );
}
