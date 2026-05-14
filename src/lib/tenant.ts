// ─────────────────────────────────────────────────────────────────────────────
// Lumea — Tenant Config Resolver
//
// Server-side only. Resolves TenantConfig from Supabase by slug (set by
// middleware.ts via x-tenant-slug header). Uses a module-level in-memory
// cache (60s TTL) to avoid a DB round-trip on every request.
//
// Usage in API routes:
//   import { getTenantFromHeaders } from '@/lib/tenant'
//   const tenant = await getTenantFromHeaders(request.headers)
//   // then use tenant.hotel_name, tenant.brevo_api_key, etc.
//
// Usage in Server Components:
//   import { headers } from 'next/headers'
//   import { getTenantFromHeaders } from '@/lib/tenant'
//   const tenant = await getTenantFromHeaders(await headers())
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TenantConfig {
  id:                   string;
  slug:                 string;
  plan_tier:            'starter' | 'growth' | 'full';
  is_active:            boolean;
  created_at:           string;

  // Hotel identity
  hotel_name:           string;
  hotel_location:       string;
  hotel_address:        string;
  hotel_phone:          string;
  hotel_whatsapp:       string;
  hotel_city:           string;
  hotel_room_count:     number;
  hotel_description:    string;
  hotel_email:          string;
  sender_name:          string;
  alert_email:          string;
  alert_name:           string;

  // Secrets (never sent to client)
  brevo_api_key:        string | null;
  gmail_user:           string | null;
  gmail_app_password:   string | null;
  facebook_page_token:  string | null;
  facebook_page_id:     string | null;
  anthropic_api_key:    string | null;
  cron_secret:          string | null;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
  data: TenantConfig;
  ts:   number;
}

const slugCache = new Map<string, CacheEntry>();
const idCache   = new Map<string, CacheEntry>();

// ── Service-role Supabase client ─────────────────────────────────────────────
// NEVER expose this on the client side.

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[Lumea] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Resolvers ────────────────────────────────────────────────────────────────

export async function getTenantBySlug(slug: string): Promise<TenantConfig | null> {
  const cached = slugCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error(`[Lumea] getTenantBySlug("${slug}") failed:`, error?.message);
    return null;
  }

  const entry = { data: data as TenantConfig, ts: Date.now() };
  slugCache.set(slug, entry);
  idCache.set(data.id, entry);
  return data as TenantConfig;
}

export async function getTenantById(id: string): Promise<TenantConfig | null> {
  const cached = idCache.get(id);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('tenants')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error(`[Lumea] getTenantById("${id}") failed:`, error?.message);
    return null;
  }

  const entry = { data: data as TenantConfig, ts: Date.now() };
  idCache.set(id, entry);
  slugCache.set(data.slug, entry);
  return data as TenantConfig;
}

// ── Primary entry point for API routes & Server Components ───────────────────

export async function getTenantFromHeaders(headers: Headers): Promise<TenantConfig> {
  const slug = headers.get('x-tenant-slug')
    ?? process.env.NEXT_PUBLIC_TENANT_SLUG
    ?? 'hotelfountainbd';

  const tenant = await getTenantBySlug(slug);

  if (!tenant) {
    // Hard fallback: return Hotel Fountain BD config from env vars so the
    // existing deployment never breaks even before the migration runs.
    return buildEnvFallback();
  }

  return tenant;
}

// ── Env-var fallback (backwards compat) ─────────────────────────────────────
// Used when the tenants table doesn't exist yet or slug lookup fails.

function buildEnvFallback(): TenantConfig {
  return {
    id:                  process.env.NEXT_PUBLIC_TENANT_ID   || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8',
    slug:                process.env.NEXT_PUBLIC_TENANT_SLUG || 'hotelfountainbd',
    plan_tier:           'growth',
    is_active:           true,
    created_at:          new Date().toISOString(),
    hotel_name:          process.env.HOTEL_NAME              || 'Hotel Fountain BD',
    hotel_location:      process.env.HOTEL_LOCATION          || 'Nikunja 2 · Dhaka · Airport Corridor',
    hotel_address:       process.env.HOTEL_ADDRESS           || 'House-05, Road-02, Nikunja-02, Dhaka-1229',
    hotel_phone:         process.env.HOTEL_PHONE             || '+880 1322-840799',
    hotel_whatsapp:      process.env.HOTEL_WHATSAPP          || '8801322840799',
    hotel_city:          process.env.HOTEL_CITY              || 'Dhaka',
    hotel_room_count:    parseInt(process.env.HOTEL_ROOM_COUNT || '24'),
    hotel_description:   process.env.HOTEL_DESCRIPTION       || 'Hotel Fountain BD, a boutique 24-room hotel in Nikunja 2, Dhaka',
    hotel_email:         process.env.HOTEL_SENDER_EMAIL      || 'hotellfountainbd@gmail.com',
    sender_name:         process.env.HOTEL_SENDER_NAME       || 'Shan Ahmed — Hotel Fountain BD',
    alert_email:         process.env.ALERT_EMAIL             || 'ahmedshanwaz5@gmail.com',
    alert_name:          process.env.ALERT_NAME              || 'Shan',
    brevo_api_key:       process.env.BREVO_API_KEY           || null,
    gmail_user:          process.env.GMAIL_USER              || null,
    gmail_app_password:  process.env.GMAIL_APP_PASSWORD      || null,
    facebook_page_token: process.env.FACEBOOK_PAGE_TOKEN     || null,
    facebook_page_id:    process.env.FACEBOOK_PAGE_ID        || null,
    anthropic_api_key:   process.env.ANTHROPIC_API_KEY       || null,
    cron_secret:         process.env.CRON_SECRET             || null,
  };
}

// ── Cache invalidation (for admin use) ───────────────────────────────────────

export function invalidateTenantCache(slugOrId: string) {
  slugCache.delete(slugOrId);
  idCache.delete(slugOrId);
}
