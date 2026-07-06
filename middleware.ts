import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
async function tenantPerimeter(slug: string): Promise<Perimeter> {
  const hit = perimCache.get(slug);
  if (hit && Date.now() - hit.ts < 60_000) return hit;
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
  const entry = { ips, roles, ts: Date.now() };
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
    `script-src 'self' 'nonce-${nonce}'${devEval} https://connect.facebook.net https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' data: fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    // google-analytics wildcards cover GA4's regional collect endpoints (region1. etc.)
    `connect-src 'self'${supabaseSrc} https://api.brevo.com https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net`,
    "frame-src 'self' https://www.google.com https://www.facebook.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://www.facebook.com",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];
  const slug = extractSlug(host);

  // ── CRM perimeter gate (deny-only; allowed requests fall through to CSP/tenant logic) ──
  const gatePath = request.nextUrl.pathname;
  if ((gatePath.startsWith('/crm') || gatePath.startsWith('/api/crm')) && !AUTH_EXEMPT.has(gatePath)) {
    const perim = await tenantPerimeter(slug); // per-tenant override, deployment defaults on miss
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
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-slug', slug);
  requestHeaders.set('x-request-id', requestId);
  if (!isCrmHtml) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('content-security-policy', csp); // Next reads this to nonce its own scripts
  }
  if (LUMEA_MARKETING_HOSTS.has(hostname) && pathname === '/') {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = '/lumea';
    const response = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
    response.headers.set('x-tenant-slug', slug);
    response.headers.set('x-lumea-marketing', '1');
    response.headers.set('x-request-id', requestId);
    if (!isCrmHtml) response.headers.set('content-security-policy', csp);
    return response;
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-tenant-slug', slug);
  response.headers.set('x-request-id', requestId);
  if (!isCrmHtml) response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
