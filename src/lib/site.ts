// Single source of truth for site-wide content (canonical = live fountainbd.com).

export const SITE = {
  name: "Hotel Fountain",
  tagline: "Where Every Stay Becomes a Memory",
  location: "Dhaka, Bangladesh",
  established: "Est. Since 2010",
  crmUrl: "https://fountainbd.com/crm",
  description:
    "Nestled in the heart of Dhaka, Hotel Fountain offers a sanctuary of refined comfort — from our signature Fountain Deluxe rooms to the magnificent Royal Suite.",
} as const;

export const CONTACT = {
  address: ["House-05, Road-02, Nikunja-02", "Dhaka 1229, Bangladesh"],
  phone: "+880 1322-840799",
  phoneHref: "tel:+8801322840799",
  salesPhone: "+880 1622-903734",
  salesPhoneHref: "tel:+8801622903734",
  whatsapp: "8801322840799", // digits only, for wa.me links
  whatsappHref: "https://wa.me/8801322840799",
  whatsappLabel: "+880 1322-840799",
  email: "hotellfountainbd@gmail.com",
  emailHref: "mailto:hotellfountainbd@gmail.com",
  frontDesk: "24/7",
  checkIn: "12:00 PM",
  checkOut: "12:00 PM",
  mapEmbed:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3649.7005234745966!2d90.4162137758988!3d23.82924608574381!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3755c72983411885%3A0xe650b3a66c15269a!2sHotel%20Fountain!5e0!3m2!1sen!2sbd!4v1775873778238!5m2!1sen!2sbd",
} as const;

// Official social profiles (single source for footer links + Hotel schema sameAs).
// NOTE: @hotelfountain0806 is the canonical Facebook page (13.5K, 48 reviews);
// the duplicate "Hotel Fountain | Dhaka" page is pending merge/retirement.
export const SOCIALS = [
  { label: "Facebook", href: "https://www.facebook.com/hotelfountain0806" },
  { label: "Instagram", href: "https://www.instagram.com/hotel_fountainbd" },
] as const;

// Google review link for the Hotel Fountain GBP listing (CID-based; opens the
// exact listing). TODO(owner): replace with the short "g.page/r/.../review" link
// from Google Business Profile > Ask for reviews — that one opens the review
// dialog directly.
export const GOOGLE_REVIEW_URL = "https://www.google.com/maps?cid=16595962154219546266" as const;

/** Build a WhatsApp deep link to the hotel with a prefilled message. */
export function waLink(message: string): string {
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
}

// Value Stats Ribbon — live operational stats.
export const STATS = [
  { value: "28", label: "Premium Rooms" },
  { value: "৳4,000", label: "Starting Rate / Night" },
  { value: "24/7", label: "Concierge Service" },
  { value: "4.1★", label: "Guest Rating" },
] as const;

export const AMENITIES = [
  {
    icon: "🍽️",
    title: "Restaurant",
    short: "Authentic Bangladeshi and international cuisine, 7am–11pm.",
    long: "Our rooftop restaurant serves authentic Bangladeshi classics alongside an international à la carte menu, open 7:00 AM to 11:00 PM daily with in-room dining available around the clock.",
  },
  {
    icon: "💼",
    title: "Business Center",
    short: "Fully-equipped conference rooms and private offices.",
    long: "Fully-equipped conference rooms, private offices and a banquet hall for corporate events — fibre internet, projection and dedicated front-office coordination included.",
  },
  {
    icon: "🚗",
    title: "Airport Transfer",
    short: "Complimentary pickup and drop-off for suite guests.",
    long: "Complimentary airport pickup and drop-off for suite guests, just 8 minutes from Hazrat Shahjalal International Airport in Nikunja-02.",
  },
  {
    icon: "🌐",
    title: "High-Speed WiFi",
    short: "Fiber-optic internet throughout the entire property.",
    long: "Fibre-optic internet reaches every room, the lobby and all event spaces — fast enough for video calls, streaming and remote work without a hiccup.",
  },
] as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/rooms", label: "Rooms" },
  { href: "/services", label: "Experience" },
  { href: "/contact", label: "Contact" },
] as const;
