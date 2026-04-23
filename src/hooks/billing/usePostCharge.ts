'use client';
// =============================================================================
// usePostCharge
// Mutation for posting a new charge to a reservation's guest_ledger.
//
// Calls the PostgreSQL post_extra_charge() function for taxable charges
// (laundry, minibar, damage, F&B, etc.) so that VAT and SC are attached
// automatically by the DB. For ROOM_CHARGE entries, use useExpandNightlyCharges
// instead.
//
// After a successful insert the DB trigger fn_recalculate_invoice_totals fires
// and updates the invoice totals — useCheckoutBalance will receive the update
// via Realtime without any extra work.
// =============================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { ledgerKeys } from './useGuestLedger';
import { invoiceKeys } from './useCheckoutBalance';
import { isValidBdtAmount, today } from '@/lib/money';
import type { PostChargePayload, GuestLedgerEntry } from '@/types/billing';

// Entry types that are taxable (attract VAT 15% + SC 5%)
const TAXABLE_TYPES = new Set([
  'FOOD_BEVERAGE',
  'MINIBAR',
  'LAUNDRY',
  'SPA',
  'DAMAGE',
  'TRANSPORT',
  'MISCELLANEOUS',
]);

async function postCharge(
  payload: PostChargePayload,
  userId: string
): Promise<GuestLedgerEntry> {
  // Guard: reject float amounts at the edge before they ever reach the DB
  if (!isValidBdtAmount(payload.amount_bdt)) {
    throw new Error(
      `[usePostCharge] amount_bdt must be a positive integer. ` +
      `Received: ${payload.amount_bdt}`
    );
  }

  if (TAXABLE_TYPES.has(payload.entry_type)) {
    // Use the PG function — it extracts net/SC/VAT and inserts three ledger rows atomically
    const { data, error } = await supabase.rpc('post_extra_charge', {
      p_reservation_id: payload.reservation_id,
      p_guest_id:       payload.guest_id,
      p_entry_type:     payload.entry_type,
      p_description:    payload.description,
      p_amount_bdt:     payload.amount_bdt,      // inclusive BDT
      p_date:           payload.transaction_date ?? today(),
      p_posted_by:      userId,
      p_metadata:       payload.metadata ?? {},
    });
    if (error) throw new Error(`[usePostCharge] ${error.message}`);
    // RPC returns the new ledger entry id; fetch the full row
    const { data: row, error: fetchErr } = await supabase
      .from('guest_ledger')
      .select('*')
      .eq('id', data as string)
      .single();
    if (fetchErr) throw new Error(`[usePostCharge] fetch: ${fetchErr.message}`);
    return row as GuestLedgerEntry;
  }

  // Non-taxable entry (DISCOUNT, COMPLIMENTARY, MISCELLANEOUS without tax)
  const { data, error } = await supabase
    .from('guest_ledger')
    .insert({
      reservation_id:   payload.reservation_id,
      guest_id:         payload.guest_id,
      entry_type:       payload.entry_type,
      description:      payload.description,
      transaction_date: payload.transaction_date ?? today(),
      amount_bdt:       payload.amount_bdt,
      is_tax_entry:     false,
      posted_by:        userId,
      department:       payload.department ?? null,
      metadata:         payload.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`[usePostCharge] ${error.message}`);
  return data as GuestLedgerEntry;
}

export function usePostCharge(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PostChargePayload) => postCharge(payload, userId),

    onSuccess: (_, payload) => {
      // Invalidate ledger + invoice for this reservation.
      // The DB trigger has already recalculated invoice totals by the time
      // this callback fires, so a refetch will show the correct balance.
      queryClient.invalidateQueries({
        queryKey: ledgerKeys.all(payload.reservation_id),
      });
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.all(payload.reservation_id),
      });
    },

    onError: (error) => {
      console.error('[usePostCharge] mutation failed:', error);
    },
  });
}
