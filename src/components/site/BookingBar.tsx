"use client";

import { openReservation } from "@/lib/reserve";

/**
 * Compact horizontal "glass" booking bar for the hero.
 *
 * Reuses the global reservation flow — on submit it opens the reservation modal
 * prefilled with the chosen dates/guests (room type is picked in the modal).
 * No booking logic of its own; presentation only.
 */
export default function BookingBar({ className = "" }: { className?: string }) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    openReservation({
      checkIn: String(f.get("checkin") || ""),
      checkOut: String(f.get("checkout") || ""),
      guests: String(f.get("guests") || "2"),
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`glass glass-sheen flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-end sm:gap-2 ${className}`}
    >
      <label className="flex flex-1 flex-col gap-1.5 text-left">
        <span className="px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/55">Check-in</span>
        <input type="date" name="checkin" required className="field [color-scheme:dark]" />
      </label>

      <label className="flex flex-1 flex-col gap-1.5 text-left">
        <span className="px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/55">Check-out</span>
        <input type="date" name="checkout" required className="field [color-scheme:dark]" />
      </label>

      <label className="flex flex-col gap-1.5 text-left sm:w-32">
        <span className="px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/55">Guests</span>
        <select name="guests" defaultValue="2" className="field">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "Guest" : "Guests"}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="btn-neon shrink-0 sm:!px-6">
        Check Availability
      </button>
    </form>
  );
}
