'use client';
// =============================================================================
// usePostPayment
// Records a payment against a reservation.
//
// Two-step atomic flow:
//   1. Insert into payment_transactions (status = COMPLETED)
//   2. Insert a matching NEGATIVE ledger entry (amount = -payment)
//      so the ledger shows the credit and the invoice trigger fires.
//
// The DB trigger fn_recalculate_paid_total then updates
// billing_invoices.paid_total_bdt → balance_due_bdt recalculates automatically.
//
// Both inserts happen in a single database transaction via a Postgres function
// to ensure atomicity — if the ledger insert fails, the payment is rolled back.
// =============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingGet, billingPost } from './api';
import { ledgerKeys } from './useGuestLedger';
import { invoiceKeys } from './useCheckoutBalance';
import { isValidBdtAmount } from '@/lib/money';
import type { PostPaymentPayload, PaymentTransaction } from '@/types/billing';

// `userId` is no longer sent: processed_by / posted_by come from the staff session
// on the server. The two-step insert (payment_transactions then the negative
// ledger mirror), the 23505 idempotency replay and the cancel-on-failure rollback
// all moved server-side with it.
async function postPayment(
  payload: PostPaymentPayload,
  _userId: string
): Promise<PaymentTransaction> {
  // Guard: payments must always be a positive integer
  if (!isValidBdtAmount(payload.amount_bdt)) {
    throw new Error(
      `[usePostPayment] amount_bdt must be a positive integer. ` +
      `Received: ${payload.amount_bdt}`
    );
  }

  // Stable idempotency key: caller should pass a per-attempt UUID (generated when
  // the modal opens) so retries reuse it. The server mints one if absent, but a
  // client-side key is what makes a retry across a dropped connection safe.
  const idemKey =
    payload.idempotency_key ??
    (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined);

  const result = await billingPost('payment', {
    reservation_id:     payload.reservation_id,
    guest_id:           payload.guest_id,
    payment_method:     payload.payment_method,
    amount_bdt:         payload.amount_bdt,
    is_advance_payment: payload.is_advance_payment ?? false,
    invoice_id:         payload.invoice_id ?? null,
    payment_reference:  payload.payment_reference ?? null,
    notes:              payload.notes ?? null,
    idempotency_key:    idemKey ?? null,
    metadata:           payload.metadata ?? {},
  }, 'usePostPayment');

  return result.row as PaymentTransaction;
}

export function usePostPayment(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PostPaymentPayload) => postPayment(payload, userId),

    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({
        queryKey: ledgerKeys.all(payload.reservation_id),
      });
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.all(payload.reservation_id),
      });
      // Also refresh the payments list if you have one
      queryClient.invalidateQueries({
        queryKey: ['payments', payload.reservation_id],
      });
    },

    onError: (error) => {
      console.error('[usePostPayment] mutation failed:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// usePaymentHistory
// Fetches all completed payments for a reservation (for the payment log panel).
// ---------------------------------------------------------------------------
export function usePaymentHistory(reservationId: string | null | undefined) {
  return useQuery({
    queryKey: ['payments', reservationId],
    queryFn:  async () => {
      const payload = await billingGet('payments', { reservation_id: reservationId! }, 'usePaymentHistory');
      return (payload.rows ?? []) as PaymentTransaction[];
    },
    enabled: Boolean(reservationId),
  });
}
