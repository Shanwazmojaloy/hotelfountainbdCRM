import type { MetadataRoute } from "next";

const BASE = "https://fountainbd.com";

// Public marketing routes only - the CRM/billing/API stay out of the index (see robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/rooms`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/airport-hotel-dhaka`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/bn/airport-hotel-dhaka`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/transit-hotel-dhaka`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/hotel-near-bashundhara`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/guides/dhaka-layover`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
  ];
}
