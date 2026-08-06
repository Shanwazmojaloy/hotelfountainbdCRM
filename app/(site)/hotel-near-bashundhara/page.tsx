import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, waLink } from "@/lib/site";
import GlassCard from "@/components/site/GlassCard";
import FadeIn from "@/components/site/FadeIn";
import JsonLd from "@/components/site/JsonLd";

// SEO batch 2 (2026-08-07, owner-approved): Bashundhara / 300 Feet / ICCB intent.
// Drive times owner-confirmed 2026-08-07: Bashundhara R/A ~10 min, 300 Feet
// (Purbachal Expressway) ~10–15 min, via the Kuril interchange. FAQ set disjoint
// from /airport-hotel-dhaka and /transit-hotel-dhaka.

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "Hotel Near Bashundhara", item: "https://fountainbd.com/hotel-near-bashundhara" },
  ],
};

export const metadata: Metadata = {
  title: "Hotel Near Bashundhara & 300 Feet Road — Hotel Fountain",
  description:
    "Boutique hotel ~10 minutes from Bashundhara R/A, ICCB and Jamuna Future Park via the Kuril interchange. Rooms from ৳4,000/night, free breakfast tiers and fibre Wi-Fi.",
  alternates: { canonical: "https://fountainbd.com/hotel-near-bashundhara" },
  openGraph: {
    title: "Hotel Near Bashundhara R/A, ICCB & 300 Feet | Hotel Fountain",
    description:
      "Staying for a trade fair at ICCB, business in Bashundhara or a day at Jamuna Future Park? Hotel Fountain is ~10 minutes away via Kuril, from ৳4,000/night.",
    url: "https://fountainbd.com/hotel-near-bashundhara",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/hero-exterior.webp", width: 1200, height: 630, alt: "Hotel Fountain exterior, Nikunja-02, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "How far is Hotel Fountain from Bashundhara Residential Area?",
    a: "About a 10-minute drive via the Kuril interchange in normal traffic. The hotel is in Nikunja-02, on the airport side of Kuril — close enough for daily business in Bashundhara while staying on a quieter street.",
  },
  {
    q: "Is Hotel Fountain convenient for events at ICCB (International Convention City Bashundhara)?",
    a: "Yes — ICCB sits by the Kuril interchange, roughly 10 minutes from the hotel, making it a practical base for trade fairs, exhibitions and conventions. The front desk can arrange drop-off before event hours.",
  },
  {
    q: "How close is the 300 Feet (Purbachal Expressway) area?",
    a: "The 300 Feet expressway begins near Kuril, about 10–15 minutes' drive from the hotel depending on traffic.",
  },
  {
    q: "How far is Jamuna Future Park from the hotel?",
    a: "Jamuna Future Park — one of South Asia's largest shopping malls — is around 10–15 minutes away by car via Pragati Sarani, an easy afternoon outing from the hotel.",
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

const NEARBY = [
  { k: "~10 min", v: "Bashundhara R/A main gate via Kuril interchange" },
  { k: "~10 min", v: "ICCB — trade fairs, exhibitions & conventions" },
  { k: "10–15 min", v: "300 Feet (Purbachal Expressway) & Jamuna Future Park" },
  { k: "8 min", v: "Hazrat Shahjalal International Airport (DAC)" },
] as const;

export default function BashundharaHotelPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumb} />

      {/* ───────────────── PAGE HEADER ───────────────── */}
      <section className="section pb-12 pt-10">
        <FadeIn className="mx-auto max-w-2xl text-center" whileInView={false}>
          <p className="eyebrow">Kuril · Bashundhara · 300 Feet</p>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            Hotel Near <span className="italic text-neon-teal">Bashundhara</span>
          </h1>
          {/* AEO: direct, liftable answer. */}
          <p className="mt-5 text-base leading-relaxed text-white/60">
            Hotel Fountain in Nikunja-02 is about a 10-minute drive from Bashundhara Residential
            Area and ICCB, and 10–15 minutes from the 300 Feet Purbachal Expressway and Jamuna
            Future Park — a quiet boutique base for business trips, trade fairs and shopping
            weekends, from ৳4,000 a night.
          </p>
        </FadeIn>
      </section>

      {/* ───────────────── DISTANCE GRID ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
          {NEARBY.map((f, i) => (
            <FadeIn key={f.v} delay={i * 0.05}>
              <GlassCard className="h-full p-6 text-center">
                <p className="font-display text-3xl font-medium text-neon-teal">{f.k}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{f.v}</p>
              </GlassCard>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ───────────────── WHY STAY THIS SIDE OF KURIL ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">
              The quiet side of the Kuril interchange
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/70">
              <p>
                Staying inside Bashundhara puts you in the middle of its daytime bustle; staying in
                Nikunja-02 puts you ten minutes away on a calm residential street — with the airport
                just eight minutes in the other direction. For ICCB exhibition weeks, corporate
                visits to Bashundhara offices, or a shopping day at Jamuna Future Park, the Kuril
                interchange connects you to all of it.
              </p>
              <p>
                Rooms include fibre Wi-Fi and breakfast from the Premium Deluxe tier up, with the
                rooftop restaurant serving until 11 PM. Browse the{" "}
                <Link href="/rooms" className="text-neon-teal transition hover:text-white">
                  five room categories from ৳4,000/night
                </Link>{" "}
                or ask about{" "}
                <Link href="/services" className="text-neon-teal transition hover:text-white">
                  business and event services
                </Link>
                .
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ───────────────── LOCATION FAQ ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">Location questions</h2>
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
              In town for an ICCB event?{" "}
              <a href={CONTACT.phoneHref} className="text-neon-teal transition hover:text-white">
                Call {CONTACT.phone}
              </a>{" "}
              or{" "}
              <a
                href={waLink("Hi! I'm attending an event near Bashundhara/ICCB — do you have rooms available?")}
                className="text-neon-teal transition hover:text-white"
                target="_blank"
                rel="noopener noreferrer"
              >
                message us on WhatsApp
              </a>{" "}
              for group and event-week rates.
            </p>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
