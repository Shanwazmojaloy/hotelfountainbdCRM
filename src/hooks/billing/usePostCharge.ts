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
import { billingPost } from './api';
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

// `userId` is no longer sent: posted_by is taken from the staff session on the
// server, so the browser cannot post a charge under someone else's name.
async function postCharge(
  payload: PostChargePayload,
  _userId: string
): Promise<GuestLedgerEntry> {
  // Guard: reject float amounts at the edge before they ever reach the DB
  if (!isValidBdtAmount(payload.amount_bdt)) {
    throw new Error(
      `[usePostCharge] amount_bdt must be a positive integer. ` +
      `Received: ${payload.amount_bdt}`
    );
  }

  // The taxable/non-taxable split, the post_extra_charge call and the ledger
  // insert all moved server-side. TAXABLE_TYPES is mirrored there; it stays here
  // only so the UI can label the charge before submitting.
  const result = await billingPost('charge', {
    reservation_id:   payload.reservation_id,
    guest_id:         payload.guest_id,
    entry_type:       payload.entry_type,
    description:      payload.description,
    transaction_date: payload.transaction_date ?? today(),
    amount_bdt:       payload.amount_bdt,
    department:       payload.department ?? null,
    metadata:         payload.metadata ?? {},
  }, 'usePostCharge');
  return result.row as GuestLedgerEntry;
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
