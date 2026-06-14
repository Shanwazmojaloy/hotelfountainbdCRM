import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import FadeIn from "@/components/site/FadeIn";
import RoomsCatalog from "@/components/site/RoomsCatalog";

export const metadata: Metadata = {
  title: "Rooms & Suites — Hotel Fountain",
  description:
    "Browse Hotel Fountain's curated collection — Fountain Deluxe, Premium Deluxe, Superior Deluxe, Twin Deluxe and the Royal Suite, from ৳4,000/night.",
};

export default function RoomsPage() {
  return (
    <div className="section pb-28 pt-10">
      {/* ───────────────── PAGE HEADER ───────────────── */}
      <FadeIn className="max-w-2xl" whileInView={false}>
        <p className="eyebrow">Accommodations</p>
        <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
          Our <span className="italic text-neon-teal">Rooms</span> &amp; Suites
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
          Every room is designed with meticulous attention to comfort and elegance — from the
          Fountain Deluxe to the Royal Suite. Filter by type and find the stay that fits you.
        </p>
        <p className="mt-6 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.25em] text-white/45">
          <span className="h-px w-8 bg-gold/60" />
          28 Rooms · From ৳4,000 / night
        </p>
      </FadeIn>

      {/* ───────────────── CATALOG (filters + grid) ───────────────── */}
      <Suspense fallback={<div className="mt-10 h-96" />}>
        <RoomsCatalog />
      </Suspense>

      {/* ───────────────── FRONT-OFFICE CTA ───────────────── */}
      <FadeIn direction="up" className="mt-20">
        <div className="glass glass-sheen flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h3 className="font-display text-xl font-semibold text-white">Not sure which room?</h3>
            <p className="mt-1 text-sm text-white/60">
              Tell us your dates and group size — our front office will recommend the best fit.
            </p>
          </div>
          <Link href="/contact" className="btn-neon shrink-0">
            Talk to Front Office →
          </Link>
        </div>
      </FadeIn>
    </div>
  );
}
