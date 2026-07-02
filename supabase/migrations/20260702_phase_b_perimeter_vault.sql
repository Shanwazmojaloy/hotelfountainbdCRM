-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Phase B: per-tenant perimeter config + Vault-backed secrets +
-- claim-aware tenant resolution. Migration: 20260702_phase_b_perimeter_vault.sql
--
-- Applied to prod 2026-07-02 via MCP. All three pieces are INERT for the live
-- tenant until used:
--   - office_ips/remote_roles NULL → middleware falls back to deployment defaults
--   - Vault holds no tenant secrets yet → reader overlay is a no-op
--   - No JWT carries app_tenant_id yet → claim branch resolves NULL
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── B1. Per-tenant perimeter config ─────────────────────────────────────────
-- NULL/empty = use the deployment defaults hardcoded in middleware.ts.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS office_ips   TEXT[];
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS remote_roles TEXT[];

-- ── B2. Vault-backed tenant secrets ─────────────────────────────────────────
-- Secret names are 'tenant:{uuid}:{key}' (uuid has no colons; keys are fixed
-- identifiers like brevo_api_key). Service-role-only access via RPCs.

CREATE OR REPLACE FUNCTION public.tenant_secret_set(p_tenant_id uuid, p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_name text := 'tenant:' || p_tenant_id || ':' || p_key;
  v_id   uuid;
BEGIN
  IF p_key !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid secret key %', p_key;
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, v_name);
  ELSE
    PERFORM vault.update_secret(v_id, p_value);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_secrets_get(p_tenant_id uuid)
RETURNS TABLE(key text, value text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
  SELECT split_part(name, ':', 3), decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name LIKE 'tenant:' || p_tenant_id || ':%';
$$;

REVOKE ALL ON FUNCTION public.tenant_secret_set(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_secrets_get(uuid)            FROM PUBLIC, anon, authenticated;

-- ── B3. Claim-aware current_tenant_id() ─────────────────────────────────────
-- Preserves the LIVE prod definition (GUC → tenant_users → owner_id; legacy
-- fallback already removed) and inserts a JWT-claim branch after the GUC so a
-- minted per-tenant JWT can carry tenant context through PostgREST when the
-- CRM later moves off the RLS-bypassing service role (runbook step 3).
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  select coalesce(
    nullif(current_setting('app.current_tenant_id', true), '')::uuid,
    nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'app_tenant_id', '')::uuid,
    (select tu.tenant_id from public.tenant_users tu where tu.user_id = auth.uid() limit 1),
    (select t.id from public.tenants t where t.owner_id = auth.uid() limit 1)
  );
$$;

COMMIT;

-- ✓ EXPECT: perimeter columns NULL on the live tenant; both RPCs exist; anon
--   still resolves current_tenant_id() the same as before this migration.
