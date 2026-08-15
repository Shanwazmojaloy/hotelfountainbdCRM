'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { billingPost } from './api';

export interface CheckoutSummary {
  success: boolean;
  reservation_id: string;
  invoice_id: string;
  invoice_number: string;
  guest_name: string;
  rooms_vacated: string[];
  stay_nights: number;
  actual_nights: number;
  net_total_bdt: number;
  sc_total_bdt: number;
  vat_total_bdt: number;
  discount_total_bdt: number;
  gross_total_bdt: number;
  paid_total_bdt: number;
  balance_due_bdt: number;
  charges_voided: number;
  legacy_bridge: boolean;
  checkout_time: string;
}

// Was: read a Supabase Auth session, then POST it to the process-checkout edge
// function. That could never work — nothing in this app ever creates a Supabase
// Auth session (staff sign in through the custom staff/session_v/OTP scheme), so
// getSession() always returned null and this threw 'No active session' on every
// press. The edge function was wired the same way, authenticating with
// auth.getUser(), so fixing the caller alone would not have helped. See D-16.
//
// Now goes through /api/crm/billing, which re-checks the staff session cookie and
// calls process_checkout() with the service role.
//
// The older checkout button (app/api/crm/check) still exists and only flips the
// status. A reservation closed that way cannot be checked out here afterwards —
// the server returns 409 with an explanation rather than a raw Postgres error.
async function callCheckoutFunction(p: {reservation_id:string; actual_checkout?:string}): Promise<CheckoutSummary> {
  const payload = await billingPost('checkout', {
    reservation_id:  p.reservation_id,
    actual_checkout: p.actual_checkout ?? null,
  }, 'useCheckout');
  return payload.summary as CheckoutSummary;
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: callCheckoutFunction, onSuccess: (s) => {
    qc.invalidateQueries({ queryKey: ['ledger', s.reservation_id] });
    qc.invalidateQueries({ queryKey: ['invoice', s.reservation_id] });
    qc.invalidateQueries({ queryKey: ['payments', s.reservation_id] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
  }});
                               }
