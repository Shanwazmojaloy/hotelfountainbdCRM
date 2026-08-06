import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, waLink } from "@/lib/site";
import GlassCard from "@/components/site/GlassCard";
import FadeIn from "@/components/site/FadeIn";
import JsonLd from "@/components/site/JsonLd";

// SEO (2026-08-07): dedicated landing page for the "hotel near Dhaka airport"
// intent family — GSC showed 100% of impressions were brand-name queries, so this
// page is the site's first non-branded reach play. Facts mirror src/lib/site.ts
// and the /faq page — never let them diverge (AEO hard requirement).

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "Hotel Near Dhaka Airport", item: "https://fountainbd.com/airport-hotel-dhaka" },
  ],
};

export const metadata: Metadata = {
  title: "Hotel Near Dhaka Airport (DAC) — Hotel Fountain, Nikunja",
  description:
    "Boutique hotel 8 minutes from Hazrat Shahjalal International Airport. 24/7 front desk for late arrivals, airport pickup, rooms from ৳4,000/night. Book direct.",
  alternates: { canonical: "https://fountainbd.com/airport-hotel-dhaka" },
  openGraph: {
    title: "Hotel Near Dhaka Airport — 8 Minutes from DAC | Hotel Fountain",
    description:
      "Boutique comfort on Dhaka's airport corridor: 8-minute drive from Hazrat Shahjalal International Airport, 24/7 front desk, airport transfer, rooms from ৳4,000/night.",
    url: "https://fountainbd.com/airport-hotel-dhaka",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/hero-exterior.webp", width: 1200, height: 630, alt: "Hotel Fountain exterior, Nikunja-02, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

// Airport-specific questions only — the general FAQ lives at /faq. Keeping the
// sets disjoint avoids two pages competing with identical FAQPage schema.
const FAQS: { q: string; a: string }[] = [
  {
    q: "How far is Hotel Fountain from Dhaka airport?",
    a: "Hotel Fountain is about an 8-minute drive from Hazrat Shahjalal International Airport (DAC), in the quiet Nikunja-02 neighbourhood just off the airport corridor at House-05, Road-02, Nikunja-02, Dhaka 1229.",
  },
  {
    q: "Does the hotel provide airport pickup?",
    a: "Complimentary airport pickup and drop-off is available for suite guests, and the 24/7 front desk can arrange paid transfers for all other guests — call " + CONTACT.phone + " or message on WhatsApp with your flight details.",
  },
  {
    q: "Can I check in late at night after my flight?",
    a: "Yes. The front desk is staffed 24/7, so arrivals from late-night or delayed flights are always received. Standard check-in is 12:00 PM, and early check-in can be arranged on request, subject to availability.",
  },
  {
    q: "How much does a room near Dhaka airport cost at Hotel Fountain?",
    a: "Rooms start at ৳4,000 per night for the Fountain Deluxe and range up to ৳9,000 for the Royal Suite. All rates are in Bangladeshi Taka (BDT) and include fibre Wi-Fi; breakfast is included from the Premium Deluxe category up.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const FACTS = [
  { k: "8 min", v: "Drive from Hazrat Shahjalal International Airport (DAC)" },
  { k: "24/7", v: "Front desk — late-night and delayed-flight arrivals welcome" },
  { k: "৳4,000", v: "Rooms from ৳4,000/night, Royal Suite ৳9,000" },
  { k: "Pickup", v: "Airport transfer — complimentary for suite guests" },
] as const;

export default function AirportHotelPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumb} />

      {/* ───────────────── PAGE HEADER ───────────────── */}
      <section className="section pb-12 pt-10">
        <FadeIn className="mx-auto max-w-2xl text-center" whileInView={false}>
          <p className="eyebrow">Airport Corridor · Nikunja-02</p>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            Hotel Near <span className="italic text-neon-teal">Dhaka Airport</span>
          </h1>
          {/* AEO: direct, self-contained answer an assistant can lift verbatim. */}
          <p className="mt-5 text-base leading-relaxed text-white/60">
            Hotel Fountain is a boutique hotel an 8-minute drive from Hazrat Shahjalal International
            Airport (DAC), in the quiet Nikunja-02 neighbourhood of Dhaka. With a 24/7 front desk,
            airport transfers and rooms from ৳4,000 a night, it&apos;s built for early flights, late
            arrivals and business layovers.
          </p>
        </FadeIn>
      </section>

      {/* ───────────────── FACT GRID ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
          {FACTS.map((f, i) => (
            <FadeIn key={f.k} delay={i * 0.05}>
              <GlassCard className="h-full p-6 text-center">
                <p className="font-display text-3xl font-medium text-neon-teal">{f.k}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{f.v}</p>
              </GlassCard>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ───────────────── WHY TRANSIT GUESTS STAY HERE ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">
              Made for flights in and out of DAC
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/70">
              <p>
                Nikunja-02 sits just off the airport corridor — close enough that a delayed landing
                still gets you to bed in minutes, far enough into a residential block that you sleep
                without runway noise. The front desk runs 24/7, so there is always someone to receive
                a 3 AM arrival, hold luggage between flights, or wake you for a dawn departure.
              </p>
              <p>
                Every room has fibre Wi-Fi for the work you promised to finish mid-transit, and the
                rooftop restaurant serves from 7:00 AM to 11:00 PM with round-the-clock in-room
                dining. Suite guests get complimentary airport pickup and drop-off; the desk can
                arrange transfers for everyone else — just share your flight details when booking.
              </p>
              <p>
                Browse the{" "}
                <Link href="/rooms" className="text-neon-teal transition hover:text-white">
                  five room categories from ৳4,000/night
                </Link>{" "}
                or see{" "}
                <Link href="/services" className="text-neon-teal transition hover:text-white">
                  all services and amenities
                </Link>
                . On a layover rather than an overnight? Day-use rooms are covered on the{" "}
                <Link href="/transit-hotel-dhaka" className="text-neon-teal transition hover:text-white">
                  transit hotel page
                </Link>{" "}
                and in our{" "}
                <Link href="/guides/dhaka-layover" className="text-neon-teal transition hover:text-white">
                  Dhaka layover guide
                </Link>
                .
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ───────────────── AIRPORT FAQ ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">Airport stay questions</h2>
            <dl className="mt-4">
              {FAQS.map((f, i) => (
                <FadeIn key={f.q} delay={i * 0.04}>
                  <div className="border-t border-white/8 py-6 first:border-t-0 first:pt-2">
                    <dt className="font-display text-lg font-semibold text-white">{f.q}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-white/70">{f.a}</dd>
                  </div>
                </FadeIn>
              ))}
            </dl>
          </GlassCard>

          <FadeIn>
            <p className="mt-8 text-center text-sm text-white/50">
              Landing soon?{" "}
              <a href={CONTACT.phoneHref} className="text-neon-teal transition hover:text-white">
                Call {CONTACT.phone}
              </a>{" "}
              or{" "}
              <a
                href={waLink("Hi! I'm arriving at Dhaka airport and would like to book a room at Hotel Fountain.")}
                className="text-neon-teal transition hover:text-white"
                target="_blank"
                rel="noopener noreferrer"
              >
                message us on WhatsApp
              </a>{" "}
              with your flight details.
            </p>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
