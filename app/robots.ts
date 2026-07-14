import type { MetadataRoute } from "next";

// Allow crawling of the public marketing site; keep the CRM, billing, staff and
// API surfaces out of search. Points crawlers to the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/crm", "/billing", "/settings", "/lumea", "/admin", "/invoice/", "/api/"],
    },
    sitemap: "https://fountainbd.com/sitemap.xml",
    host: "https://fountainbd.com",
  };
}
