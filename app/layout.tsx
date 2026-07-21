import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond, Playfair_Display } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import ClientErrorReporter from "./components/ClientErrorReporter";
import "./globals.css";
import { RoleProvider } from "@/context/RoleContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
// PERF: Cormorant is CRM-only (the `.cg` class + NotificationBell); the public
// marketing pages never render it (their serif is Playfair via --font-display).
// preload:true (the next/font default) was emitting <link rel=preload> for all
// 3 weights x normal+italic on EVERY page incl. the homepage, eagerly fetching
// ~6 unused font files off the mobile LCP path. preload:false keeps the @font-face
// so it still loads when actually used on /crm, but stops the wasteful preload on
// public pages. No visual change (font is unused where it's no longer preloaded).
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
// CLS FIX: Playfair (the public-site .font-display serif, incl. the 6xl-8xl hero h1)
// previously came from the Google Fonts stylesheet with display=swap and a raw Georgia
// fallback -- the metric mismatch reflowed the whole hero on swap (CLS 0.61 mobile).
// next/font self-hosts it AND injects a size-adjusted fallback, so the swap is shift-free.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fountainbd.com"),
  title: "Hotel Fountain — Dhaka's Finest Luxury Hotel",
  description: "Experience refined comfort in the heart of Dhaka. Book your stay at Hotel Fountain — where every stay becomes a memory.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Lumea" },
  icons: { icon: "/favicon.ico", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#07090E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// PERF / STATIC RENDERING: this shared root layout no longer reads the per-request CSP
// nonce (headers()). That call forced dynamic SSR on EVERY route — including the public
// marketing pages — which was the 1.5s TTFB. With it gone, the public (site) routes render
// statically (served from the CDN edge). The GA tag, CookieHub consent banner and
// Service-Worker registration that used to live here (all nonce-dependent inline scripts)
// now live in app/(site)/layout.tsx, scoped to the public pages under the static
// 'unsafe-inline' CSP. The authed /crm, /admin, /lumea and /settings subtrees keep the
// strict per-request nonce CSP via their own `export const dynamic = 'force-dynamic'`
// layouts + the middleware CSP branch.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <RoleProvider>{children}</RoleProvider>
        <ClientErrorReporter />
        {/* Vercel components don't accept/need a nonce — same-origin /_vercel/* scripts,
            covered by script-src 'self'. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
