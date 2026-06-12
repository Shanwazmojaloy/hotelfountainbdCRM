// Fire-and-forget helper to open the global reservation modal from anywhere,
// optionally prefilling fields (room type, dates, guests).
export type ReservePrefill = {
  roomType?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
};

export const RESERVE_EVENT = "lumea:reserve";

export function openReservation(prefill: ReservePrefill = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(RESERVE_EVENT, { detail: prefill }));
  }
}
