import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import BookNowFab from "@/components/site/BookNowFab";
import ReservationModalHost from "@/components/site/ReservationModalHost";
import ScrollProgress from "@/components/site/ScrollProgress";
import MotionProvider from "@/components/site/MotionProvider";
import { SITE, CONTACT, AMENITIES, SOCIALS } from "@/lib/site";
import { headers } from "next/headers";
import Script from "next/script";

// Hotel JSON-LD for the public marketing pages.
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
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.1", reviewCount: "349", bestRating: "5", worstRating: "1" },
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

// Public-site AI chat widget. Served SAME-ORIGIN from /public/widget.js (a pinned
// copy we control); its POST /chat is proxied to the bot backend by app/chat/route.ts.
// No third-party origin, DNS, or cert needed. Scoped to (site) → never loads on /crm.
// NOTE: bump the ?v= version whenever public/widget.js changes — /public files are
// cached hard by the browser/CDN, so the query param is the cache-bust.
const CHAT_WIDGET_SRC = "/widget.js?v=2";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div className="site-root app-bg">
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelSchema) }} />
      {FB_PIXEL_ID && (
        <script
          type="text/plain"
          data-consent="marketing"
          nonce={nonce} suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${FB_PIXEL_ID}');fbq('track','PageView');`,
          }}
        />
      )}
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
