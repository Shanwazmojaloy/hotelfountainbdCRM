import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { headers } from "next/headers";
import Script from "next/script";
import ClientErrorReporter from "./components/ClientErrorReporter";
import "./globals.css";
import { RoleProvider } from "@/context/RoleContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* CookieHub consent banner. PERF: was strategy="beforeInteractive", which put a
            synchronous third-party script in the initial HTML and blocked first paint
            (~2.5s of the 3s FCP). Consent-gated scripts (Meta Pixel) are inert
            type="text/plain" tags, so CookieHub only needs to load before it ACTIVATES
            them, not before paint. afterInteractive keeps consent-before-marketing
            semantics with zero render blocking. The injector calls load() on the CDN
            script's own onload, so no DOMContentLoaded race; cdn.cookiehub.eu is
            host-whitelisted in the middleware CSP, the inline injector carries the nonce. */}
        <Script id="cookiehub-init" strategy="afterInteractive" nonce={nonce}>
          {`(function(){var s=document.createElement("script");s.src="https://cdn.cookiehub.eu/c2/bebf3065.js";s.async=true;s.onload=function(){if(window.cookiehub){window.cookiehub.load({});}};document.head.appendChild(s);})();`}
        </Script>
        <RoleProvider>{children}</RoleProvider>
        <ClientErrorReporter />
        {/* Vercel components don't accept a `nonce` prop and don't need one — their scripts
            load from the same-origin /_vercel/* path, already covered by script-src 'self'. */}
        <SpeedInsights sampleRate={0.25} />
        <Analytics />
        {/* Google tag (gtag.js) — GA4 G-TS2Q3QEF19, exactly once per page via the root
            layout. The loader host is whitelisted in script-src; the inline bootstrap
            carries the per-request CSP nonce like every other inline script here. */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-TS2Q3QEF19" nonce={nonce} suppressHydrationWarning />
        <script
          nonce={nonce} suppressHydrationWarning
          dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});gtag('js',new Date());gtag('config','G-TS2Q3QEF19');`,          }}
        />
        <script
          nonce={nonce} suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}`,
          }}
        />
      </body>
    </html>
  );
}
