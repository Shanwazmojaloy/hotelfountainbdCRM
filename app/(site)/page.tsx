import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SITE, STATS, AMENITIES } from "@/lib/site";
import { ROOMS } from "@/lib/rooms";
import ScrollReveal from "@/components/site/ScrollReveal";
import GlassCard from "@/components/site/GlassCard";
import SectionHeading from "@/components/site/SectionHeading";
import RoomCard from "@/components/site/RoomCard";
import MagneticButton from "@/components/site/MagneticButton";
import AvailabilityWidget from "@/components/site/AvailabilityWidget";
import BookingBar from "@/components/site/BookingBar";
import FadeIn from "@/components/site/FadeIn";
import Parallax from "@/components/site/Parallax";

export const metadata: Metadata = {
  title: "Hotel Fountain — Dhaka's Finest Luxury Hotel",
  alternates: { canonical: "https://fountainbd.com/" },
  openGraph: {
    title: "Hotel Fountain | Boutique Hotel in Nikunja-02, Dhaka",
    description:
      "Boutique comfort 8 minutes from Hazrat Shahjalal International Airport. Rooftop restaurant, free breakfast and fibre Wi-Fi. Book direct from BDT 4,000/night.",
    url: "https://fountainbd.com/",
    siteName: "Hotel Fountain",
    type: "website",
    images: [{ url: "/images/hero-exterior.webp", width: 1200, height: 630, alt: "Hotel Fountain exterior, Nikunja-02, Dhaka" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function HomePage() {
  return (
    <>
      {/* ───────────────── HERO ───────────────── */}
      <section className="relative -mt-24 flex min-h-[100svh] items-center overflow-hidden pt-24">
        {/* Full-bleed exterior image — right edge on desktop, full backdrop on mobile */}
        <div className="absolute inset-0 lg:left-auto lg:right-0 lg:w-[58%]">
          <Parallax className="absolute inset-0" distance={50}>
            <Image
              src="/images/hero-exterior.webp"
              alt="Hotel Fountain front view"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="scale-110 object-cover lg:[-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.15)_22%,#000_50%)] lg:[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.15)_22%,#000_50%)]"
            />
          </Parallax>
          {/* Mobile: darken behind the copy for legibility (desktop uses the image mask above) */}
          <div className="absolute inset-0 bg-gradient-to-r from-abyss via-abyss/60 to-abyss/30 lg:hidden" />
          {/* Soft bottom fade for depth (both breakpoints) */}
          <div className="absolute inset-0 bg-gradient-to-t from-abyss/70 via-transparent to-transparent lg:from-abyss/45" />
        </div>

        {/* Hero copy */}
        <div className="section relative z-10 w-full">
          <div className="max-w-xl animate-fade-up">
            <span className="pill">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-neon-teal/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-teal" />
              </span>
              Available Rooms Tonight
            </span>

            <p className="mt-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-white/55">
              <span className="h-px w-8 bg-gold/60" />
              {SITE.location} · {SITE.established}
            </p>

            <h1 className="mt-5 font-display text-6xl font-medium leading-[0.98] text-white sm:text-7xl lg:text-8xl">
              Hotel
              <span className="mt-1 block italic text-neon-teal">Fountain</span>
              {/* SEO: keyword + location qualifier, visually hidden to preserve the hero design */}
              <span className="sr-only">, Boutique Hotel in Nikunja-02, Dhaka, 8 minutes from Hazrat Shahjalal International Airport</span>
            </h1>

            <p className="mt-6 text-xs font-medium uppercase tracking-[0.3em] text-white/70">
              {SITE.tagline}
            </p>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/65">{SITE.description}</p>

            <div className="mt-9 flex flex-wrap gap-3">
              <MagneticButton href="/rooms" variant="neon">
                Explore Rooms
              </MagneticButton>
              <MagneticButton href="#availability" variant="ghost">
                Check Availability
              </MagneticButton>
            </div>
          </div>

          <FadeIn direction="up" delay={0.2} whileInView={false} className="mt-10 max-w-2xl">
            <BookingBar />
          </FadeIn>
        </div>
      </section>

      {/* ───────────────── VALUE STATS RIBBON ───────────────── */}
      <section className="section py-20">
        <ScrollReveal stagger className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {STATS.map((s) => (
            <GlassCard key={s.label} className="glass-clip p-4 text-center min-[420px]:p-6" interactive>
              <p className="font-mono text-2xl font-semibold text-neon-teal min-[420px]:text-3xl sm:text-4xl">{s.value}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-white/55 min-[420px]:text-xs">{s.label}</p>
            </GlassCard>
          ))}
        </ScrollReveal>
      </section>

      {/* ───────────────── ROOMS PREVIEW ───────────────── */}
      <section className="section py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <FadeIn>
            <SectionHeading
              eyebrow="Accommodations"
              title={<>Our <em>Rooms</em> &amp; Suites</>}
              intro="Every room is designed with meticulous attention to comfort and elegance. Choose from our curated collection of premium accommodations."
            />
          </FadeIn>
          <Link href="/rooms" className="btn-ghost !py-2.5 text-xs">
            View all rooms <span className="cta-arrow">→</span>
          </Link>
        </div>

        {/* Phones: swipeable snap carousel (2-up grid crammed full cards into ~150px columns);
            sm+ keeps the responsive grid. */}
        <ScrollReveal
          stagger
          className="scrollbar-none -mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5"
        >
          {ROOMS.map((room) => (
            <div key={room.slug} className="w-[76%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink">
              <RoomCard room={room} />
            </div>
          ))}
        </ScrollReveal>
      </section>

      {/* ───────────────── AMENITIES OVERVIEW ───────────────── */}
      <section className="section py-28">
        <FadeIn>
          <SectionHeading
            eyebrow="The Experience"
            title={<>More Than <em>a Stay</em></>}
            intro="From our rooftop restaurant to the business center, every facility is crafted to exceed expectations."
            center
          />
        </FadeIn>
        <ScrollReveal stagger className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AMENITIES.map((a) => (
            <GlassCard key={a.title} className="glass-clip p-6" interactive>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-2xl">
                {a.icon}
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-white">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{a.short}</p>
            </GlassCard>
          ))}
        </ScrollReveal>
        <div className="mt-8 text-center">
          <Link href="/services" className="btn-ghost !py-2.5 text-xs">
            Explore the full experience <span className="cta-arrow">→</span>
          </Link>
        </div>
      </section>

      {/* ───────────────── CHECK AVAILABILITY ───────────────── */}
      <section id="availability" className="section scroll-mt-28 py-28">
        <GlassCard className="p-7 sm:p-10">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <p className="eyebrow">Book Your Stay</p>
            <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">
              Check <span className="italic text-neon-teal">Availability</span>
            </h2>
            <p className="mt-3 text-sm text-white/60">
              Select your dates and preferred room type. We&apos;ll show you real-time availability from
              our rooms database.
            </p>
          </div>
          <AvailabilityWidget />
        </GlassCard>
      </section>
    </>
  );
}
