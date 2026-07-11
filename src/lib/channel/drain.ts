// [Hotel-CRM] Channel Manager Phase 2 - queue drainer (shared lib)
// Used by /api/channel/drain (daily cron sweep) and called inline by the
// webhook route after each inbound booking (crons are daily-only, so
// real-time outbound pushes ride on webhook traffic).
//
// Dispatch matrix:
//   outbound availability_update -> adapter.pushAvailability
//   outbound overbook_alert      -> owner email (ALERT_EMAIL)
//   inbound  booking_created     -> fn_guard_and_book retry path (idempotent)
//   inbound  booking_modified/cancelled -> fail UNHANDLED_EVENT (Phase 3)

import { createClient } from '@supabase/supabase-js';
import { getAdapter, type ChannelAccountRow } from './adapter';
import { isMailConfigured, sendMail } from '@/lib/mailer';

export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

interface QueueItem {
  id: string;
  tenant_id: string;
  channel_account_id: string | null;
  direction: 'inbound' | 'outbound';
  event_type: string;
  external_event_id: string | null;
  reservation_id: string | null;
  payload: Record<string, any>;
  attempts: number;
}

export interface DrainReport {
  claimed: number;
  done: number;
  failed: number;
  errors: string[];
}

async function loadAccount(
  db: ReturnType<typeof serviceClient>,
  id: string | null
): Promise<ChannelAccountRow | null> {
  if (!id) return null;
  const { data } = await db.from('channel_accounts').select('*').eq('id', id).single();
  return (data as ChannelAccountRow) || null;
}

async function handleItem(
  db: ReturnType<typeof serviceClient>,
  item: QueueItem
): Promise<{ ok: boolean; error?: string }> {
  if (item.direction === 'outbound' && item.event_type === 'availability_update') {
    const account = await loadAccount(db, item.channel_account_id);
    if (!account) return { ok: false, error: 'ACCOUNT_NOT_FOUND' };
    if (account.status !== 'active') return { ok: true }; // paused channel: drop silently
    const adapter = getAdapter(account.provider);
    if (!adapter) return { ok: false, error: `NO_ADAPTER: ${account.provider}` };

    // Absolute free-unit counts from the ledger (the single availability
    // truth) - pushes are idempotent snapshots, never deltas.
    const { data: cells, error: cellErr } = await db
      .from('inventory_ledger')
      .select('stay_date,total_units,booked_units')
      .eq('tenant_id', item.tenant_id)
      .eq('category', item.payload.category)
      .gte('stay_date', item.payload.from)
      .lt('stay_date', item.payload.to)
      .order('stay_date');
    if (cellErr) return { ok: false, error: `LEDGER_READ: ${cellErr.message}` };

    const counts = (cells || []).map((c: any) => ({
      date: c.stay_date,
      available: Math.max(0, (c.total_units || 0) - (c.booked_units || 0)),
    }));

    return adapter.pushAvailability(
      { category: item.payload.category, from: item.payload.from, to: item.payload.to, counts },
      account
    );
  }

  if (item.direction === 'outbound' && item.event_type === 'overbook_alert') {
    if (!isMailConfigured()) return { ok: false, error: 'MAIL_NOT_CONFIGURED' };
    const p = item.payload;
    await sendMail({
      to: process.env.ALERT_EMAIL || 'ahmedshanwaz5@gmail.com',
      subject: `OVERBOOK ALERT: ${p.category} on ${p.stay_date} (${p.booked}/${p.total})`,
      text:
        `Nightly reconciliation found an overbooked cell.\n\n` +
        `Category:  ${p.category}\n` +
        `Stay date: ${p.stay_date}\n` +
        `Booked:    ${p.booked} of ${p.total} rooms\n\n` +
        `Action: review reservations for that date in the Room Matrix and relocate or contact the guest.`,
    });
    return { ok: true };
  }

  if (item.direction === 'inbound' && item.event_type === 'booking_created') {
    // Retry path for bookings that failed inline processing.
    // fn_guard_and_book is idempotent on external_booking_id.
    const p = item.payload;
    const { error } = await db.rpc('fn_guard_and_book', {
      p_channel_account_id: item.channel_account_id,
      p_external_booking_id: String(p.booking_id),
      p_category: String(p.category),
      p_check_in: String(p.check_in),
      p_check_out: String(p.check_out),
      p_guest_name: String(p.guest_name || ''),
      p_phone: p.phone || null,
      p_email: p.email || null,
      p_total_amount: Number(p.total_amount || 0),
      p_commission_pct: Number(p.commission_pct || 0),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // booking_modified / booking_cancelled: Phase 3. Fail so it surfaces
  // (goes dead after max_attempts and stays visible for manual review).
  return { ok: false, error: `UNHANDLED_EVENT: ${item.direction}/${item.event_type}` };
}

export async function drainOnce(limit = 10): Promise<DrainReport> {
  const db = serviceClient();
  const report: DrainReport = { claimed: 0, done: 0, failed: 0, errors: [] };

  const { data: items, error: claimErr } = await db.rpc('fn_sync_queue_claim', {
    p_limit: limit,
  });
  if (claimErr) {
    report.errors.push(`claim: ${claimErr.message}`);
    return report;
  }

  const batch = (items || []) as QueueItem[];
  report.claimed = batch.length;

  for (const item of batch) {
    let ok = false;
    let err: string | undefined;
    try {
      const res = await handleItem(db, item);
      ok = res.ok;
      err = res.error;
    } catch (e: any) {
      ok = false;
      err = e?.message || String(e);
    }
    const { error: doneErr } = await db.rpc('fn_sync_queue_complete', {
      p_id: item.id,
      p_ok: ok,
      p_error: err ?? null,
    });
    if (doneErr) report.errors.push(`complete ${item.id}: ${doneErr.message}`);
    if (ok) report.done += 1;
    else {
      report.failed += 1;
      if (err) report.errors.push(`${item.event_type} ${item.id}: ${err}`);
    }
  }
  return report;
}
