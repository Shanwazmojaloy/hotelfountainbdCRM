import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || 'lumea.app';
const DEFAULT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'hotelfountainbd';
const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '');

// ── CRM perimeter gate config ────────────────────────────────────────────────
// On the office IP: any logged-in staff. Off-network: ADMIN-tier sessions only.
// Perimeter only — Supabase RLS + anon-key revoke remain the real data guard.
// Phase B: these are DEPLOYMENT DEFAULTS; a tenant row's office_ips/remote_roles
// columns override them per-property (fetched below, 60s-cached, fail-open).
const OFFICE_IPS = ['103.113.153.228']; // public WAN IP(s); add every ISP line the property uses
const REMOTE_ROLES = new Set(['owner', 'admin']); // who may reach CRM off-site (add 'manager' to widen)

// Per-tenant perimeter overrides (Phase B). NULL/empty columns → deployment
// defaults; any fetch failure → deployment defaults (fail-open keeps the CRM
// reachable even if Supabase is briefly unreachable from the edge).
interface Perimeter { ips: string[]; roles: Set<string>; ts: number }
const perimCache = new Map<string, Perimeter>();
// PERF (2026-07-30): the override fetch used to run INLINE whenever an edge isolate's
// 60s cache was cold — and isolates are ephemeral, so in practice it blocked most
// /crm + /api/crm requests for a full Supabase round trip (up to the 1.5s timeout)
// BEFORE the route even started. Now: a warmed isolate serves the cached entry
// immediately (even if stale) and refreshes in the background via event.waitUntil;
// only a truly cold isolate still awaits one fetch. Security semantics unchanged —
// same override data, it just propagates within ~5 min instead of 60s.
const PERIM_TTL_MS = 5 * 60_000;
let perimRefreshing = false;
async function fetchPerimeter(slug: string): Promise<Perimeter> {
  let ips = OFFICE_IPS;
  let roles = REMOTE_ROLES;
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbKey) {
      const r = await fetch(
        `${sbUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=office_ips,remote_roles`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, signal: AbortSignal.timeout(1500) },
      );
      if (r.ok) {
        const t = (await r.json())?.[0];
        if (Array.isArray(t?.office_ips) && t.office_ips.length) ips = t.office_ips.map(String);
        if (Array.isArray(t?.remote_roles) && t.remote_roles.length) {
          roles = new Set(t.remote_roles.map((x: unknown) => String(x).trim().toLowerCase()));
        }
      }
    }
  } catch { /* fail-open to deployment defaults */ }
  return { ips, roles, ts: Date.now() };
}
async function tenantPerimeter(slug: string, event?: NextFetchEvent): Promise<Perimeter> {
  const hit = perimCache.get(slug);
  if (hit) {
    if (Date.now() - hit.ts > PERIM_TTL_MS && !perimRefreshing) {
      perimRefreshing = true;
      const refresh = fetchPerimeter(slug)
        .then((entry) => { perimCache.set(slug, entry); })
        .finally(() => { perimRefreshing = false; });
      if (event) event.waitUntil(refresh); else refresh.catch(() => {});
    }
    return hit; // stale-while-revalidate: never block a warmed isolate on the override fetch
  }
  const entry = await fetchPerimeter(slug); // cold isolate only
  perimCache.set(slug, entry);
  return entry;
}
const SESSION_COOKIE = 'lumea_sess';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // mirrors src/lib/session.ts
const AUTH_EXEMPT = new Set(['/api/crm/login', '/api/crm/session']); // handshake must work off-site

