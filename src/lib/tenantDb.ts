// ─────────────────────────────────────────────────────────────────────────────
// Lumea — tenant-scoped Supabase query wrapper (Phase A, G8 option 1)
//
// The CRM API routes run on the SERVICE ROLE, which bypasses RLS. Isolation
// therefore depends on every query carrying `.eq('tenant_id', TENANT)` — one
// forgotten filter is a silent cross-tenant leak. This wrapper makes the
// filter structural:
//
//   const db = tenantScoped(supabase, TENANT);
//   await db.from('guests').select('*');                 // auto .eq('tenant_id', TENANT)
//   await db.from('guests').update(p).eq('id', id);      // auto-scoped, chainable
//   await db.from('guests').insert(payload);             // tenant_id stamped LAST (spoof-proof)
//
// Rules:
// - select/update/delete return the normal PostgREST filter builder with the
//   tenant filter already applied — all further chaining (.eq/.order/.limit/
//   .single/.select-after-insert) works unchanged.
// - insert/upsert stamp `tenant_id` onto every row AFTER spreading the caller's
//   values, so a client-supplied tenant_id can never win.
// - Only use this for tables that HAVE tenant_id (all 18 tenant-isolated
//   tables). The `tenants` registry itself and RPC calls go through the raw
//   client on purpose.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintTenantJwt } from './tenantJwt';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SB_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Flag-gated client for the service-role→JWT switch. TENANT_JWT_MODE=on (plus
// SUPABASE_JWT_SECRET) → a crm_tenant-role client that CANNOT bypass RLS; any
// other state → the plain service-role client, byte-identical to the status
// quo. Rehearse on a Vercel PREVIEW env before enabling in production.
export function tenantClient(tenantId: string): SupabaseClient {
  if (process.env.TENANT_JWT_MODE === 'on') {
    const jwt = mintTenantJwt(tenantId);
    if (jwt && SB_ANON_KEY) {
      return createClient(SB_URL, SB_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
    }
    console.warn('[tenantDb] TENANT_JWT_MODE=on but SUPABASE_JWT_SECRET or anon key missing — using service role');
  }
  return createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Row = Record<string, unknown>;

function stamp(values: Row | Row[], tenantId: string): Row | Row[] {
  return Array.isArray(values)
    ? values.map(v => ({ ...v, tenant_id: tenantId }))
    : { ...values, tenant_id: tenantId };
}

export function tenantScoped(sb: SupabaseClient, tenantId: string) {
  return {
    from(table: string) {
      // Row payloads stay `any`, matching the untyped `supabase: any` clients these
      // routes used before the wrapper — runtime-string select() columns otherwise
      // resolve rows to supabase-js's GenericStringError and break the build.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qb = () => sb.from(table) as any;
      return {
        select: (columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) =>
          qb().select(columns ?? '*', options).eq('tenant_id', tenantId),
        update: (values: Row) =>
          qb().update(values).eq('tenant_id', tenantId),
        delete: () =>
          qb().delete().eq('tenant_id', tenantId),
        insert: (values: Row | Row[]) =>
          qb().insert(stamp(values, tenantId)),
        upsert: (values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
          qb().upsert(stamp(values, tenantId), options),
      };
    },
  };
}

export type TenantDb = ReturnType<typeof tenantScoped>;
