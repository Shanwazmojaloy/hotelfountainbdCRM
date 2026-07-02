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

// Sanity-check the configured secret ONCE per process: the anon key is an HS256
// JWT signed with the same legacy project secret, so if our secret can't
// reproduce the anon key's signature, it's the WRONG value (e.g. a new-style
// signing key pasted instead of the legacy JWT secret) — minting would only
// produce PostgREST 401s. Fail loud in logs, fall back to the service role.
let secretValidated: boolean | null = null;
function secretVerifiesAnonKey(secret: string): boolean {
  if (secretValidated !== null) return secretValidated;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const parts = anon.split('.');
  if (parts.length !== 3) {
    // No anon key to check against — assume the secret is fine.
    secretValidated = true;
    return true;
  }
  const expect = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  secretValidated = expect === parts[2];
  if (!secretValidated) {
    console.error('[tenantJwt] SUPABASE_JWT_SECRET does NOT verify the anon key signature — wrong secret value (need the LEGACY JWT secret from Supabase Dashboard → Settings → API → JWT Settings). Falling back to service role.');
  }
  return secretValidated;
}

export function mintTenantJwt(tenantId: string): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  if (!secretVerifiesAnonKey(secret)) return null;

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
