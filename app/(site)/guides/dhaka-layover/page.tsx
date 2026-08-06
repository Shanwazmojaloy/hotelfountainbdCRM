import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, waLink } from "@/lib/site";
import GlassCard from "@/components/site/GlassCard";
import FadeIn from "@/components/site/FadeIn";
import JsonLd from "@/components/site/JsonLd";

// SEO batch 2 (2026-08-07, owner-approved): first CONTENT GUIDE — earns links and
// AEO citations for layover queries. Facts kept conservative: no visa promises
// (rules vary by nationality), drive times owner-confirmed. Article + Breadcrumb
// schema; FAQ intent lives on /transit-hotel-dhaka, NOT here (keep pages disjoint).

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "Guides", item: "https://fountainbd.com/guides/dhaka-layover" },
    { "@type": "ListItem", position: 3, name: "Dhaka Layover Guide", item: "https://fountainbd.com/guides/dhaka-layover" },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Layover in Dhaka: What to Do in 6–10 Hours",
  description:
    "A practical guide to a Dhaka airport (DAC) layover — when it's worth leaving the terminal, how to rest nearby, and what you can realistically see and eat.",
  author: { "@type": "Organization", name: "Hotel Fountain", url: "https://fountainbd.com" },
  publisher: { "@type": "Organization", name: "Hotel Fountain", url: "https://fountainbd.com" },
  image: "https://fountainbd.com/images/hero-exterior.webp",
  mainEntityOfPage: "https://fountainbd.com/guides/dhaka-layover",
};

export const metadata: Metadata = {
  title: "Layover in Dhaka: What to Do in 6–10 Hours — A Local Guide",
  description:
    "Stuck at Dhaka airport for hours? A practical local guide: when leaving the terminal is worth it, where to sleep and shower nearby, what to eat, and a realistic mini-itinerary.",
  alternates: { canonical: "https://fountainbd.com/guides/dhaka-layover" },
  openGraph: {
    title: "Layover in Dhaka: What to Do in 6–10 Hours",
    description:
      "When to leave the terminal, where to rest 8 minutes away, what to eat, and a realistic half-day itinerary — by the team at Hotel Fountain, Nikunja.",
    url: "https://fountainbd.com/guides/dhaka-layover",
    siteName: "Hotel Fountain",
    type: "article",
    images: [{ url: "/images/hero-exterior.webp", width: 1200, height: 630, alt: "Hotel Fountain exterior, Nikunja-02, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

const SECTIONS: { h: string; body: string[] }[] = [
  {
    h: "First: is your layover long enough to leave?",
    body: [
      "A workable rule of thumb at Hazrat Shahjalal International Airport (DAC): under 4 hours, stay in the terminal. From about 5–6 hours, leaving becomes genuinely worth it — immigration, the short ride out and check-in still leave you several hours to sleep or explore. With 8–10 hours you can rest AND see something.",
      "One caveat that matters: whether you may exit the airport depends on your nationality and visa situation, and rules change. Check your eligibility (visa-on-arrival or transit rules) with your airline or the Bangladesh immigration authorities before planning to leave the terminal.",
    ],
  },
  {
    h: "The rest-first plan (most travellers)",
    body: [
      "The single best use of a long Dhaka layover is honest sleep. Quiet, residential Nikunja-02 is an 8-minute drive from the terminal — closer than most of the city's hotels — and day-use rooms there mean a real bed, a hot shower and luggage storage without paying for a full night. That's the gap Hotel Fountain fills: a 24/7 front desk that receives 2 AM arrivals, wake-up calls timed to your boarding, and in-room dining around the clock.",
      "Six-hour layover in practice: 40 minutes for immigration and the ride, four hours of sleep and a shower, a hot meal, and you're back at departures two hours before boarding.",
    ],
  },
  {
    h: "If you'd rather explore: a realistic half-day",
    body: [
      "Skip the old city — Dhaka traffic makes Old Dhaka a gamble on a clock. Stay on the airport side instead. Jamuna Future Park, one of South Asia's largest shopping malls, is a 10–15 minute ride: air-conditioned, food courts, a cinema, and every kind of shop — the easiest two-to-three-hour outing a layover allows.",
      "For a calmer hour, the lakeside walkways of the Nikunja area give you an unhurried look at everyday Dhaka neighbourhood life — tea stalls included — minutes from the hotel.",
    ],
  },
  {
    h: "What to eat",
    body: [
      "If you only have one Bangladeshi meal, make it kacchi biryani — fragrant mutton biryani that Dhaka takes seriously. Closer to the airport, hotel dining is the time-safe option: Hotel Fountain's rooftop restaurant serves Bangladeshi and international dishes from 7 AM to 11 PM, so an early-morning or late-night layover still gets a proper meal.",
    ],
  },
  {
    h: "Getting back on time",
    body: [
      "Work backwards from boarding, not departure: be at the terminal 2 hours before an international flight, add the 10-minute ride, and add a Dhaka-traffic buffer of 20–30 minutes if you ventured beyond Nikunja or Kuril. Ask the front desk to book your return ride when you check in — not when you wake up.",
    ],
  },
];

export default function DhakaLayoverGuidePage() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumb} />

      {/* ───────────────── PAGE HEADER ───────────────── */}
      <section className="section pb-12 pt-10">
        <FadeIn className="mx-auto max-w-2xl text-center" whileInView={false}>
          <p className="eyebrow">Local Guide · DAC Layovers</p>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            Layover in <span className="italic text-neon-teal">Dhaka</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-white/60">
            What to actually do with 6–10 hours at Hazrat Shahjalal International Airport — when
            leaving the terminal is worth it, where to sleep 8 minutes away, and what you can
            realistically see and eat. Written by the team at Hotel Fountain, Nikunja-02.
          </p>
        </FadeIn>
      </section>

      {/* ───────────────── GUIDE BODY ───────────────── */}
      <section className="section pb-16">
        <div className="mx-auto max-w-3xl space-y-6">
          {SECTIONS.map((s, i) => (
            <FadeIn key={s.h} delay={i * 0.04}>
              <GlassCard className="p-7 sm:p-9">
                <h2 className="font-display text-2xl font-semibold text-white">{s.h}</h2>
                <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/70">
                  {s.body.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                </div>
              </GlassCard>
            </FadeIn>
          ))}

          <FadeIn>
            <GlassCard className="p-7 sm:p-9">
              <h2 className="font-display text-2xl font-semibold text-white">Plan the stop</h2>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                Day-use and transit stays are covered in detail on the{" "}
                <Link href="/transit-hotel-dhaka" className="text-neon-teal transition hover:text-white">
                  transit hotel page
                </Link>
                ; overnight stays from ৳4,000 on the{" "}
                <Link href="/airport-hotel-dhaka" className="text-neon-teal transition hover:text-white">
                  airport hotel page
                </Link>
                . Or just{" "}
                <a
                  href={waLink("Hi! I have a layover at Dhaka airport and read your layover guide — can I get a day-use room?")}
                  className="text-neon-teal transition hover:text-white"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp the 24/7 desk
                </a>{" "}
                or call {CONTACT.phone} with your flight times.
              </p>
            </GlassCard>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
