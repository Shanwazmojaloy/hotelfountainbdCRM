import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || 'lumea.app';
const DEFAULT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'hotelfountainbd';
const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '');

// ── CRM perimeter gate config ────────────────────────────────────────────────
// On the office IP: any logged-in staff. Off-network: ADMIN-tier sessions only.
// Perimeter only — Supabase RLS + anon-key revoke remain the real data guard.
const OFFICE_IPS = ['103.113.153.228']; // public WAN IP(s); add every ISP line the property uses
const REMOTE_ROLES = new Set(['owner', 'admin']); // who may reach CRM off-site (add 'manager' to widen)
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

function extractSlug(host: string): string {
  const hostname = host.split(':')[0];
  if (hostname.endsWith(`.${APEX_DOMAIN}`)) {
    const subdomain = hostname.slice(0, hostname.length - APEX_DOMAIN.length - 1);
    if (subdomain && subdomain !== 'www') return subdomain;
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
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
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
}

export async function middleware(request: NextRequest) {
  // ── CRM perimeter gate (deny-only; allowed requests fall through to CSP/tenant logic) ──
  const gatePath = request.nextUrl.pathname;
  if ((gatePath.startsWith('/crm') || gatePath.startsWith('/api/crm')) && !AUTH_EXEMPT.has(gatePath)) {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    if (!OFFICE_IPS.includes(ip)) {
      const role = await sessionRole(request.cookies.get(SESSION_COOKIE)?.value);
      if (!role || !REMOTE_ROLES.has(role)) {
        if (gatePath.startsWith('/api/')) {
          return NextResponse.json({ error: 'Access restricted to the hotel network.' }, { status: 403 });
        }
        // Let the bare /crm shell render so the login screen still appears off-site (admins sign in there);
        // bounce deeper pages back to it. Data stays protected by the /api/crm 403 above.
        if (gatePath !== '/crm') return NextResponse.redirect(new URL('/crm', request.url));
      }
    }
  }

  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];
  const slug = extractSlug(host);
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
