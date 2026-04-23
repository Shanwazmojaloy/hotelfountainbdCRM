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
import { supabase } from '@/lib/supabase/client';
import { ledgerKeys } from './useGuestLedger';
import { invoiceKeys } from './useCheckoutBalance';
import type { VoidEntryPayload } from '@/types/billing';

async function voidEntry(
  payload: VoidEntryPayload,
  userId: string
): Promise<number> {
  if (!payload.void_reason?.trim()) {
    throw new Error('[useVoidEntry] void_reason is required');
  }

  const { data, error } = await supabase.rpc('void_ledger_entry', {
    p_entry_id:  payload.ledger_entry_id,
    p_reason:    payload.void_reason.trim(),
    p_voided_by: userId,
  });

  if (error) throw new Error(`[useVoidEntry] ${error.message}`);

  // data = number of rows voided (parent + tax children)
  const count = data as number;
  if (count === 0) {
    throw new Error(
      `[useVoidEntry] Entry ${payload.ledger_entry_id} was not found or already voided.`
    );
  }

  return count;
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
