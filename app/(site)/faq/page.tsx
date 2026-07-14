import type { Metadata } from "next";
import { CONTACT } from "@/lib/site";
import GlassCard from "@/components/site/GlassCard";
import FadeIn from "@/components/site/FadeIn";
import JsonLd from "@/components/site/JsonLd";

const faqBreadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "FAQ", item: "https://fountainbd.com/faq" },
  ],
};

export const metadata: Metadata = {
  title: "FAQ — Hotel Fountain, Dhaka",
  description:
    "Answers about Hotel Fountain in Nikunja-02, Dhaka: location and airport distance, room rates (৳4,000–৳9,000), check-in times, breakfast, Wi-Fi and how to book.",
  alternates: { canonical: "https://fountainbd.com/faq" },
  openGraph: {
    title: "Hotel Fountain — Frequently Asked Questions",
    description:
      "Location, airport distance, room rates, check-in times, amenities and booking — everything about staying at Hotel Fountain, Dhaka.",
    url: "https://fountainbd.com/faq",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/hero-exterior.webp", width: 1200, height: 630, alt: "Hotel Fountain exterior, Nikunja-02, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

// Single source of truth for both the visible page and the FAQPage JSON-LD,
// so the two can never contradict (a hard requirement for valid AEO schema).
// Every fact here mirrors src/lib/site.ts and src/lib/rooms.ts.
const FAQS: { q: string; a: string }[] = [
  {
    q: "Where is Hotel Fountain located?",
    a: "Hotel Fountain is at House-05, Road-02, Nikunja-02, Dhaka 1229, Bangladesh — in the Nikunja-02 neighbourhood on Dhaka's airport corridor, about 8 minutes from Hazrat Shahjalal International Airport.",
  },
  {
    q: "How far is Hotel Fountain from the airport, and is there an airport transfer?",
    a: "It is about an 8-minute drive from Hazrat Shahjalal International Airport. Complimentary airport pickup and drop-off is available for suite guests, and the 24/7 front desk can arrange transfers for other guests.",
  },
  {
    q: "What is the price range per night?",
    a: "Rooms range from ৳4,000 to ৳9,000 per night: Fountain Deluxe ৳4,000, Premium Deluxe ৳4,500, Superior Deluxe ৳5,000, Twin Deluxe ৳6,000 and the Royal Suite ৳9,000. All rates are in Bangladeshi Taka (BDT).",
  },
  {
    q: "What room types are available?",
    a: "Five room types: Fountain Deluxe (up to 2 guests), Premium Deluxe (up to 2), Superior Deluxe (up to 2), Twin Deluxe (up to 4) and the Royal Suite (up to 6). Premium Deluxe and above include complimentary breakfast.",
  },
  {
    q: "What are the check-in and check-out times?",
    a: "Check-in and check-out are both at 12:00 PM. The front desk is staffed 24/7, so early check-in or late check-out can be arranged on request.",
  },
  {
    q: "Is breakfast included?",
    a: "Complimentary breakfast is included with the Premium Deluxe, Superior Deluxe, Twin Deluxe and Royal Suite rooms. The rooftop restaurant serves Bangladeshi and international cuisine from 7:00 AM to 11:00 PM, with in-room dining available around the clock.",
  },
  {
    q: "Do the rooms have Wi-Fi?",
    a: "Yes. Free fibre-optic high-speed Wi-Fi reaches every room, the lobby and all event spaces — fast enough for video calls, streaming and remote work.",
  },
  {
    q: "Does Hotel Fountain have facilities for business meetings or events?",
    a: "Yes. A business center offers conference rooms, private offices and a banquet hall for corporate events, with fibre internet, projection and dedicated front-office coordination.",
  },
  {
    q: "How do I book a room at Hotel Fountain?",
    a: "Book online at fountainbd.com, call " + CONTACT.phone + ", or message on WhatsApp. The front desk is available 24/7 to confirm your reservation.",
  },
  {
    q: "How can I contact Hotel Fountain?",
    a: "Call " + CONTACT.phone + ", email " + CONTACT.email + ", or reach us on WhatsApp. The hotel is at House-05, Road-02, Nikunja-02, Dhaka 1229, Bangladesh.",
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

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={faqBreadcrumb} />

      {/* ───────────────── PAGE HEADER ───────────────── */}
      <section className="section pb-12 pt-10">
        <FadeIn className="mx-auto max-w-2xl text-center" whileInView={false}>
          <p className="eyebrow">Help Centre</p>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            Frequently Asked <span className="italic text-neon-teal">Questions</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-white/60">
            Everything you need to know about staying at Hotel Fountain in Nikunja-02, Dhaka — location,
            rates, check-in and amenities.
          </p>
        </FadeIn>
      </section>

      {/* ───────────────── FAQ LIST ───────────────── */}
      <section className="section pb-24">
        <div className="mx-auto max-w-3xl">
          <GlassCard className="p-7 sm:p-9">
            <dl>
              {FAQS.map((f, i) => (
                <FadeIn key={f.q} delay={i * 0.04}>
                  <div className="border-t border-white/8 py-6 first:border-t-0 first:pt-0">
                    <dt className="font-display text-lg font-semibold text-white">{f.q}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-white/70">{f.a}</dd>
                  </div>
                </FadeIn>
              ))}
            </dl>
          </GlassCard>

          <FadeIn>
            <p className="mt-8 text-center text-sm text-white/50">
              Still have a question?{" "}
              <a href={CONTACT.phoneHref} className="text-neon-teal transition hover:text-white">
                Call {CONTACT.phone}
              </a>{" "}
              or{" "}
              <a href="/contact" className="text-neon-teal transition hover:text-white">
                contact the front desk
              </a>
              .
            </p>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
