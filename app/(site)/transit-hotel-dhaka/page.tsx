import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, waLink } from "@/lib/site";
import GlassCard from "@/components/site/GlassCard";
import FadeIn from "@/components/site/FadeIn";
import JsonLd from "@/components/site/JsonLd";

// SEO batch 2 (2026-08-07, owner-approved): "transit / day-use / layover" intent.
// DISJOINT from /airport-hotel-dhaka (proximity + overnight) — keep FAQ sets and
// keywords separate so the pages never compete. Day-use stays CONFIRMED by owner
// 2026-08-07 (rate on request — never state a fixed day rate here).

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "Transit & Day-Use Hotel", item: "https://fountainbd.com/transit-hotel-dhaka" },
  ],
};

export const metadata: Metadata = {
  title: "Transit & Day-Use Hotel in Dhaka — Hotel Fountain",
  description:
    "Layover in Dhaka? Day-use rooms and short transit stays 8 minutes from the airport — 24/7 desk, luggage hold, hot shower and a real bed between flights. Rates on request.",
  alternates: { canonical: "https://fountainbd.com/transit-hotel-dhaka" },
  openGraph: {
    title: "Transit & Day-Use Hotel in Dhaka — Rest Between Flights | Hotel Fountain",
    description:
      "Day-use rooms and short layover stays minutes from Dhaka airport: 24/7 front desk, luggage hold, fibre Wi-Fi and in-room dining. Call for day rates.",
    url: "https://fountainbd.com/transit-hotel-dhaka",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/hero-exterior.webp", width: 1200, height: 630, alt: "Hotel Fountain exterior, Nikunja-02, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "Does Hotel Fountain offer day-use rooms in Dhaka?",
    a: "Yes. Day-use stays — checking in and out on the same day to rest between flights or meetings — are available. Day rates are quoted on request: call the 24/7 front desk at " + CONTACT.phone + " or message on WhatsApp with your timing.",
  },
  {
    q: "Is a Dhaka layover long enough to leave the airport and rest at a hotel?",
    a: "Usually yes from about 5–6 hours. Hotel Fountain is an 8-minute drive from Hazrat Shahjalal International Airport, so even with immigration and check-in you can realistically get several hours of sleep, a hot shower and a meal before returning for your next flight. Always confirm your own visa/transit eligibility for leaving the airport, as rules depend on nationality.",
  },
  {
    q: "Can the hotel store luggage during a transit stay?",
    a: "Yes — the 24/7 front desk can hold luggage before check-in and after check-out, so you can rest or head out unencumbered between flights.",
  },
  {
    q: "What is included in a transit or day-use stay?",
    a: "The same rooms as overnight guests: fibre Wi-Fi, air conditioning, hot shower and round-the-clock in-room dining, with the rooftop restaurant open 7:00 AM to 11:00 PM. Airport pickup and drop-off can be arranged through the front desk.",
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

const STEPS = [
  { k: "1", v: "Land at DAC — clear immigration and message the desk on WhatsApp" },
  { k: "2", v: "8-minute ride to Nikunja-02 — pickup can be arranged" },
  { k: "3", v: "Sleep, shower, eat — luggage held, wake-up call set" },
  { k: "4", v: "Back at the terminal rested, hours before boarding" },
] as const;

export default function TransitHotelPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumb} />

      {/* ───────────────── PAGE HEADER ───────────────── */}
      <section className="section pb-12 pt-10">
        <FadeIn className="mx-auto max-w-2xl text-center" whileInView={false}>
          <p className="eyebrow">Layovers · Day-Use · Short Stays</p>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            Transit Hotel in <span className="italic text-neon-teal">Dhaka</span>
          </h1>
          {/* AEO: direct, liftable answer. */}
          <p className="mt-5 text-base leading-relaxed text-white/60">
            Hotel Fountain offers day-use rooms and short transit stays an 8-minute drive from
            Hazrat Shahjalal International Airport. A real bed, hot shower and luggage hold between
            flights — with a 24/7 front desk that receives arrivals at any hour. Day rates on
            request.
          </p>
        </FadeIn>
      </section>

      {/* ───────────────── HOW A LAYOVER STAY WORKS ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <FadeIn key={s.k} delay={i * 0.05}>
              <GlassCard className="h-full p-6 text-center">
                <p className="font-display text-3xl font-medium text-neon-teal">{s.k}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{s.v}</p>
              </GlassCard>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ───────────────── WHY REST HERE ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">
              Better than an airport bench
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/70">
              <p>
                Long layovers pass slowly in a terminal. Ten minutes away in quiet, residential
                Nikunja-02 you can sleep properly, shower, and eat something that didn&apos;t come
                from a vending machine — then walk back into departures rested. The front desk runs
                24/7, so a 2 AM arrival or a 6 AM day-use check-in is entirely normal here.
              </p>
              <p>
                Planning what to do with your hours? See our{" "}
                <Link href="/guides/dhaka-layover" className="text-neon-teal transition hover:text-white">
                  Dhaka layover guide
                </Link>{" "}
                — and if you&apos;re staying overnight instead, the{" "}
                <Link href="/airport-hotel-dhaka" className="text-neon-teal transition hover:text-white">
                  airport hotel page
                </Link>{" "}
                covers full-night stays from ৳4,000.
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ───────────────── TRANSIT FAQ ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <h2 className="font-display text-2xl font-semibold text-white">Transit stay questions</h2>
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
              Mid-layover right now?{" "}
              <a href={CONTACT.phoneHref} className="text-neon-teal transition hover:text-white">
                Call {CONTACT.phone}
              </a>{" "}
              or{" "}
              <a
                href={waLink("Hi! I'm on a layover at Dhaka airport — is a day-use room available today?")}
                className="text-neon-teal transition hover:text-white"
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp the desk
              </a>{" "}
              for today&apos;s day-use availability.
            </p>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
