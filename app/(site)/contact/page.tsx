import type { Metadata } from "next";
import { CONTACT } from "@/lib/site";
import ScrollReveal from "@/components/site/ScrollReveal";
import GlassCard from "@/components/site/GlassCard";
import SectionHeading from "@/components/site/SectionHeading";
import ContactForm from "@/components/site/ContactForm";
import TermsAccordion from "@/components/site/TermsAccordion";
import MapEmbed from "@/components/site/MapEmbed";

export const metadata: Metadata = {
  title: "Contact & Support — Hotel Fountain",
  description:
    "Reach Hotel Fountain — House-05, Road-02, Nikunja-02, Dhaka 1229. Front desk 24/7, call +880 1322-840799 or send a message.",
};

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="border-t border-white/8 py-4 first:border-t-0 first:pt-0">
    <p className="text-xs font-semibold uppercase tracking-wide text-neon-teal/80">{label}</p>
    <div className="mt-1.5 text-sm leading-relaxed text-white/75">{children}</div>
  </div>
);

export default function ContactPage() {
  return (
    <>
      <section className="section py-12">
        <ScrollReveal>
          <SectionHeading
            eyebrow="Contact Us"
            title={<>Get in <em>Touch</em></>}
            intro="Questions, special requests or group bookings — our front office is available around the clock."
            center
          />
        </ScrollReveal>
      </section>

      <section className="section pb-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: info + form */}
          <ScrollReveal>
            <GlassCard className="p-7 sm:p-9">
              <InfoRow label="Address">
                {CONTACT.address.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </InfoRow>
              <InfoRow label="Phone">
                <a href={CONTACT.phoneHref} className="transition hover:text-neon-teal">
                  {CONTACT.phone}
                </a>
              </InfoRow>
              <InfoRow label="Email">
                <a href={CONTACT.emailHref} className="transition hover:text-neon-teal">
                  {CONTACT.email}
                </a>
              </InfoRow>
              <InfoRow label="Hours">
                <p>Front Desk: {CONTACT.frontDesk}</p>
                <p>
                  Check-In: {CONTACT.checkIn} · Check-Out: {CONTACT.checkOut}
                </p>
              </InfoRow>

              <div className="mt-7 border-t border-white/8 pt-7">
                <h3 className="mb-4 font-display text-lg font-semibold text-white">Send us a message</h3>
                <ContactForm />
              </div>
            </GlassCard>
          </ScrollReveal>

          {/* Right: map */}
          <ScrollReveal delay={0.1}>
            <GlassCard className="h-full overflow-hidden p-2">
              <MapEmbed />
            </GlassCard>
          </ScrollReveal>
        </div>
      </section>

      {/* Terms */}
      <section id="terms" className="section py-12 scroll-mt-28">
        <ScrollReveal>
          <p className="eyebrow">Legal</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">
            Terms &amp; <span className="italic text-neon-teal">Conditions</span>
          </h2>
          <GlassCard className="mt-6 p-7">
            <TermsAccordion />
          </GlassCard>
        </ScrollReveal>
      </section>
    </>
  );
}
