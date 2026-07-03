"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NAV_LINKS, SITE, CONTACT } from "@/lib/site";
import { openReservation } from "@/lib/reserve";

// Understated luxury ease-out (matches --ease-regent in globals.css).
const REGENT_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Floating, sticky glassmorphic navbar (Gilded Threshold theme).
 * - Routing links with an animated active indicator.
 * - Condenses + deepens its frost on scroll.
 * - Full-screen right-slide drawer on mobile with staggered serif links.
 */
export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // Lock body scroll + close on Escape while the full-screen menu is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="section pt-4">
        <motion.nav
          initial={false}
          animate={{ paddingTop: scrolled ? 10 : 14, paddingBottom: scrolled ? 10 : 14 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="glass-nav flex items-center justify-between rounded-full px-4 sm:px-6"
        >
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo/logo-white.png"
              alt="Hotel Fountain"
              width={34}
              height={34}
              className="h-8 w-8 object-contain"
            />
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              Hotel <span className="italic text-neon-teal">Fountain</span>
            </span>
          </Link>

          {/* Desktop links */}
          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href} className="relative">
                  <Link
                    href={link.href}
                    className={`nav-underline relative rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.15em] transition-colors ${
                      active ? "text-white" : "text-white/65 hover:text-white"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 -z-10 rounded-full border border-neon-teal/30 bg-neon-teal/10"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2">
            <a
              href={SITE.crmUrl}
              className="hidden rounded-full border border-white/15 px-4 py-2 text-xs font-medium uppercase tracking-[0.15em] text-white/80 transition hover:border-neon-teal/40 hover:text-white sm:inline-block"
            >
              Staff Login
            </a>
            <button type="button" onClick={() => openReservation()} className="btn-neon !px-5 !py-2.5">
              Book Now
            </button>
            {/* Mobile toggle */}
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-neon-teal/40 md:hidden"
            >
              <span className="flex flex-col items-center justify-center gap-[5px]">
                <span className="block h-px w-5 bg-current" />
                <span className="block h-px w-5 bg-current" />
              </span>
            </button>
          </div>
        </motion.nav>
      </div>

      {/* Full-screen mobile menu — slides from the right */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: REGENT_EASE }}
            className="fixed inset-0 z-[60] md:hidden"
          >
            {/* Backdrop */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-abyss/70 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.55, ease: REGENT_EASE }}
              className="glass-nav absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto rounded-l-3xl px-7 pb-10 pt-6"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-semibold tracking-tight text-white">
                  Hotel <span className="italic text-neon-teal">Fountain</span>
                </span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-neon-teal/40"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M1 1l14 14M15 1L1 15" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Links — staggered serif reveal */}
              <nav className="mt-12 flex flex-col">
                {NAV_LINKS.map((link, i) => {
                  const active = pathname === link.href;
                  return (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, x: 28 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, ease: REGENT_EASE, delay: 0.12 + i * 0.07 }}
                    >
                      <Link
                        href={link.href}
                        className={`block border-b border-white/5 py-4 font-display text-3xl tracking-tight transition-colors ${
                          active ? "text-neon-teal" : "text-white/85 hover:text-white"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: REGENT_EASE, delay: 0.12 + NAV_LINKS.length * 0.07 }}
                className="mt-10 flex flex-col gap-3"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openReservation();
                  }}
                  className="btn-neon w-full"
                >
                  Book Now
                </button>
                <a href={SITE.crmUrl} className="btn-ghost w-full">
                  Staff Login
                </a>
              </motion.div>

              {/* Contact footer */}
              <div className="mt-auto pt-10 text-xs leading-relaxed text-white/45">
                <p className="text-[10px] uppercase tracking-[0.25em] text-neon-teal/70">Get in touch</p>
                <a href={CONTACT.phoneHref} className="mt-3 block transition hover:text-white">
                  Front Office: {CONTACT.phone}
                </a>
                <a href={CONTACT.salesPhoneHref} className="mt-1 block transition hover:text-white">
                  Sales &amp; Marketing: {CONTACT.salesPhone}
                </a>
                <a href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer" className="mt-1 block transition hover:text-white">
                  WhatsApp: {CONTACT.whatsappLabel}
                </a>
                <a href={CONTACT.emailHref} className="mt-1 block transition hover:text-white">
                  {CONTACT.email}
                </a>
                <p className="mt-3">{CONTACT.address.join(", ")}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
