import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Lead, Transaction } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  if (!url || !key) {
    throw new Error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  // Server-only callers (leads page, orchestrate webhook) always operate on the
  // home tenant. Send a canonical x-tenant-host so RLS resolves without the
  // removed current_tenant_id() fallback. TODO(multi-tenant): derive per-request.
  _client = createClient(url, key, {
    global: { headers: { 'x-tenant-host': process.env.NEXT_PUBLIC_TENANT_HOST || 'hotelfountainbd.com' } },
  });
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return Reflect.get(getClient(), prop);
  },
});

export async function insertLead(lead: Lead) {
  const { data, error } = await getClient().from("leads").insert([lead]).select().single();
  if (error) throw error;
  return data;
}

export async function getLeadByEmail(email: string) {
  const { data, error } = await getClient().from("leads").select("*").eq("email", email).single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function insertTransaction(transaction: Transaction) {
  const { data, error } = await getClient().from("transactions").insert([transaction]).select().single();
  if (error) throw error;
  return data;
}
