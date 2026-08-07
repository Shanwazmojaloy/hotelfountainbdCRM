// ─────────────────────────────────────────────────────────────────────────────
// Lumea — per-tenant feature flags (owner-approved 2026-08-07)
//
// Pairs with migration `tenant_feature_flags` (tenants.feature_flags jsonb).
// The deliberate ALTERNATIVE to Vercel Flags: zero per-request SDK cost on a
// Hobby account, no third-party service, and flags live where tenancy already
// lives. Gate a feature per tenant with a single UPDATE:
//
//   UPDATE tenants SET feature_flags = feature_flags || '{"pos_phase2": true}'
//   WHERE slug = 'lumeademo';
//
// Usage in an API route (server-side gate — the authoritative check):
//   import { tenantFlag } from '@/lib/featureFlags';
//   if (!(await tenantFlag(TENANT, 'pos_phase2'))) {
//     return NextResponse.json({ error: 'Not enabled.' }, { status: 404 });
//   }
//
// FAIL-CLOSED by design (opposite of aiBudget): flags gate NEW/unfinished
// features, so a missing column, DB hiccup, or unknown key must read as OFF —
// an outage can hide a new feature but can never expose one.
// 60s per-instance cache (same rationale as the /api/crm/data session cache):
// flag flips propagate within a minute; no hot-path DB cost.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const HOME_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const TTL_MS = 60_000;
const cache = new Map<string, { flags: Record<string, unknown>; ts: number }>();

function svc() {
  return createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** All flags for a tenant ({} on any failure — fail-closed). Cached 60s per instance. */
export async function tenantFlags(tenantId: string = HOME_TENANT): Promise<Record<string, unknown>> {
  if (!SB_SERVICE_KEY) return {};
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.flags;
  try {
    const { data, error } = await svc().from('tenants').select('feature_flags').eq('id', tenantId).limit(1);
    if (error) return hit?.flags ?? {}; // column missing / DB error → stale-or-off, never throw
    const flags = (data?.[0]?.feature_flags ?? {}) as Record<string, unknown>;
    if (cache.size > 100) cache.clear(); // tiny tenant count; hard cap just in case
    cache.set(tenantId, { flags, ts: Date.now() });
    return flags;
  } catch {
    return hit?.flags ?? {};
  }
}

/** True only when the flag is EXPLICITLY truthy for the tenant. Unknown key = false. */
export async function tenantFlag(tenantId: string = HOME_TENANT, key: string): Promise<boolean> {
  const flags = await tenantFlags(tenantId);
  return flags[key] === true;
}