function fromB64u(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}
function toB64u(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Re-verifies the lumea_sess HMAC token with Web Crypto (edge runtime can't use src/lib/session.ts's
// Node `crypto`). Returns lowercased role if valid + unexpired, else null.
async function sessionRole(token?: string): Promise<string | null> {
  if (!token || !SESSION_SECRET) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expect = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  if (toB64u(expect) !== sig) return null;
  try {
    const p = JSON.parse(fromB64u(body));
    if (typeof p.iat === 'number' && Date.now() - p.iat > SESSION_MAX_AGE_MS) return null;
    return String(p.role || '').trim().toLowerCase();
  } catch {
    return null;
  }
}

// Subdomains that are NOT tenant slugs — existing aliases (hotel., lumea.) and
// infrastructure names keep resolving to the home tenant when the apex domain
// is set (without this, setting NEXT_PUBLIC_APEX_DOMAIN=fountainbd.com would
// turn hotel.fountainbd.com into an unknown-tenant 404).
const RESERVED_SUBDOMAINS = new Set(['www', 'hotel', 'lumea', 'app', 'api', 'mail', 'admin']);

function extractSlug(host: string): string {
  const hostname = host.split(':')[0];
  if (hostname.endsWith(`.${APEX_DOMAIN}`)) {
    const subdomain = hostname.slice(0, hostname.length - APEX_DOMAIN.length - 1);
    if (subdomain && !subdomain.includes('.') && !RESERVED_SUBDOMAINS.has(subdomain)) return subdomain;
  }
  return DEFAULT_SLUG;
}

const LUMEA_MARKETING_HOSTS = new Set([
  'lumea.fountainbd.com',
  'www.lumea.fountainbd.com',
]);

// Hosts whose public pages may be indexed. Everything else — tenant subdomains
// (<slug>.lumea.fountainbd.com), preview aliases (*.vercel.app), and made-up
// subdomains that the wildcard now happily resolves — serves the SAME static
// marketing site, so without this they are duplicate content competing with the
// canonical fountainbd.com. The per-page `alternates.canonical` is only a hint;
// X-Robots-Tag: noindex is the directive crawlers must honour.
// NOT a security control — the tenant gate is getTenantFromHeaders() (404s
// unknown slugs at the API layer). This is purely an SEO measure, and it stays
// header-based on purpose: a 404 here would need a tenant lookup at the edge on
// every public request, forcing dynamic SSR and undoing the static-render win.
// Apex only. www.fountainbd.com and hotel.fountainbd.com are intentionally absent:
// both 301 to the apex in middleware() before rendering, so they never need
// indexing. Any request that slips through (shouldn't) is then noindexed by
// isIndexable() — belt and suspenders.
const INDEXABLE_HOSTS = new Set([
  'fountainbd.com',
]);

// The Lumea marketing hosts are indexable ONLY at "/" — the one path the rewrite below
// turns into the Lumea product page. Every OTHER path on them (/rooms, /services, /faq …)
// falls through to the Hotel Fountain marketing site verbatim, so it is duplicate content
// and must stay noindexed. Host-level allowlisting would leak exactly what this suppresses.
function isIndexable(hostname: string, pathname: string): boolean {
  if (LUMEA_MARKETING_HOSTS.has(hostname)) return pathname === '/';
  return INDEXABLE_HOSTS.has(hostname);
}

// Per-request CSP for SSR pages. 'self' covers Next chunks + same-origin Vercel
// analytics; the nonce covers every inline script (Next hydration, JSON-LD, SW,
// Vercel's inline init). No 'strict-dynamic' so same-origin third-party stays simple.
function buildCsp(nonce: string): string {
  // next dev serves eval-wrapped chunks (source maps / HMR); without 'unsafe-eval' the
  // CSP throws EvalError before React boots and NO page hydrates locally. Dev only —
  // production keeps the strict policy.
  const devEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  // An unset NEXT_PUBLIC_SUPABASE_URL must not emit bare "https://" — browsers reject the
  // whole source as invalid and log console errors on every page.
  const supabaseSrc = SUPABASE_HOST ? ` https://${SUPABASE_HOST} wss://${SUPABASE_HOST}` : '';
  return [
    "default-src 'self'",
    // static.cloudflareinsights.com: fountainbd.com is Cloudflare-proxied and CF auto-injects
    // its RUM beacon <script> into EVERY proxied HTML response (strict pages included).
    `script-src 'self' 'nonce-${nonce}'${devEval} https://connect.facebook.net https://www.googletagmanager.com https://cdn.cookiehub.eu https://static.cloudflareinsights.com`,
    // cdn.cookiehub.eu: the CookieHub loader injects its own stylesheet (c2/css/*.css).
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com https://cdn.cookiehub.eu",
    "font-src 'self' data: fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    // google-analytics wildcards cover GA4's regional collect endpoints (region1. etc.)
    // cloudflareinsights.com: the CF beacon POSTs its RUM payload to /cdn-cgi/rum there.
    `connect-src 'self'${supabaseSrc} https://api.brevo.com https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://*.cookiehub.eu https://*.cookiehub.net https://cloudflareinsights.com`,
    "frame-src 'self' https://www.google.com https://www.facebook.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://www.facebook.com",
    "frame-ancestors 'none'",
  ].join('; ');
}

// Static CSP for the PUBLIC marketing pages. Identical to buildCsp() except script-src uses
// 'unsafe-inline' instead of a per-request nonce — so these routes can be STATICALLY rendered
// (a nonce forces dynamic SSR and inflates TTFB). Our own inline scripts (GA, CookieHub, SW
// register) live in app/(site)/layout.tsx and rely on this; Next's own inline hydration scripts
// (which cannot be hashed) are covered too. These pages carry no auth, PII, or reflected user
// input, so inline-script XSS exposure is minimal. All authed/staff surfaces stay on buildCsp().
function buildStaticCsp(): string {
  const devEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  const supabaseSrc = SUPABASE_HOST ? ` https://${SUPABASE_HOST} wss://${SUPABASE_HOST}` : '';
  return [
    "default-src 'self'",
    // static.cloudflareinsights.com: CF-proxied HTML gets the RUM beacon auto-injected.
    `script-src 'self' 'unsafe-inline'${devEval} https://connect.facebook.net https://www.googletagmanager.com https://cdn.cookiehub.eu https://static.cloudflareinsights.com`,
    // cdn.cookiehub.eu: the CookieHub loader injects its own stylesheet (c2/css/*.css).
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com https://cdn.cookiehub.eu",
    "font-src 'self' data: fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    // cloudflareinsights.com: the CF beacon POSTs its RUM payload to /cdn-cgi/rum there.
    `connect-src 'self'${supabaseSrc} https://api.brevo.com https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://*.cookiehub.eu https://*.cookiehub.net https://cloudflareinsights.com`,
    "frame-src 'self' https://www.google.com https://www.facebook.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://www.facebook.com",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];
  const slug = extractSlug(host);

  // ── Host canonicalization: www + hotel → apex (SEO) ──────────────────────────
  // fountainbd.com, www.fountainbd.com and hotel.fountainbd.com all served 200
  // with identical content, while every per-page alternates.canonical + sitemap.ts
  // use the bare apex. Multiple live origins with no redirect is the exact trigger
  // for GSC "Duplicate without user-selected canonical". A permanent 301 collapses
  // them to ONE indexable origin. Scoped to the marketing aliases only — the Lumea
  // marketing host (www.lumea.fountainbd.com) is handled by its own rewrite below
  // and must NOT be caught here.
  if (hostname === 'www.fountainbd.com' || hostname === 'hotel.fountainbd.com') {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.hostname = 'fountainbd.com';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  // ── EDGE 404 — route allowlist (2026-07-31) ─────────────────────────────────
  // Scanner bots probe hundreds of INVENTED paths (a careers scraper alone hit 123
  // distinct ones: /jobs, /praca, /saiyou, /carriere…). Every miss used to render
  // Next's not-found page = one PAGE-function invocation — waves of these saturated
  // the page lambda and queued STAFF page loads at a flat ~20s while /api/* stayed
  // fast (APIs are edge-403'd for bots). Path-Deny firewall rules can't keep up with
  // arbitrary paths, so instead: any path that is not a KNOWN route gets a tiny 404
  // straight from the edge — zero function invocations, robust to any invented path.
  // MAINTENANCE: add new top-level routes/public files here when created, or they
  // will 404 (the x-edge-404 header makes that easy to spot in DevTools).
  {
    const P = request.nextUrl.pathname;
    const EDGE_EXACT = new Set([
      '/', '/index.html', '/landing', '/crm.html', '/manifest.webmanifest', '/sw.js',
      '/robots.txt', '/sitemap.xml', '/widget.js', '/crm-boot.js', '/crm-bundle.js',
      '/crm-config.js', '/crm-src.jsx', '/favicon.ico', '/__probe',
      '/apqanhrpmfkq6pzdr6j35p7jptlot7.html', // Facebook domain verification
      '/vibe-prospect-report.html',
    ]);
    const EDGE_PREFIXES = [
      '/api', '/crm', '/admin', '/billing', '/chat', '/invoice', '/lumea', '/settings',
      '/rooms', '/services', '/contact', '/faq',
      '/_next', '/_vercel', '/icons', '/images', '/logo', '/vendor', '/.well-known', '/cdn-cgi',
    ];
    const known =
      EDGE_EXACT.has(P) ||
      EDGE_PREFIXES.some((pre) => P === pre || P.startsWith(pre + '/'));
    if (!known) {
      return new NextResponse('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'x-edge-404': '1', 'x-robots-tag': 'noindex' },
      });
    }
  }

  // ── CRM perimeter gate (deny-only; allowed requests fall through to CSP/tenant logic) ──
  const gatePath = request.nextUrl.pathname;
  if ((gatePath.startsWith('/crm') || gatePath.startsWith('/api/crm')) && !AUTH_EXEMPT.has(gatePath)) {
    const perim = await tenantPerimeter(slug, event); // per-tenant override, deployment defaults on miss
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    if (!perim.ips.includes(ip)) {
      const role = await sessionRole(request.cookies.get(SESSION_COOKIE)?.value);
      if (!role || !perim.roles.has(role)) {
        if (gatePath.startsWith('/api/')) {
          return NextResponse.json({ error: 'Access restricted to the hotel network.' }, { status: 403 });
        }
        // Let the bare /crm shell render so the login screen still appears off-site (admins sign in there);
        // bounce deeper pages back to it. Data stays protected by the /api/crm 403 above.
        if (gatePath !== '/crm') return NextResponse.redirect(new URL('/crm', request.url));
      }
    }
  }
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();
  // /crm.html keeps its own static CSP from next.config.mjs (scripts all external).
  const isCrmHtml = pathname === '/crm.html';
  // Authed/staff surfaces get the strict per-request nonce CSP (forces dynamic SSR — required so
  // Next can nonce its inline hydration scripts). Everything else = the PUBLIC marketing pages,
  // which get a static 'unsafe-inline' CSP so they can be statically rendered (low TTFB). The
  // strict layouts (crm/admin/lumea/settings) also carry `export const dynamic='force-dynamic'`
  // so they never static-render and lose their nonce.
  const STRICT_PREFIXES = ['/crm', '/api', '/admin', '/lumea', '/settings', '/billing', '/invoice'];
  const isStrict = STRICT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const nonce = btoa(crypto.randomUUID());
  const csp = isStrict ? buildCsp(nonce) : buildStaticCsp();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-slug', slug);
  requestHeaders.set('x-request-id', requestId);
  if (!isCrmHtml) {
    if (isStrict) requestHeaders.set('x-nonce', nonce); // Next reads x-nonce + CSP to nonce its scripts
    requestHeaders.set('content-security-policy', csp);
  }
  // Non-canonical host (or a non-product path on a Lumea host) → don't index this copy.
  const noindex = !isIndexable(hostname, pathname);
  if (LUMEA_MARKETING_HOSTS.has(hostname) && pathname === '/') {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = '/lumea';
    const response = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
    response.headers.set('x-tenant-slug', slug);
    response.headers.set('x-lumea-marketing', '1');
    response.headers.set('x-request-id', requestId);
    if (noindex) response.headers.set('x-robots-tag', 'noindex, nofollow');
    if (!isCrmHtml) response.headers.set('content-security-policy', csp);
    return response;
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-tenant-slug', slug);
  response.headers.set('x-request-id', requestId);
  if (noindex) response.headers.set('x-robots-tag', 'noindex, nofollow');
  if (!isCrmHtml) response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    // .well-known/workflow/ excluded: Workflow SDK internal resume/queue endpoints
    // must not pass through the CSP/perimeter middleware or runs stall.
    '/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
