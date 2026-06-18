import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || 'lumea.app';
const DEFAULT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'hotelfountainbd';
const SUPABASE_HOST = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '');

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

export function middleware(request: NextRequest) {
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
