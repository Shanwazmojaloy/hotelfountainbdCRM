import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Lead, Transaction, Reservation, DashboardNotification, AuthorizedDevice } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  if (!url || !key) {
    throw new Error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  _client = createClient(url, key);
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
  const { data, error } = await getClient().from('authorized_devices').select('*').eq('is_authorized', true).or(conditions.join(',')).limit(1).maybeSingle();
  if (error) throw error;
  return data as AuthorizedDevice | null;
}

export async function registerDevice(device: Omit<AuthorizedDevice, 'id' | 'created_at'>) {
  const { data, error } = await getClient().from('authorized_devices').insert([device]).select().single();
  if (error) throw error;
  return data as AuthorizedDevice;
}
