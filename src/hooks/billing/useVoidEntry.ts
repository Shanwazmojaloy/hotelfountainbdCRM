'use client';
// =============================================================================
// useVoidEntry
// Voids a guest_ledger entry and ALL its tax children atomically.
//
// Uses the void_ledger_entry() PostgreSQL function which:
//   1. Sets is_voided = TRUE on the target row
//   2. Sets is_voided = TRUE on all rows where parent_ledger_id = target
//   3. Returns the count of voided rows
//
// After voiding, the fn_recalculate_invoice_totals trigger fires and
// the invoice totals update automatically. The front desk will see the
// corrected balance via Realtime without a page refresh.
//
// ⚠  Rows are NEVER deleted. The audit trail is permanent.
// =============================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { billingPost } from './api';
import { ledgerKeys } from './useGuestLedger';
import { invoiceKeys } from './useCheckoutBalance';
import type { VoidEntryPayload } from '@/types/billing';

// `userId` is no longer sent — voided_by comes from the staff session. Voiding is
// additionally gated server-side to supervisor roles and up, which the browser
// could not enforce for itself.
async function voidEntry(
  payload: VoidEntryPayload,
  _userId: string
): Promise<number> {
  if (!payload.void_reason?.trim()) {
    throw new Error('[useVoidEntry] void_reason is required');
  }

  const result = await billingPost('void', {
    reservation_id:  payload.reservation_id,
    ledger_entry_id: payload.ledger_entry_id,
    void_reason:     payload.void_reason.trim(),
  }, 'useVoidEntry');

  return Number(result.voided ?? 0);
}

export function useVoidEntry(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: VoidEntryPayload) => voidEntry(payload, userId),

    onSuccess: (voidedCount, payload) => {
      console.info(
        `[useVoidEntry] Voided ${voidedCount} row(s) for entry ${payload.ledger_entry_id}`
      );
      // Realtime will trigger the refetch, but we also invalidate explicitly
      // for the case where Realtime is temporarily disconnected.
      queryClient.invalidateQueries({
        queryKey: ledgerKeys.all(payload.reservation_id),
      });
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.all(payload.reservation_id),
      });
    },

    onError: (error) => {
      console.error('[useVoidEntry] mutation failed:', error);
    },
  });
}
