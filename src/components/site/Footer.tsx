import Link from "next/link";
import Image from "next/image";
import { NAV_LINKS, SITE, CONTACT } from "@/lib/site";

/**
 * Editorial multi-column footer (Gilded Threshold theme).
 * Generous whitespace, hairline gold dividers, reuses .section / font-display
 * / neon-teal (gold) tokens so it stays one brand with the rest of the site.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="section pb-10 pt-24">
      {/* Top hairline */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neon-teal/25 to-transparent" />

      <div className="grid grid-cols-1 gap-12 pt-14 md:grid-cols-12 md:gap-8">
        {/* Brand + tagline */}
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <Image
              src="/logo/logo-white.png"
              alt="Hotel Fountain"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
            <p className="font-display text-xl font-medium text-white">
              Hotel <span className="italic text-neon-teal">Fountain</span>
            </p>
          </div>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/55">{SITE.description}</p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.25em] text-white/35">
            {SITE.location} · {SITE.established}
          </p>
        </div>

        {/* Explore */}
        <div className="md:col-span-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neon-teal/70">Explore</p>
          <nav className="mt-5 flex flex-col gap-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="w-fit text-sm text-white/60 transition hover:text-neon-teal"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/faq" className="w-fit text-sm text-white/60 transition hover:text-neon-teal">
              FAQ
            </Link>
            <Link href="/contact#terms" className="w-fit text-sm text-white/60 transition hover:text-neon-teal">
              Terms &amp; Conditions
            </Link>
            <a href={SITE.crmUrl} className="w-fit text-sm text-white/60 transition hover:text-neon-teal">
              Staff Login
            </a>
          </nav>
        </div>

        {/* Contact */}
        <div className="md:col-span-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neon-teal/70">Get in touch</p>
          <div className="mt-5 flex flex-col gap-3 text-sm text-white/60">
            <a href={CONTACT.phoneHref} className="w-fit transition hover:text-neon-teal">
              {CONTACT.phone}
            </a>
            <a href={CONTACT.emailHref} className="w-fit transition hover:text-neon-teal">
              {CONTACT.email}
            </a>
            <p className="max-w-xs leading-relaxed">{CONTACT.address.join(", ")}</p>
            <p className="text-white/45">
              Front desk {CONTACT.frontDesk} · Check-in {CONTACT.checkIn}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom hairline + copyright */}
      <div className="mt-16 h-px w-full bg-white/5" />
      <div className="flex flex-col items-center justify-between gap-3 pt-6 text-xs text-white/40 sm:flex-row">
        <p>
          © {year} {SITE.name}. All rights reserved.
        </p>
        <p className="uppercase tracking-[0.2em] text-white/30">{SITE.tagline}</p>
      </div>
    </footer>
  );
}
