"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { ROOMS } from "@/lib/rooms";
import { SITE, CONTACT, STATS, AMENITIES, NAV_LINKS } from "@/lib/site";
import { openReservation } from "@/lib/reserve";

/**
 * EditorialLanding — maikasui-inspired asymmetric editorial landing for Hotel
 * Fountain. Deep teal canvas, sprawling serif, hairline divisions, kinetic hero
 * parallax. Self-contained (no cross-module imports) so it resolves as a single
 * client boundary. Layout = Tailwind; type/details in ./editorial.css (.ed).
 */
export default function EditorialLanding() {
  useReveal();
  return (
    <div className="ed relative -mt-24 min-h-screen overflow-x-hidden bg-[#01241f] text-[#f8fafc] selection:bg-teal-400/30">
      <EditorialNav />
      <Hero />
      <RoomsEditorial />
      <Experience />
      <Statement />
      <EditorialFooter />
      <BookingBar />
    </div>
  );
}

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".ed-reveal");
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function EditorialNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 60);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links = NAV_LINKS.filter((l) => l.href !== "/");
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${solid ? "border-b-[0.5px] border-white/10 bg-[#01241f]/70 py-4 backdrop-blur-xl" : "py-7"}`}>
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 sm:px-10">
        <Link href="/" className="ed-serif text-xl tracking-tight text-[#fafaf7]">
          Hotel <span className="italic">Fountain</span>
        </Link>
        <nav className="hidden items-center md:flex">
          {links.map((l, i) => (
            <span key={l.href} className="flex items-center">
              {i > 0 && <span className="mx-5 h-3 w-px bg-white/15" aria-hidden />}
              <Link href={l.href} className="ed-sans ed-ul text-[11px] font-medium uppercase tracking-[0.22em] text-[#f8fafc]/70 transition-colors hover:text-[#f8fafc]">
                {l.label}
              </Link>
            </span>
          ))}
          <span className="mx-5 h-3 w-px bg-white/15" aria-hidden />
          <a href={SITE.crmUrl} className="ed-sans ed-ul text-[11px] font-medium uppercase tracking-[0.22em] text-[#f8fafc]/70 hover:text-[#f8fafc]">Staff</a>
        </nav>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => openReservation()} className="ed-sans hidden border-[0.5px] border-white/15 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f8fafc] transition-colors hover:border-teal-400 hover:text-teal-300 sm:block">
            Book Now
          </button>
          <button type="button" aria-label="Menu" onClick={() => setOpen((v) => !v)} className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] md:hidden">
            <span className="h-px w-5 bg-[#f8fafc]" />
            <span className="h-px w-5 bg-[#f8fafc]" />
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t-[0.5px] border-white/10 bg-[#021a17]/95 px-5 py-4 backdrop-blur-xl md:hidden">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="ed-sans block py-3 text-[12px] uppercase tracking-[0.2em] text-[#f8fafc]/80">
              {l.label}
            </Link>
          ))}
          <a href={SITE.crmUrl} className="ed-sans block py-3 text-[12px] uppercase tracking-[0.2em] text-[#f8fafc]/80">Staff Login</a>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const plateY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -70]);
  const plateScale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.08]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 64]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0.15]);
  return (
    <>
      <section ref={ref} className="relative overflow-hidden pt-32 md:flex md:min-h-[92vh] md:items-center md:pt-0">
        <motion.div style={{ y: copyY, opacity: copyOpacity }} className="relative z-10 mx-auto w-full max-w-[1600px] px-5 sm:px-10">
          <div className="max-w-xl">
            <p className="ed-sans animate__animated animate__fadeInDown mb-8 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.42em] text-teal-300/90">
              <span className="h-px w-10 bg-teal-400" />
              {SITE.location} &middot; {SITE.established}
            </p>
            <h1 style={{ animationDelay: "0.08s" }} className="ed-serif animate__animated animate__fadeInUp text-[clamp(3rem,7.5vw,7rem)] font-medium leading-[0.92] tracking-[-0.02em] text-[#fafaf7]">
              Where every stay
              <span className="mt-1 block italic text-[#f8fafc]/90">becomes a memory</span>
            </h1>
            <div style={{ animationDelay: "0.20s" }} className="animate__animated animate__fadeIn mt-12 h-px w-16 bg-teal-400/60" />
            <p style={{ animationDelay: "0.26s" }} className="ed-sans animate__animated animate__fadeInUp mt-8 max-w-sm text-[15px] leading-[1.85] text-[#f8fafc]/55">{SITE.description}</p>
            <div style={{ animationDelay: "0.34s" }} className="animate__animated animate__fadeInUp mt-12 flex flex-wrap items-center gap-x-10 gap-y-4">
              <button type="button" onClick={() => openReservation()} className="ed-sans bg-teal-500 px-9 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#01241f] transition-colors hover:bg-teal-400">
                Reserve a Stay
              </button>
              <Link href="/rooms" className="ed-sans ed-ul text-[11px] font-medium uppercase tracking-[0.26em] text-[#f8fafc]/80">Explore Rooms &rarr;</Link>
            </div>
          </div>
        </motion.div>
        <motion.div style={{ y: plateY }} className="animate__animated animate__fadeIn relative mx-5 mt-10 h-[54vh] overflow-hidden rounded-3xl sm:mx-10 sm:h-[66vh] md:absolute md:inset-y-0 md:right-0 md:mx-0 md:my-auto md:mt-0 md:h-[85vh] md:w-[53vw] md:rounded-l-[28px] md:rounded-r-none">
          <motion.div style={{ scale: plateScale }} className="absolute inset-0">
            <Image src="/images/hero-exterior.webp" alt="Hotel Fountain entrance" fill priority sizes="(max-width: 768px) 100vw, 53vw" className="ed-kb object-cover" />
          </motion.div>
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10 md:rounded-l-[28px]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-2/5 bg-gradient-to-r from-[#01241f]/75 to-transparent md:block" />
        </motion.div>
        <span className="ed-vert ed-mono absolute right-5 top-1/2 z-10 hidden -translate-y-1/2 rotate-180 text-[10px] uppercase tracking-[0.4em] text-white/45 lg:block">
          Est. 2010 &mdash; Dhaka
        </span>
      </section>
      <section className="px-5 sm:px-10">
        <div className="mx-auto mt-24 grid max-w-[1600px] grid-cols-2 border-t-[0.5px] border-white/10 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className={`ed-reveal border-white/10 px-5 py-8 ${i % 2 === 1 ? "border-l-[0.5px]" : ""} ${i >= 2 ? "border-t-[0.5px]" : ""} md:border-l-[0.5px] md:border-t-0 ${i === 0 ? "md:border-l-0" : ""}`}>
              <p className="ed-serif text-3xl text-[#fafaf7] sm:text-4xl">{s.value}</p>
              <p className="ed-mono mt-3 text-[10px] uppercase tracking-[0.2em] text-[#f8fafc]/45">{s.label}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

const ROOM_LAYOUT = [
  { img: "md:col-span-7 md:col-start-6", txt: "md:col-span-4 md:col-start-1", align: "left", aspect: "aspect-[16/10]", pad: "md:pb-28 md:pt-8" },
  { img: "md:col-span-5 md:col-start-1", txt: "md:col-span-6 md:col-start-7", align: "right", aspect: "aspect-[4/5]", pad: "md:py-28" },
  { img: "md:col-span-6 md:col-start-7", txt: "md:col-span-4 md:col-start-1", align: "left", aspect: "aspect-[3/2]", pad: "md:py-24" },
  { img: "md:col-span-5 md:col-start-1", txt: "md:col-span-5 md:col-start-8", align: "right", aspect: "aspect-[4/5]", pad: "md:py-28" },
  { img: "md:col-span-8 md:col-start-5", txt: "md:col-span-4 md:col-start-1", align: "left", aspect: "aspect-[16/9]", pad: "md:pb-12 md:pt-24" },
];

function RoomsEditorial() {
  return (
    <section className="px-5 py-28 sm:px-10 lg:py-40">
      <div className="mx-auto max-w-[1600px]">
        <div className="ed-reveal mb-20 grid grid-cols-1 items-end gap-6 md:grid-cols-12">
          <div className="md:col-span-6 md:col-start-2">
            <p className="ed-sans mb-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.4em] text-teal-300">
              <span className="h-px w-8 bg-teal-400" /> Accommodations
            </p>
            <h2 className="ed-serif text-[clamp(2.2rem,4.5vw,4rem)] font-medium leading-[1.02] tracking-[-0.01em] text-[#fafaf7]">
              Five ways to <span className="italic">stay.</span>
            </h2>
          </div>
          <div className="md:col-span-3 md:col-start-9 md:text-right">
            <Link href="/rooms" className="ed-sans ed-ul text-[11px] font-medium uppercase tracking-[0.24em] text-[#f8fafc]/70">View all rooms &rarr;</Link>
          </div>
        </div>
        <div>
          {ROOMS.map((r, i) => {
            const L = ROOM_LAYOUT[i % ROOM_LAYOUT.length];
            const right = L.align === "right";
            return (
              <article key={r.slug} className={`ed-reveal grid grid-cols-1 items-start gap-y-8 py-12 md:grid-cols-12 md:gap-x-12 ${L.pad}`}>
                <div className={`relative w-full overflow-hidden ${L.aspect} ${L.img}`}>
                  <Image src={r.image} alt={r.name} fill sizes="(max-width: 768px) 100vw, 55vw" className="object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(.16,1,.3,1)] hover:scale-[1.05]" />
                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                </div>
                <div className={`${L.txt} ${right ? "md:text-right" : ""}`}>
                  <div className={`flex items-center gap-4 border-t-[0.5px] border-white/10 pt-6 ${right ? "md:justify-end" : ""}`}>
                    <span className="ed-mono text-[11px] font-medium uppercase tracking-[0.3em] text-teal-400/80">Room {String(i + 1).padStart(2, "0")}</span>
                    <span className="h-px w-10 bg-teal-400/40" />
                  </div>
                  <h3 className="ed-serif mt-5 text-[clamp(2rem,4vw,3.4rem)] font-medium leading-[0.98] text-[#fafaf7]">{r.name}</h3>
                  <p className={`ed-sans mt-6 max-w-md text-[14.5px] leading-[1.75] text-[#f8fafc]/55 ${right ? "md:ml-auto" : ""}`}>{r.blurb}</p>
                  <div className={`mt-7 flex items-center gap-4 ${right ? "md:justify-end" : ""}`}>
                    <span className="ed-mono text-[11px] uppercase tracking-[0.2em] text-[#f8fafc]/45">{r.capacityLabel}</span>
                    <span className="h-1 w-1 rounded-full bg-white/30" />
                    <span className="ed-mono text-[11px] uppercase tracking-[0.2em] text-teal-300">{r.priceLabel} / night</span>
                  </div>
                  <button type="button" onClick={() => openReservation({ roomType: r.name })} className={`ed-sans ed-ul mt-8 inline-block text-[11px] font-medium uppercase tracking-[0.26em] text-[#f8fafc]/85 ${right ? "md:ml-auto" : ""}`}>
                    Reserve {r.name} &rarr;
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Experience() {
  return (
    <section className="bg-[#021a17] px-5 py-28 sm:px-10 lg:py-40">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-y-14 md:grid-cols-12 md:gap-x-8">
        <div className="ed-reveal md:sticky md:top-32 md:col-span-4 md:col-start-2 md:self-start">
          <p className="ed-sans mb-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.4em] text-teal-300">
            <span className="h-px w-8 bg-teal-400" /> The Experience
          </p>
          <h2 className="ed-serif text-[clamp(2.2rem,4.2vw,3.6rem)] font-medium leading-[1.05] text-[#fafaf7]">
            More than <span className="italic">a stay.</span>
          </h2>
          <p className="ed-sans mt-7 max-w-sm text-[15px] leading-[1.8] text-[#f8fafc]/55">
            Every facility is composed to exceed expectations &mdash; from the rooftop kitchen to the business floor and complimentary airport transfers.
          </p>
        </div>
        <ul className="md:col-span-5 md:col-start-7">
          {AMENITIES.map((a, i) => (
            <li key={a.title} className="ed-reveal grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 border-t-[0.5px] border-white/10 py-9">
              <span className="ed-mono text-[11px] font-medium uppercase tracking-[0.3em] text-teal-400/80">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="ed-serif text-[clamp(1.6rem,2.6vw,2.2rem)] font-medium text-[#fafaf7]">{a.title}</h3>
              <p className="ed-sans col-start-2 max-w-md text-[14px] leading-[1.7] text-[#f8fafc]/50">{a.short}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section className="ed-reveal relative px-5 py-28 sm:px-10 lg:py-40">
      <div className="relative mx-auto max-w-[1600px]">
        <div className="relative aspect-[21/9] w-full overflow-hidden">
          <Image src="/images/rooftop.webp" alt="Hotel Fountain rooftop" fill sizes="100vw" className="ed-kb object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#01241f] via-[#01241f]/30 to-transparent" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
        </div>
        <div className="absolute inset-x-0 bottom-0 px-6 pb-10 md:px-16 md:pb-16">
          <p className="ed-serif max-w-3xl text-[clamp(1.8rem,3.6vw,3.2rem)] font-medium leading-[1.1] text-[#fafaf7]">
            Your stay begins <span className="italic">the moment</span> you arrive.
          </p>
          <button type="button" onClick={() => openReservation()} className="ed-sans mt-8 bg-teal-500 px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#01241f] transition-colors hover:bg-teal-400">
            Begin Your Reservation
          </button>
        </div>
      </div>
    </section>
  );
}

function EditorialFooter() {
  return (
    <footer className="border-t-[0.5px] border-white/10 bg-[#021a17] px-5 pb-32 pt-20 sm:px-10">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-col gap-8 border-b-[0.5px] border-white/10 pb-12 md:flex-row md:items-end md:justify-between">
          <Link href="/" className="ed-serif text-3xl text-[#fafaf7]">Hotel <span className="italic">Fountain</span></Link>
          <nav className="flex flex-wrap gap-x-8 gap-y-3">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="ed-sans ed-ul text-[11px] font-medium uppercase tracking-[0.2em] text-[#f8fafc]/60">{l.label}</Link>
            ))}
            <a href={SITE.crmUrl} className="ed-sans ed-ul text-[11px] font-medium uppercase tracking-[0.2em] text-[#f8fafc]/60">Staff Login</a>
          </nav>
        </div>
        <div className="grid grid-cols-1 gap-10 py-14 md:grid-cols-3">
          <FooterCol k="Address" lines={[CONTACT.address[0], CONTACT.address[1]]} />
          <FooterCol k="Reservations" lines={[CONTACT.phone, CONTACT.email]} hrefs={[CONTACT.phoneHref, CONTACT.emailHref]} />
          <FooterCol k="Front Desk" lines={[CONTACT.frontDesk, `Check-in ${CONTACT.checkIn} / Check-out ${CONTACT.checkOut}`]} />
        </div>
        <div className="flex flex-col gap-2 border-t-[0.5px] border-white/10 pt-8 md:flex-row md:justify-between">
          <span className="ed-mono text-[10px] uppercase tracking-[0.16em] text-[#f8fafc]/40">&copy; {new Date().getFullYear()} {SITE.name}</span>
          <span className="ed-mono text-[10px] uppercase tracking-[0.16em] text-[#f8fafc]/40">{SITE.location} &middot; All Rights Reserved</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ k, lines, hrefs }: { k: string; lines: string[]; hrefs?: string[] }) {
  return (
    <div>
      <p className="ed-mono mb-4 text-[10px] uppercase tracking-[0.2em] text-teal-300">{k}</p>
      {lines.map((l, i) => (
        <p key={i} className="ed-sans mb-1.5 text-[14px] text-[#f8fafc]/55">
          {hrefs && hrefs[i] ? <a href={hrefs[i]} className="ed-ul hover:text-[#f8fafc]">{l}</a> : l}
        </p>
      ))}
    </div>
  );
}

function BookingBar() {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 640);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const room = String(f.get("room") || "Any Room");
    setOpen(false);
    openReservation({
      roomType: room !== "Any Room" ? room : undefined,
      checkIn: String(f.get("checkin") || ""),
      checkOut: String(f.get("checkout") || ""),
      guests: String(f.get("guests") || "2"),
    });
  }
  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-4 transition-all duration-500 ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-24 opacity-0"}`}>
      <div className="mx-auto max-w-3xl border-[0.5px] border-white/12 bg-[#021a17]/80 backdrop-blur-2xl">
        <div className={`overflow-hidden transition-all duration-500 ${open ? "max-h-72 border-b-[0.5px] border-white/10" : "max-h-0"}`}>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
            <Field label="Check-in"><input type="date" name="checkin" required className="ed-bar-input" /></Field>
            <Field label="Check-out"><input type="date" name="checkout" required className="ed-bar-input" /></Field>
            <Field label="Room">
              <select name="room" defaultValue="Any Room" className="ed-bar-input">
                <option>Any Room</option>
                {ROOMS.map((r) => <option key={r.slug}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Guests">
              <select name="guests" defaultValue="2" className="ed-bar-input">
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? "Guest" : "Guests"}</option>)}
              </select>
            </Field>
            <button type="submit" className="ed-sans col-span-2 bg-teal-500 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#01241f] transition-colors hover:bg-teal-400 sm:col-span-4">
              Confirm Availability &rarr;
            </button>
          </form>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-6 py-4">
          <span className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_0_4px_rgba(20,184,166,0.18)]" />
            <span className="ed-sans text-[12px] uppercase tracking-[0.2em] text-[#f8fafc]/85">{CONTACT.frontDesk} Concierge &middot; Reserve</span>
          </span>
          <span className="ed-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">{open ? "Close" : "Check Availability"}</span>
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col bg-[#021a17]">
      <span className="ed-mono px-3 pt-3 text-[9px] uppercase tracking-[0.2em] text-[#f8fafc]/40">{label}</span>
      {children}
    </label>
  );
}
