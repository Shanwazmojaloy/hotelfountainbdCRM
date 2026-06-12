"use client";

import { ROOMS } from "@/lib/rooms";
import { openReservation } from "@/lib/reserve";

/**
 * Check Availability widget. On submit it opens the reservation modal prefilled
 * with the chosen room/dates/guests so the guest can finish their request.
 */
export default function AvailabilityWidget() {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const room = String(f.get("room") || "Any Room");
    openReservation({
      roomType: room !== "Any Room" ? room : undefined,
      checkIn: String(f.get("checkin") || ""),
      checkOut: String(f.get("checkout") || ""),
      guests: String(f.get("guests") || "2"),
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-xs font-medium uppercase tracking-wide text-white/55">Check-In</span>
        <input type="date" name="checkin" required className="field [color-scheme:dark]" />
      </label>

      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-xs font-medium uppercase tracking-wide text-white/55">Check-Out</span>
        <input type="date" name="checkout" required className="field [color-scheme:dark]" />
      </label>

      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-xs font-medium uppercase tracking-wide text-white/55">Room Type</span>
        <select name="room" defaultValue="Any Room" className="field">
          <option>Any Room</option>
          {ROOMS.map((r) => (
            <option key={r.slug}>{r.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-left">
        <span className="text-xs font-medium uppercase tracking-wide text-white/55">Guests</span>
        <select name="guests" defaultValue="2" className="field">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "Guest" : "Guests"}
            </option>
          ))}
        </select>
      </label>

      <div className="sm:col-span-2 lg:col-span-4">
        <button type="submit" className="btn-neon w-full sm:w-auto">
          Check Availability →
        </button>
      </div>
    </form>
  );
}
