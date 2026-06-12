// Canonical room catalog (live fountainbd.com). Images live in /public/images.

export type Room = {
  slug: string;
  name: string;
  variant?: string; // optional bed/setup variant label
  image: string;
  capacity: number;
  capacityLabel: string;
  priceBDT: number;
  priceLabel: string; // formatted with ৳
  blurb: string;
  features: string[];
  tier: "deluxe" | "suite";
  workArea?: boolean; // dedicated work desk
};

export const ROOMS: Room[] = [
  {
    slug: "fountain-deluxe",
    name: "Fountain Deluxe",
    image: "/images/room-fountain-deluxe.webp",
    capacity: 2,
    capacityLabel: "Up to 2 guests",
    priceBDT: 4000,
    priceLabel: "৳4,000",
    blurb:
      "Elegant room for two with premium air conditioning and round-the-clock front office support.",
    features: ["Air Condition", "High-Speed Wi-Fi", "24/7 Room Service", "Front Office"],
    tier: "deluxe",
  },
  {
    slug: "premium-deluxe",
    name: "Premium Deluxe",
    image: "/images/room-premium-deluxe-v2.webp",
    capacity: 2,
    capacityLabel: "Up to 2 guests",
    priceBDT: 4500,
    priceLabel: "৳4,500",
    blurb:
      "Refined comfort for two with complimentary breakfast and curated room amenities.",
    features: [
      "Complimentary Breakfast",
      "TV",
      "High-Speed Wi-Fi",
      "Room Amenities",
      "24/7 Room Service",
      "Front Office",
    ],
    tier: "deluxe",
  },
  {
    slug: "superior-deluxe",
    name: "Superior Deluxe",
    image: "/images/room-superior-deluxe.webp",
    capacity: 2,
    capacityLabel: "Up to 2 guests",
    priceBDT: 5000,
    priceLabel: "৳5,000",
    blurb:
      "Superior appointments for two guests, featuring complimentary breakfast and premium connectivity.",
    features: [
      "Complimentary Breakfast",
      "TV",
      "High-Speed Wi-Fi",
      "24/7 Room Service",
      "Front Office",
    ],
    tier: "deluxe",
  },
  {
    slug: "twin-deluxe",
    name: "Twin Deluxe",
    image: "/images/room-twin-deluxe.webp",
    capacity: 4,
    capacityLabel: "Up to 4 guests",
    priceBDT: 6000,
    priceLabel: "৳6,000",
    blurb:
      "Spacious twin-bed suite for four, ideal for families or colleague groups travelling together.",
    features: [
      "Complimentary Breakfast",
      "TV",
      "High-Speed Wi-Fi",
      "24/7 Room Service",
      "Front Office",
    ],
    tier: "suite",
  },
  {
    slug: "royal-suite",
    name: "Royal Suite",
    image: "/images/room-royal-suite.webp",
    capacity: 6,
    capacityLabel: "Up to 6 guests",
    priceBDT: 9000,
    priceLabel: "৳9,000",
    blurb:
      "Our crown jewel — an expansive suite for six with panoramic views and bespoke service.",
    features: [
      "Complimentary Breakfast",
      "TV",
      "High-Speed Wi-Fi",
      "24/7 Room Service",
      "Front Office",
    ],
    tier: "suite",
  },
];

export const ROOM_FILTERS = [
  { id: "all", label: "All Rooms" },
  { id: "deluxe", label: "Deluxe" },
  { id: "suite", label: "Suites" },
] as const;
