"use client";

import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";

const TERMS = [
  "Reservations are confirmed on receipt of valid identification at check-in. Standard check-in is 12:00 PM and check-out is 12:00 PM.",
  "Rates are quoted in Bangladeshi Taka (৳) and are subject to applicable government VAT and service charges.",
  "Cancellations should be made at least 24 hours before the check-in date to avoid a one-night charge.",
  "Guests are responsible for any damage to hotel property during their stay.",
  "The hotel reserves the right to refuse service in line with its house policies and local law.",
];

export default function TermsAccordion() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="font-display text-base font-semibold text-white">Read Full Terms</span>
        <m.span animate={{ rotate: open ? 180 : 0 }} className="text-neon-teal">
          ▼
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <p className="mt-4 text-sm text-white/60">
              By making a reservation at Hotel Fountain, you agree to the following terms and
              conditions. Please read carefully before booking.
            </p>
            <ul className="mt-4 space-y-3">
              {TERMS.map((t, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-white/65">
                  <span className="mt-0.5 font-mono text-neon-teal">{String(i + 1).padStart(2, "0")}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
