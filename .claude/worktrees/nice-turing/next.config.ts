import type { NextConfig } from "next";

// ─── Security headers ─────────────────────────────────────────────────────
// Locked-down baseline. Adjust CSP `connect-src` if you add analytics or
// other external APIs. `unsafe-inline` is required for our `dangerouslySetInnerHTML`
// style blocks in NotificationBell — remove once those are migrated to globals.css.
const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '');

const cspParts = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "font-src 'self' data: fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://api.brevo.com`,
  "frame-src 'self' https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspParts.join('; ') },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  headers: async () => [
    {
      // Force crm.html to never be cached — always fetch fresh from server
      source: '/crm.html',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
        { key: 'Expires', value: '0' },
      ],
    },
    {
      // Apply security headers to every other route
      source: '/((?!crm.html).*)',
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
