// Fire-and-forget helper to open the global reservation modal from anywhere,
// optionally prefilling fields (room type, dates, guests).
import { gaEvent } from "./ga";

export type ReservePrefill = {
  roomType?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
};

export const RESERVE_EVENT = "lumea:reserve";

export function openReservation(prefill: ReservePrefill = {}) {
  if (typeof window !== "undefined") {
    // Funnel signal: every Book Now CTA site-wide funnels through this one
    // function, so this is the single hook for the top-of-funnel event. The
    // modal's own lazy-mount replay re-dispatches RESERVE_EVENT directly (not
    // via this function), so first clicks are never double-counted.
    gaEvent("book_now_click", prefill.roomType ? { room_type: prefill.roomType } : undefined);
    window.dispatchEvent(new CustomEvent(RESERVE_EVENT, { detail: prefill }));
  }
}
