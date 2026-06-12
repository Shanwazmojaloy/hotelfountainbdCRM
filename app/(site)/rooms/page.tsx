import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ScrollReveal from "@/components/site/ScrollReveal";
import SectionHeading from "@/components/site/SectionHeading";
import RoomsCatalog from "@/components/site/RoomsCatalog";

export const metadata: Metadata = {
  title: "Rooms & Suites — Hotel Fountain",
  description:
    "Browse Hotel Fountain's curated collection — Fountain Deluxe, Premium Deluxe, Superior Deluxe, Twin Deluxe and the Royal Suite, from ৳4,000/night.",
};

export default function RoomsPage() {
  return (
    <section className="section py-12">
      <ScrollReveal>
        <SectionHeading
          eyebrow="Accommodations"
          title={<>Our <em>Rooms</em> &amp; Suites</>}
          intro="Every room is designed with meticulous attention to comfort and elegance. Filter by type and find the stay that fits you."
        />
      </ScrollReveal>

      <Suspense fallback={<div className="mt-10 h-96" />}>
        <RoomsCatalog />
      </Suspense>

      <ScrollReveal>
        <div className="mt-14 glass glass-sheen flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
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
      </ScrollReveal>
    </section>
  );
}
