"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ROOMS } from "@/lib/rooms";
import { waLink } from "@/lib/site";
import { RESERVE_EVENT } from "@/lib/reserve";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Read a cookie value in the browser (used for Meta _fbp/_fbc click attribution).
function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

type Form = {
  name: string;
  phone: string;
  email: string;
  address: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  guests: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  email: "",
  address: "",
  roomType: ROOMS[0]?.name ?? "",
  checkIn: "",
  checkOut: "",
  guests: "2",
};

const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-white/55";

/**
 * Global reservation modal. Opens on the `lumea:reserve` window event
 * (see openReservation()). Posts to /api/book which creates a PENDING / WEBSITE
 * reservation the Lumea CRM bell picks up. Guest sees a confirmation card.
 */
export default function ReservationModal() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Form | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const d = ((e as CustomEvent).detail || {}) as {
        roomType?: string;
        checkIn?: string;
        checkOut?: string;
        guests?: string;
      };
      setForm({
        ...EMPTY,
        roomType: d.roomType || ROOMS[0]?.name || "",
        checkIn: d.checkIn || "",
        checkOut: d.checkOut || "",
        guests: d.guests || "2",
      });
      setError(null);
      setDone(null);
      setOpen(true);
      // Funnel signal: guest opened the booking form.
      window.fbq?.("track", "InitiateCheckout", {
        content_name: d.roomType || ROOMS[0]?.name,
        content_type: "hotel_room",
      });
    }
    window.addEventListener(RESERVE_EVENT, onOpen);
    return () => window.removeEventListener(RESERVE_EVENT, onOpen);
  }, []);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (new Date(form.checkOut) <= new Date(form.checkIn)) {
      setError("Check-out must be after check-in.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fbp: readCookie("_fbp"),
          fbc: readCookie("_fbc"),
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Unexpected response." }));
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not submit your request.");
      // Conversion: booking request submitted. event_id = reservationId dedups with the
      // server-side CAPI Lead fired in /api/book.
      const room = ROOMS.find((r) => r.name === form.roomType);
      const nights = Math.max(
        1,
        Math.round((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86_400_000),
      );
      window.fbq?.(
        "track",
        "Lead",
        {
          value: (room?.priceBDT ?? 4000) * nights,
          currency: "BDT",
          content_name: form.roomType,
          content_type: "hotel_room",
        },
        data.reservationId ? { eventID: data.reservationId } : undefined,
      );
      setDone(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-abyss/85 p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Reserve a room"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="glass glass-sheen my-8 w-full max-w-lg overflow-hidden p-7 sm:p-9"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{done ? "Request Received" : "Reserve Your Stay"}</p>
                <h2 className="mt-2 font-display text-3xl font-medium text-white">
                  {done ? (
                    <>Thank <span className="italic text-neon-teal">You</span></>
                  ) : (
                    <>New <span className="italic text-neon-teal">Reservation</span></>
                  )}
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/70 transition hover:border-neon-teal/40 hover:text-white"
              >
                ✕
              </button>
            </div>

            {done ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-white/70">
                  Your reservation request for the <strong className="text-neon-teal">{done.roomType}</strong> is
                  in. Our front office will confirm availability and contact you shortly to finalise.
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl2 border border-white/10 bg-white/[0.03] p-5 text-sm">
                  <Detail label="Guest" value={done.name} />
                  <Detail label="Guests" value={done.guests} />
                  <Detail label="Room" value={done.roomType} />
                  <Detail label="Contact" value={done.phone} />
                  <Detail label="Check-in" value={done.checkIn} />
                  <Detail label="Check-out" value={done.checkOut} />
                  <Detail label="Email" value={done.email} full />
                  {done.address && <Detail label="Address" value={done.address} full />}
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  <button onClick={() => setOpen(false)} className="btn-neon">
                    Done
                  </button>
                  <a
                    href={waLink(`Hello Hotel Fountain, I just submitted a reservation request for the ${done.roomType} (${done.checkIn} to ${done.checkOut}).`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost"
                  >
                    Message on WhatsApp
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="r-name" className={labelCls}>Full name</label>
                    <input id="r-name" required value={form.name} onChange={set("name")} autoComplete="name" placeholder="Jane Doe" className="field" />
                  </div>
                  <div>
                    <label htmlFor="r-phone" className={labelCls}>Contact number</label>
                    <input id="r-phone" required value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="+880 1XXX-XXXXXX" className="field" />
                  </div>
                </div>

                <div>
                  <label htmlFor="r-email" className={labelCls}>Email</label>
                  <input id="r-email" type="email" required value={form.email} onChange={set("email")} autoComplete="email" placeholder="you@email.com" className="field" />
                </div>

                <div>
                  <label htmlFor="r-address" className={labelCls}>Address <span className="text-white/35">(optional)</span></label>
                  <input id="r-address" value={form.address} onChange={set("address")} autoComplete="street-address" placeholder="City, country" className="field" />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="r-room" className={labelCls}>Room type</label>
                    <select id="r-room" value={form.roomType} onChange={set("roomType")} className="field">
                      {ROOMS.map((r) => (
                        <option key={r.slug} value={r.name}>
                          {r.name} — {r.priceLabel}/night
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="r-guests" className={labelCls}>Guests</label>
                    <select id="r-guests" value={form.guests} onChange={set("guests")} className="field">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{n} {n === 1 ? "Guest" : "Guests"}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="r-in" className={labelCls}>Check-in</label>
                    <input id="r-in" type="date" required value={form.checkIn} onChange={set("checkIn")} className="field [color-scheme:dark]" />
                  </div>
                  <div>
                    <label htmlFor="r-out" className={labelCls}>Check-out</label>
                    <input id="r-out" type="date" required value={form.checkOut} onChange={set("checkOut")} className="field [color-scheme:dark]" />
                  </div>
                </div>

                {error && (
                  <p role="alert" className="rounded-xl border border-[#E05C7A]/30 bg-[#E05C7A]/10 px-4 py-3 text-sm text-[#f3b6c4]">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={submitting} className="btn-neon mt-1 w-full disabled:opacity-60">
                  {submitting ? "Submitting…" : "Confirm Reservation Request →"}
                </button>
                <p className="text-center text-[11px] text-white/40">
                  No payment now — our front office confirms availability and follows up.
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neon-teal/80">{label}</p>
      <p className="mt-0.5 text-white/85">{value || "—"}</p>
    </div>
  );
}
