'use client';
// =============================================================================
// useExpandNightlyCharges
// Calls the PostgreSQL expand_nightly_charges() function on CHECK_IN.
//
// This one DB call posts:
//   - 1 × ROOM_CHARGE  (net BDT)  per room per night
//   - 1 × SERVICE_CHARGE (5% of net)  per room per night
//   - 1 × TAX/VAT       (15% of net) per room per night
//
// The function is idempotent — calling it twice for the same reservation
// will not create duplicate entries.
//
// Use together with ensureInvoiceExists (from useCheckoutBalance) so the
// invoice triggers have a target to update.
// =============================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { ledgerKeys } from './useGuestLedger';
import { invoiceKeys } from './useCheckoutBalance';
import { ensureInvoiceExists } from './useCheckoutBalance';

interface ExpandChargesPayload {
  reservation_id: string;
  guest_id:       string;
  tenant_id:      string;
  billing_name:   string;
}

async function expandCharges(payload: ExpandChargesPayload): Promise<number> {
  // 1. Ensure a DRAFT invoice exists before posting charges
  //    (the invoice trigger needs a target row to update)
  await ensureInvoiceExists(
    payload.reservation_id,
    payload.guest_id,
    payload.tenant_id,
    payload.billing_name
  );

  // 2. Expand nightly room charges via DB function
  //    Returns the number of ROOM_CHARGE rows inserted (one per room per night)
  const { data, error } = await supabase.rpc('expand_nightly_charges', {
    p_reservation_id: payload.reservation_id,
  });

  if (error) throw new Error(`[useExpandNightlyCharges] ${error.message}`);
  return data as number;
}

export function useExpandNightlyCharges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: expandCharges,

    onSuccess: (rowsInserted, payload) => {
      console.info(
        `[useExpandNightlyCharges] Posted ${rowsInserted} nightly charge(s) ` +
        `for reservation ${payload.reservation_id}`
      );
      queryClient.invalidateQueries({
        queryKey: ledgerKeys.all(payload.reservation_id),
      });
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.all(payload.reservation_id),
      });
    },

    onError: (error) => {
      console.error('[useExpandNightlyCharges] failed:', error);
    },
  });
}
