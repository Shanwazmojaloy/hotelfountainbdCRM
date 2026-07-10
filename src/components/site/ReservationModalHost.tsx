"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { RESERVE_EVENT, type ReservePrefill } from "@/lib/reserve";

// PERF: the reservation modal (300+ lines + form logic) used to be eagerly
// mounted and hydrated on every public page while closed. This host renders
// NOTHING until the first `lumea:reserve` event, then dynamic-imports the
// modal chunk and replays the captured prefill so the first click still opens
// it with the chosen dates/room. Subsequent events are handled by the modal's
// own listener as before.
const ReservationModal = dynamic(() => import("./ReservationModal"), { ssr: false });

export default function ReservationModalHost() {
  const [prefill, setPrefill] = useState<ReservePrefill | null>(null);

  useEffect(() => {
    if (prefill !== null) return;
    const arm = (e: Event) => {
      setPrefill(((e as CustomEvent).detail ?? {}) as ReservePrefill);
    };
    window.addEventListener(RESERVE_EVENT, arm);
    return () => window.removeEventListener(RESERVE_EVENT, arm);
  }, [prefill]);

  if (prefill === null) return null;
  return <ReservationModal initialPrefill={prefill} />;
}
