// ─────────────────────────────────────────────────────────────────────────────
// Lumea — Subdomain Tenant Routing Middleware
//
// Runs on every request (Edge Runtime). Extracts the subdomain from the host
// header and forwards it as x-tenant-slug. No DB call here — kept fast.
//
// Routing:
//   grandpalace.lumea.app   →  x-tenant-slug: grandpalace
//   hotelfountainbd.lumea.app → x-tenant-slug: hotelfountainbd
//   localhost:3000            → x-tenant-slug: NEXT_PUBLIC_TENANT_SLUG || 'hotelfountainbd'
//   *.vercel.app              → x-tenant-slug: NEXT_PUBLIC_TENANT_SLUG || 'hotelfountainbd'
//
// API routes and server components call getTenantBySlug(slug) from src/lib/tenant.ts
// to resolve the full TenantConfig from Supabase (cached per process, 60s TTL).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Production apex domain — subdomains of this are valid tenant slugs
const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || 'lumea.app';

// Fallback slug for local dev and Vercel preview URLs
const DEFAULT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'hotelfountainbd';

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

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];
  const slug = extractSlug(host);
  const { pathname } = request.nextUrl;

  // Per-request correlation id — consumed by src/lib/audit.ts withAudit().
  const requestId = crypto.randomUUID();

  if (LUMEA_MARKETING_HOSTS.has(hostname) && pathname === '/') {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = '/lumea';
    const response = NextResponse.rewrite(rewritten);
    response.headers.set('x-tenant-slug', slug);
    response.headers.set('x-lumea-marketing', '1');
    response.headers.set('x-request-id', requestId);
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', slug);
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
