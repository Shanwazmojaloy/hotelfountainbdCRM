import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import BookNowFab from "@/components/site/BookNowFab";
import ReservationModalHost from "@/components/site/ReservationModalHost";
import ScrollProgress from "@/components/site/ScrollProgress";
import MotionProvider from "@/components/site/MotionProvider";
import { SITE, CONTACT, AMENITIES, SOCIALS } from "@/lib/site";
import Script from "next/script";

// Hotel JSON-LD for the public marketing pages. `application/ld+json` is a data block,
// not executable JS — the CSP script-src does NOT gate it, so no nonce is needed.
const hotelSchema = {
  "@context": "https://schema.org",
  "@type": "Hotel",
  name: SITE.name,
  description: SITE.description,
  url: "https://fountainbd.com",
  telephone: CONTACT.phone,
  email: CONTACT.email,
  image: "https://fountainbd.com/images/hero-exterior.webp",
  sameAs: SOCIALS.map((s) => s.href),
  priceRange: "৳4,000–৳9,000",
  checkinTime: "12:00",
  checkoutTime: "12:00",
  // NO aggregateRating: Google requires it to reflect genuine ratings VISIBLE on this page
  // from a verifiable first-party source. The site shows no review count/widget, and the
  // hardcoded 349 didn't match any real source (the FB page has ~48) — an unbacked rating
  // risks a manual structured-data penalty and can never update. Re-add ONLY alongside an
  // on-page, real, self-updating review display.
  address: {
    "@type": "PostalAddress",
    streetAddress: "House-05, Road-02, Nikunja-02",
    addressLocality: "Dhaka",
    postalCode: "1229",
    addressCountry: "BD",
  },
  geo: { "@type": "GeoCoordinates", latitude: 23.8292, longitude: 90.4162 },
  amenityFeature: AMENITIES.map((a) => ({ "@type": "LocationFeatureSpecification", name: a.title, value: true })),
};

const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const GA_ID = "G-TS2Q3QEF19";

// Public-site AI chat widget. Served SAME-ORIGIN from /public/widget.js (a pinned
// copy we control); its POST /chat is proxied to the bot backend by app/chat/route.ts.
// Scoped to (site) → never loads on /crm. Bump the ?v= when public/widget.js changes.
const CHAT_WIDGET_SRC = "/widget.js?v=2";

// STATIC RENDERING: this layout no longer reads the per-request nonce (headers()), so the
// public (site) routes render statically (CDN edge → low TTFB). The inline scripts below —
// GA, CookieHub consent, Service-Worker registration — were moved here from the shared root
// layout; they run under the middleware's static 'unsafe-inline' CSP for public routes. The
// authed /crm etc. surfaces keep the strict per-request nonce CSP.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-root app-bg">
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelSchema) }} />

      {/* CookieHub consent banner. afterInteractive keeps consent-before-marketing semantics
          with zero render blocking (the consent-gated Meta Pixel below is an inert
          type="text/plain" tag until CookieHub activates it). The injector calls load() on the
          CDN script's own onload, so no DOMContentLoaded race. */}
      <Script id="cookiehub-init" strategy="afterInteractive">
        {`(function(){var s=document.createElement("script");s.src="https://cdn.cookiehub.eu/c2/bebf3065.js";s.async=true;s.onload=function(){if(window.cookiehub){window.cookiehub.load({});
/* SCROLL-LOCK GUARD (2026-07-14): in region g0 (e.g. Bangladesh, consent not
   required) CookieHub hides its root (.ch2 display:none) but leaves the
   body overflow:hidden lock from its center dialog -> page cannot scroll.
   Watch 10s post-load; release the lock ONLY if the CookieHub root is hidden
   AND no other visible aria-modal dialog owns the lock. Fires once. */
var n=0,t=setInterval(function(){n++;var r=document.querySelector(".ch2");var b=document.body;var o=document.querySelector('[aria-modal="true"]:not(#ch2-dialog)');var oV=o&&o.offsetWidth>0;if(r&&getComputedStyle(r).display==="none"&&b.style.overflow==="hidden"&&!oV){b.style.overflow="";clearInterval(t);}else if(n>=40){clearInterval(t);}},250);}};document.head.appendChild(s);})();`}
      </Script>

      {FB_PIXEL_ID && (
        <script
          type="text/plain"
          data-consent="marketing"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${FB_PIXEL_ID}');fbq('track','PageView');`,
          }}
        />
      )}

      {/* Google tag (gtag.js) — GA4. Loader host is script-src-allowlisted; the consent-default
          bootstrap runs inline under the public 'unsafe-inline' CSP. */}
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} suppressHydrationWarning />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});gtag('js',new Date());gtag('config','${GA_ID}');`,
        }}
      />

      {/* PWA service worker — registers on the public site (default scope '/'). */}
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}`,
        }}
      />

      {/* PERF: lazyOnload — the chat widget is non-critical; keep it out of the
          hydration window so it never competes with first interactions (INP). */}
      <Script src={CHAT_WIDGET_SRC} strategy="lazyOnload" />

      <MotionProvider>
        <ScrollProgress />
        <Navbar />
        <main className="min-h-screen pt-24">{children}</main>
        <Footer />
        <BookNowFab />
        <ReservationModalHost />
      </MotionProvider>
    </div>
  );
}
