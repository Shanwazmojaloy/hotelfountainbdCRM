/** @type {import('next').NextConfig} */
import { withWorkflow } from 'workflow/next';

const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '');

const baseDirectives = (scriptSrc) => [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "font-src 'self' data: fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://api.brevo.com`,
  "frame-src 'self' https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// /crm.html: every script is external same-origin now -> no inline/eval needed.
const crmCsp = baseDirectives("script-src 'self'");

// App (SSR) pages get a per-request nonce CSP from middleware.ts — NOT here.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  trailingSlash: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // WORKFLOW BUILD FIX (2026-07-10): the workflow routes' server bundle crashed page-data
  // collection with `TypeError: The "path" argument must be of type string` thrown by
  // `new XDGAppPaths` at module scope. Chain: @workflow/world-vercel -> @vercel/oidc ->
  // @vercel/cli-config -> xdg-app-paths, which derives an app name from require.main
  // (gone under webpack). These are CLI/local-dev token packages and must stay real
  // runtime requires (Vercel file-traces them). cbor-x kept external too - its native
  // binding loader (node-gyp-build) is equally webpack-hostile. Do NOT remove.
  serverExternalPackages: ['cbor-x', 'cbor-extract', '@vercel/oidc', '@vercel/cli-config', '@vercel/cli-auth', 'xdg-app-paths'],
  // PERF: barrel-optimize framer-motion so pages only pull the primitives they use
  // instead of the whole package — smaller client bundles, less parse/eval on mobile.
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  headers: async () => [
    {
      source: '/crm.html',
      headers: [
        { key: 'Content-Security-Policy', value: crmCsp },
        ...securityHeaders,
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
        { key: 'Expires', value: '0' },
      ],
    },
    {
      source: '/((?!crm.html).*)',
      headers: securityHeaders,
    },
  ],
};

// withWorkflow enables the "use workflow"/"use step" directives (close-day chain).
export default withWorkflow(nextConfig);
