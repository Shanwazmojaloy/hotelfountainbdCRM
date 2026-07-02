// ─────────────────────────────────────────────────────────────────────────────
// Lumea — per-tenant PostgREST JWT minting (service-role→JWT switch, client half)
//
// Mints a short-lived HS256 JWT { role: 'crm_tenant', app_tenant_id } signed
// with the project's legacy JWT secret. PostgREST switches to the crm_tenant
// role (granted to authenticator, migration 20260702_crm_tenant_role.sql) and
// RLS scopes every query via current_tenant_id()'s claim branch — unlike the
// service role, this client CANNOT bypass RLS.
//
// Requires SUPABASE_JWT_SECRET in env (Supabase Dashboard → Settings → API →
// JWT Settings). Returns null when absent — callers fall back to the service
// role, so this module is inert until the secret is provisioned.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';

const TTL_S = 600;            // 10-minute tokens
const REFRESH_MARGIN_S = 120; // re-mint when <2 min left

const jwtCache = new Map<string, { jwt: string; exp: number }>();

// Sanity-check the configured secret ONCE per process: the legacy anon and
// service-role keys are HS256 JWTs signed with the same legacy project secret.
// If our secret can't reproduce the signature of ANY JWT-shaped key in env
// (anon keys may be new-format sb_publishable_* with nothing to check), it's
// the WRONG value — minting would only produce PostgREST 401s (PGRST301).
// Fail loud in logs, fall back to the service role.
let secretValidated: boolean | null = null;
function secretVerifiesProjectKeys(secret: string): boolean {
  if (secretValidated !== null) return secretValidated;
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  ].filter((k): k is string => !!k && k.split('.').length === 3);
  if (candidates.length === 0) {
    console.warn('[tenantJwt] no legacy-JWT-shaped project key in env to validate SUPABASE_JWT_SECRET against — proceeding unverified');
    secretValidated = true;
    return true;
  }
  secretValidated = candidates.some((key) => {
    const parts = key.split('.');
    const expect = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    return expect === parts[2];
  });
  if (!secretValidated) {
    console.error(`[tenantJwt] SUPABASE_JWT_SECRET does NOT verify any of ${candidates.length} legacy project key signature(s) — wrong secret value (need the LEGACY JWT secret: Supabase Dashboard → Settings → API → JWT Settings → "JWT Secret"). Falling back to service role.`);
  } else {
    console.log('[tenantJwt] SUPABASE_JWT_SECRET verified against project key signature — minting enabled');
  }
  return secretValidated;
}

export function mintTenantJwt(tenantId: string): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  if (!secretVerifiesProjectKeys(secret)) return null;

  const now = Math.floor(Date.now() / 1000);
  const hit = jwtCache.get(tenantId);
  if (hit && hit.exp - now > REFRESH_MARGIN_S) return hit.jwt;

  const b64u = (s: string) => Buffer.from(s).toString('base64url');
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = now + TTL_S;
  const payload = b64u(JSON.stringify({
    role: 'crm_tenant',
    app_tenant_id: tenantId,
    iss: 'lumea-crm',
    iat: now,
    exp,
  }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  const jwt = `${header}.${payload}.${sig}`;
  jwtCache.set(tenantId, { jwt, exp });
  return jwt;
}
