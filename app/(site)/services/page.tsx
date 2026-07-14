import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AMENITIES } from "@/lib/site";
import BookNowButton from "@/components/site/BookNowButton";
import ScrollReveal from "@/components/site/ScrollReveal";
import GlassCard from "@/components/site/GlassCard";
import SectionHeading from "@/components/site/SectionHeading";
import FadeIn from "@/components/site/FadeIn";
import JsonLd from "@/components/site/JsonLd";

const servicesBreadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://fountainbd.com/" },
    { "@type": "ListItem", position: 2, name: "Services & Amenities", item: "https://fountainbd.com/services" },
  ],
};

export const metadata: Metadata = {
  title: "Services & Amenities — Hotel Fountain",
  description:
    "Rooftop restaurant, business center, complimentary airport transfer and fibre Wi-Fi — premium hospitality in Nikunja-02, minutes from Dhaka airport.",
  alternates: { canonical: "https://fountainbd.com/services" },
  openGraph: {
    title: "Services & Amenities | Hotel Fountain, Dhaka",
    description:
      "Rooftop restaurant, business center, complimentary airport transfer and fibre Wi-Fi — minutes from Dhaka airport.",
    url: "https://fountainbd.com/services",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/rooftop.webp", width: 1200, height: 630, alt: "Rooftop restaurant at Hotel Fountain, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

const GALLERY = [
  { src: "/images/lobby.webp", label: "Lobby" },
  { src: "/images/restaurant.webp", label: "Restaurant" },
  { src: "/images/rooftop.webp", label: "Rooftop" },
  { src: "/images/banquet.webp", label: "Banquet Hall" },
];

const LOCALE = [
  { title: "8 min from the airport", body: "Hazrat Shahjalal International is a short hop from Nikunja-02 — ideal for transit and early flights." },
  { title: "Nikunja-02 & Khilkhet", body: "A calm, well-connected pocket of Dhaka with easy access to Airport Road and the expressway." },
  { title: "Dhaka at your doorstep", body: "Business districts, dining and shopping are minutes away, with front-office concierge to arrange it all." },
];

export default function ServicesPage() {
  return (
    <>
      <JsonLd data={servicesBreadcrumb} />
      {/* ───────────────── PAGE HEADER ───────────────── */}
      <section className="section pb-16 pt-10">
        <FadeIn className="mx-auto max-w-2xl text-center" whileInView={false}>
          <p className="eyebrow">The Experience</p>
          <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
            More Than <span className="italic text-neon-teal">a Stay</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-white/60">
            Every facility at Hotel Fountain is built around one idea — that hospitality should feel
            effortless. Here&apos;s what&apos;s waiting beyond your room.
          </p>
        </FadeIn>
      </section>

      {/* ───────────────── AMENITY DEEP-DIVE ───────────────── */}
      <section className="section pb-24">
        <ScrollReveal stagger className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {AMENITIES.map((a) => (
            <GlassCard key={a.title} className="glass-clip flex flex-col gap-4 p-6 sm:flex-row sm:gap-5 sm:p-7" interactive>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-3xl">
                {a.icon}
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-white">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{a.long}</p>
              </div>
            </GlassCard>
          ))}
        </ScrollReveal>
      </section>

      {/* ───────────────── GALLERY ───────────────── */}
      <section className="section py-24">
        <FadeIn>
          <SectionHeading eyebrow="The Property" title={<>Spaces to <em>remember</em></>} />
        </FadeIn>
        <ScrollReveal stagger className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {GALLERY.map((g) => (
            <GlassCard key={g.label} className="glass-clip group overflow-hidden p-0" interactive>
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl2">
                <Image
                  src={g.src}
                  alt={`${g.label} at Hotel Fountain, Nikunja-02, Dhaka`}
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  className="object-cover transition-transform duration-700 ease-fluid group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-abyss/85 to-transparent" />
                <span className="absolute bottom-3 left-3 text-sm font-medium text-white">{g.label}</span>
              </div>
            </GlassCard>
          ))}
        </ScrollReveal>
      </section>

      {/* ───────────────── LOCALE / AREA ───────────────── */}
      <section className="section py-24">
        <FadeIn>
          <SectionHeading
            eyebrow="Location"
            title={<>The <em>neighbourhood</em></>}
            intro="Nikunja-02, Khilkhet, Dhaka — quiet enough to rest, connected enough to do everything."
          />
        </FadeIn>
        <ScrollReveal stagger className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {LOCALE.map((l) => (
            <GlassCard key={l.title} className="glass-clip p-6" interactive>
              <h3 className="font-display text-lg font-semibold text-neon-teal">{l.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{l.body}</p>
            </GlassCard>
          ))}
        </ScrollReveal>
      </section>

      {/* ───────────────── CTA ───────────────── */}
      <section className="section pb-28 pt-4">
        <FadeIn direction="up">
          <GlassCard className="flex flex-col items-center gap-4 p-7 text-center sm:flex-row sm:justify-between sm:p-10 sm:text-left">
            <div>
              <h3 className="font-display text-2xl font-semibold text-white">Ready to experience it?</h3>
              <p className="mt-1 text-sm text-white/60">Reserve a room or ask us anything — the front desk never sleeps.</p>
            </div>
            <div className="flex w-full flex-wrap justify-center gap-3 sm:w-auto sm:flex-nowrap">
              <Link href="/rooms" className="btn-ghost shrink-0">View Rooms</Link>
              <BookNowButton className="btn-neon shrink-0" label="Book Now →" />
            </div>
          </GlassCard>
        </FadeIn>
      </section>
    </>
  );
}
