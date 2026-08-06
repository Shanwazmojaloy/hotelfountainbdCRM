import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import FadeIn from "@/components/site/FadeIn";
import RoomsCatalog from "@/components/site/RoomsCatalog";
import JsonLd from "@/components/site/JsonLd";
import { ROOMS } from "@/lib/rooms";

export const metadata: Metadata = {
  title: "Hotel Rooms in Dhaka from ৳4,000 — Hotel Fountain",
  description:
    "Five room categories near Dhaka airport in Nikunja-02 — Fountain Deluxe, Premium Deluxe, Superior Deluxe, Twin Deluxe and the Royal Suite, from ৳4,000/night.",
  alternates: { canonical: "https://fountainbd.com/rooms" },
  openGraph: {
    title: "Rooms & Suites | Hotel Fountain, Dhaka",
    description:
      "Five room categories from BDT 4,000/night — Fountain Deluxe to the Royal Suite. Free breakfast, fibre Wi-Fi and 24/7 room service.",
    url: "https://fountainbd.com/rooms",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/room-royal-suite.webp", width: 1200, height: 630, alt: "Royal Suite at Hotel Fountain, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

// Per-room structured data (HotelRoom + BDT Offer) so search/AI engines can
// surface each room type and its price. Built from the canonical ROOMS catalog.
const roomsListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Rooms & Suites at Hotel Fountain",
  itemListElement: ROOMS.map((r, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "HotelRoom",
      name: r.name,
      url: "https://fountainbd.com/rooms#" + r.slug,
      image: "https://fountainbd.com" + r.image,
      description: r.blurb,
      occupancy: { "@type": "QuantitativeValue", maxValue: r.capacity, unitText: "guests" },
      amenityFeature: r.features.map((f) => ({ "@type": "LocationFeatureSpecification", name: f, value: true })),
      offers: {
        "@type": "Offer",
        price: r.priceBDT,
        priceCurrency: "BDT",
        availability: "https://schema.org/InStock",
        url: "https://fountainbd.com/rooms",
      },
    },
  })),
};

const roomsBreadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "Rooms & Suites", item: "https://fountainbd.com/rooms" },
  ],
};

export default function RoomsPage() {
  return (
    <div className="section pb-28 pt-10">
      <JsonLd data={roomsListSchema} />
      <JsonLd data={roomsBreadcrumb} />
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
        <div className="glass glass-sheen glass-clip flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h3 className="font-display text-xl font-semibold text-white">Not sure which room?</h3>
            <p className="mt-1 text-sm text-white/60">
              Tell us your dates and group size — our front office will recommend the best fit.
            </p>
          </div>
          <Link href="/contact" className="btn-neon shrink-0">
            Talk to Front Office <span className="cta-arrow">→</span>
          </Link>
        </div>
      </FadeIn>
    </div>
  );
}
