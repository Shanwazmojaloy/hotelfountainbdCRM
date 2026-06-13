"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NAV_LINKS, SITE } from "@/lib/site";
import { openReservation } from "@/lib/reserve";

/**
 * Floating, sticky glassmorphic navbar. Hidden on "/" (the editorial landing
 * ships its own chrome); shown on every other (site) route.
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

  useEffect(() => setOpen(false), [pathname]);

  if (pathname === "/") return null;

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="section pt-4">
        <motion.nav
          initial={false}
          animate={{ paddingTop: scrolled ? 10 : 14, paddingBottom: scrolled ? 10 : 14 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="glass-nav flex items-center justify-between rounded-full px-4 sm:px-6"
        >
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

          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href} className="relative">
                  <Link
                    href={link.href}
                    className={`relative rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.15em] transition-colors ${
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
            <button
              aria-label="Toggle menu"
              onClick={() => setOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white md:hidden"
            >
              <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
            </button>
          </div>
        </motion.nav>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="section md:hidden"
          >
            <div className="glass glass-sheen mt-3 flex flex-col gap-1 p-3">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                      active ? "bg-neon-teal/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <a
                href={SITE.crmUrl}
                className="rounded-xl px-4 py-3 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white"
              >
                Staff Login
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
