// =============================================================================
// Server-side Supabase helpers.
//
// Audit 2026-08-15, S-1b. This module used NEXT_PUBLIC_SUPABASE_ANON_KEY, but its
// only importers are app/api/orchestrate/route.ts and app/api/hardware-check/
// route.ts — both server routes. So it was reaching tenant-isolated tables as the
// browser role for no reason, and `leads` is one of the tables whose
// tenant_isolation policy resolves through the caller-supplied x-tenant-host
// header. Switched to the service role, behind a server-only guard.
//
// Two consequences worth stating:
//   - insertLead() was almost certainly FAILING before. The tenant_isolation
//     policy on `leads` has a null WITH CHECK, so Postgres applies USING to the
//     insert: tenant_id = current_tenant_id(). A server call sends no
//     x-tenant-host, so current_tenant_id() was NULL and the check could not pass.
//   - service_role bypasses RLS, so nothing would stop an insert with a NULL
//     tenant_id — an orphan row. Every write here goes through tenantScoped,
//     which stamps tenant_id after spreading the caller values.
// =============================================================================
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { tenantClient, tenantScoped } from "@/lib/tenantDb";
import type { Lead, Transaction, Reservation, DashboardNotification, AuthorizedDevice } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || "46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8";

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error(
      "[services/supabase] This module runs on the service role and must never be " +
      "imported into a client component. Use @/lib/supabase/client in the browser."
    );
  }
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  assertServer();
  if (_client) return _client;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  _client = tenantClient(TENANT);
  return _client;
}

// Tenant-scoped wrapper: every select/update/delete carries .eq(tenant_id), every
// insert is stamped with it AFTER the caller values, so a payload cannot spoof it.
function db() {
  return tenantScoped(getClient(), TENANT);
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return Reflect.get(getClient(), prop);
  },
});

// tenantScoped's insert takes `Record<string, unknown>` so it can spread the caller's
// values and stamp tenant_id last. A plain interface has no index signature and is not
// assignable to that, hence the widening here — it is a typing formality, not a cast away
// from a real check: stamp() still applies tenant_id after these fields.
export async function insertLead(lead: Lead) {
  const { data, error } = await db().from("leads").insert([{ ...lead } as Record<string, unknown>]).select().single();
  if (error) throw error;
  return data;
}

export async function getLeadByEmail(email: string) {
  const { data, error } = await db().from("leads").select("*").eq("email", email).single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function insertTransaction(transaction: Transaction) {
  const { data, error } = await db().from("transactions").insert([{ ...transaction } as Record<string, unknown>]).select().single();
  if (error) throw error;
  return data;
}

// ─── Reservation Requests ─────────────────────────────────────────────────────

export async function insertReservation(reservation: Omit<Reservation, 'id' | 'created_at'>) {
  const { data, error } = await getClient().from('reservation_requests').insert([reservation]).select().single();
  if (error) throw error;
  return data as Reservation;
}

export async function getReservationById(id: string) {
  const { data, error } = await getClient().from('reservation_requests').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Reservation;
}

export async function updateReservation(id: string, updates: Partial<Reservation>) {
  const { data, error } = await getClient().from('reservation_requests').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as Reservation;
}

export async function getAllReservations(): Promise<Reservation[]> {
  const { data, error } = await getClient().from('reservation_requests').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Reservation[];
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function insertNotification(notification: Omit<DashboardNotification, 'id' | 'created_at'>) {
  const { data, error } = await getClient().from('notifications').insert([notification]).select().single();
  if (error) throw error;
  return data as DashboardNotification;
}

export async function getUnreadNotifications(): Promise<DashboardNotification[]> {
  const { data, error } = await getClient().from('notifications').select('*').eq('is_read', false).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DashboardNotification[];
}

export async function getAllNotifications(): Promise<DashboardNotification[]> {
  const { data, error } = await getClient().from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as DashboardNotification[];
}

export async function markNotificationRead(id: string) {
  const { error } = await getClient().from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await getClient().from('notifications').update({ is_read: true }).eq('is_read', false);
  if (error) throw error;
}

// ─── Hardware / Authorised Devices ────────────────────────────────────────────

export async function checkDeviceAuthorised(macAddress: string | null, motherboardUUID: string | null): Promise<AuthorizedDevice | null> {
  const conditions: string[] = [];
  if (macAddress) conditions.push(`mac_address.eq.${macAddress}`);
  if (motherboardUUID) conditions.push(`motherboard_uuid.eq.${motherboardUUID}`);
  if (conditions.length === 0) return null;
  const { data, error } = await db().from('authorized_devices').select('*').eq('is_authorized', true).or(conditions.join(',')).limit(1).maybeSingle();
  if (error) throw error;
  return data as AuthorizedDevice | null;
}

export async function registerDevice(device: Omit<AuthorizedDevice, 'id' | 'created_at'>) {
  const { data, error } = await db().from('authorized_devices').insert([device]).select().single();
  if (error) throw error;
  return data as AuthorizedDevice;
}
