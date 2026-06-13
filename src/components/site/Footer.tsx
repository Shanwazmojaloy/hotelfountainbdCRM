"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { NAV_LINKS, SITE, CONTACT } from "@/lib/site";

export default function Footer() {
  if (usePathname() === "/") return null;
  return (
    <footer className="section pb-10 pt-20">
      <div className="glass glass-sheen flex flex-col gap-8 p-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo/logo-white.png"
            alt="Hotel Fountain"
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <div>
            <p className="font-display text-lg font-medium text-white">
              Hotel <span className="italic text-neon-teal">Fountain</span>
            </p>
            <p className="text-sm text-white/50">{CONTACT.address[0]}</p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-white/65 transition hover:text-neon-teal">
              {l.label}
            </Link>
          ))}
          <Link href="/contact#terms" className="text-sm text-white/65 transition hover:text-neon-teal">
            Terms
          </Link>
          <a href={SITE.crmUrl} className="text-sm text-white/65 transition hover:text-neon-teal">
            Staff
          </a>
        </nav>
      </div>

      <p className="mt-6 text-center text-xs text-white/40">
        &copy; {new Date().getFullYear()} {SITE.name} &middot; {SITE.location} &middot; All Rights Reserved
      </p>
    </footer>
  );
}
