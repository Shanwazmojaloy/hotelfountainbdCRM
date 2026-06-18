"use client";

import { openReservation } from "@/lib/reserve";

/** Client button that opens the reservation modal — usable inside server components. */
export default function BookNowButton({
  className = "btn-neon",
  label = "Book Now",
  roomType,
}: {
  className?: string;
  label?: string;
  roomType?: string;
}) {
  return (
    <button type="button" onClick={() => openReservation(roomType ? { roomType } : {})} className={className}>
      {label}
    </button>
  );
}
