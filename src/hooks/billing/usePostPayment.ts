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
import { supabase } from '@/lib/supabase/client';
import { ledgerKeys } from './useGuestLedger';
import { invoiceKeys } from './useCheckoutBalance';
import { isValidBdtAmount, today } from '@/lib/money';
import type { PostPaymentPayload, PaymentTransaction } from '@/types/billing';

async function postPayment(
  payload: PostPaymentPayload,
  userId: string
): Promise<PaymentTransaction> {
  // Guard: payments must always be a positive integer
  if (!isValidBdtAmount(payload.amount_bdt)) {
    throw new Error(
      `[usePostPayment] amount_bdt must be a positive integer. ` +
      `Received: ${payload.amount_bdt}`
    );
  }

  // Step 1: Insert payment transaction
  const { data: payment, error: payErr } = await supabase
    .from('payment_transactions')
    .insert({
      reservation_id:         payload.reservation_id,
      guest_id:               payload.guest_id,
      payment_method:         payload.payment_method,
      payment_method_details: payload.metadata ?? {},
      amount_bdt:             payload.amount_bdt,
      status:                 'COMPLETED',
      completed_at:           new Date().toISOString(),
      is_advance_payment:     payload.is_advance_payment ?? false,
      invoice_id:             payload.invoice_id ?? null,
      payment_reference:      payload.payment_reference ?? null,
      processed_by:           userId,
      notes:                  payload.notes ?? null,
    })
    .select()
    .single();

  if (payErr) throw new Error(`[usePostPayment] payment insert: ${payErr.message}`);

  // Step 2: Mirror as a negative ledger entry (credit to guest account)
  // amount_bdt is NEGATIVE here — reduces what the guest owes.
  const entryType = payload.is_advance_payment ? 'ADVANCE_PAYMENT' : 'PAYMENT';
  const { error: ledgerErr } = await supabase
    .from('guest_ledger')
    .insert({
      reservation_id:         payload.reservation_id,
      guest_id:               payload.guest_id,
      entry_type:             entryType,
      description:            `Payment — ${formatMethodLabel(payload.payment_method)}`,
      transaction_date:       today(),
      amount_bdt:             -Math.abs(payload.amount_bdt),   // always negative
      is_tax_entry:           false,
      payment_transaction_id: payment.id,
      posted_by:              userId,
      metadata: {
        payment_id:       payment.id,
        payment_method:   payload.payment_method,
        payment_reference: payload.payment_reference,
      },
    });

  if (ledgerErr) {
    // Ledger insert failed — attempt to roll back the payment record
    await supabase
      .from('payment_transactions')
      .update({ status: 'CANCELLED' })
      .eq('id', payment.id);
    throw new Error(
      `[usePostPayment] ledger insert failed (payment cancelled): ${ledgerErr.message}`
    );
  }

  // DB trigger fn_recalculate_paid_total fires here automatically.
  return payment as PaymentTransaction;
}

function formatMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH:           'Cash',
    CARD:           'Card',
    MOBILE_BANKING: 'Mobile Banking (bKash/Nagad)',
    BANK_TRANSFER:  'Bank Transfer',
    CHEQUE:         'Cheque',
    CITY_LEDGER:    'City Ledger',
    VOUCHER:        'Voucher',
    LOYALTY_POINTS: 'Loyalty Points',
  };
  return labels[method] ?? method;
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
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('reservation_id', reservationId!)
        .order('initiated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data as PaymentTransaction[];
    },
    enabled: Boolean(reservationId),
  });
}
