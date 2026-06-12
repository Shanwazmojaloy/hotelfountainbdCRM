import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AMENITIES } from "@/lib/site";
import BookNowButton from "@/components/site/BookNowButton";
import ScrollReveal from "@/components/site/ScrollReveal";
import GlassCard from "@/components/site/GlassCard";
import SectionHeading from "@/components/site/SectionHeading";

export const metadata: Metadata = {
  title: "Services & Amenities — Hotel Fountain",
  description:
    "Rooftop restaurant, business center, complimentary airport transfer and fibre Wi-Fi — premium hospitality in Nikunja-02, minutes from Dhaka airport.",
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
      {/* Header */}
      <section className="section py-12">
        <ScrollReveal>
          <SectionHeading
            eyebrow="The Experience"
            title={<>More Than <em>a Stay</em></>}
            intro="Every facility at Hotel Fountain is built around one idea — that hospitality should feel effortless. Here's what's waiting beyond your room."
            center
          />
        </ScrollReveal>
      </section>

      {/* Amenity deep-dive */}
      <section className="section pb-8">
        <ScrollReveal stagger className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {AMENITIES.map((a) => (
            <GlassCard key={a.title} className="flex gap-5 p-7" interactive>
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

      {/* Gallery */}
      <section className="section py-12">
        <ScrollReveal>
          <SectionHeading eyebrow="The Property" title={<>Spaces to <em>remember</em></>} />
        </ScrollReveal>
        <ScrollReveal stagger className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {GALLERY.map((g) => (
            <GlassCard key={g.label} className="group overflow-hidden p-0" interactive>
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl2">
                <Image
                  src={g.src}
                  alt={g.label}
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

      {/* Locale / area benefits */}
      <section className="section py-12">
        <ScrollReveal>
          <SectionHeading
            eyebrow="Location"
            title={<>The <em>neighbourhood</em></>}
            intro="Nikunja-02, Khilkhet, Dhaka — quiet enough to rest, connected enough to do everything."
          />
        </ScrollReveal>
        <ScrollReveal stagger className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {LOCALE.map((l) => (
            <GlassCard key={l.title} className="p-6" interactive>
              <h3 className="font-display text-lg font-semibold text-neon-teal">{l.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{l.body}</p>
            </GlassCard>
          ))}
        </ScrollReveal>
      </section>

      {/* CTA */}
      <section className="section py-12">
        <GlassCard className="flex flex-col items-center gap-4 p-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h3 className="font-display text-2xl font-semibold text-white">Ready to experience it?</h3>
            <p className="mt-1 text-sm text-white/60">Reserve a room or ask us anything — the front desk never sleeps.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/rooms" className="btn-ghost shrink-0">View Rooms</Link>
            <BookNowButton className="btn-neon shrink-0" label="Book Now →" />
          </div>
        </GlassCard>
      </section>
    </>
  );
}
