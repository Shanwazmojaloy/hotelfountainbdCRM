import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import BookNowFab from "@/components/site/BookNowFab";
import ReservationModal from "@/components/site/ReservationModal";
import { SITE, CONTACT, AMENITIES } from "@/lib/site";
import { headers } from "next/headers";

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
  priceRange: "৳4,000–৳9,000",
  checkinTime: "12:00",
  checkoutTime: "12:00",
  starRating: { "@type": "Rating", ratingValue: "4.8" },
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

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div className="site-root app-bg">
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelSchema) }} />
      <Navbar />
      <main className="min-h-screen pt-24">{children}</main>
      <Footer />
      <BookNowFab />
      <ReservationModal />
    </div>
  );
}
