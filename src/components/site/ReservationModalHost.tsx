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

  // INP FIX (2026-07-30, field-data driven): real-user event timing showed the
  // Book button (#hf-btn) at 488-816ms INP — the first tap paid the modal
  // chunk's NETWORK fetch + parse inside the interaction. Warm the module in
  // idle time (module cache only — nothing renders/hydrates until the event),
  // so the first tap mounts from cache instead of the network. Keep the lazy
  // dynamic() mount itself — do NOT revert to eager mounting (LCP regression).
  useEffect(() => {
    const warm = () => { import("./ReservationModal").catch(() => {}); };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 2500);
  }, []);

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
