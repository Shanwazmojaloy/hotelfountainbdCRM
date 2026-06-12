"use client";

import { openReservation } from "@/lib/reserve";

/**
 * Persistent gold "Book Now" floating action button → opens the reservation modal.
 * Always reachable so the booking path is never lost on scroll.
 */
export default function BookNowFab() {
  return (
    <button
      type="button"
      onClick={() => openReservation()}
      aria-label="Book now"
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#1a1407] shadow-[0_12px_34px_-10px_rgba(200,169,110,0.65)] transition-transform duration-300 ease-fluid hover:-translate-y-0.5"
      style={{ background: "linear-gradient(120deg,#c8a96e,#e4cfa0)" }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
        <path d="M7 4h10a2 2 0 0 1 2 2v14l-7-3-7 3V6a2 2 0 0 1 2-2Zm0 2v11.1l5-2.14 5 2.14V6H7Z" />
      </svg>
      <span>Book Now</span>
    </button>
  );
}
