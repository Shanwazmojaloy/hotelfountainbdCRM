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

export function mintTenantJwt(tenantId: string): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

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
