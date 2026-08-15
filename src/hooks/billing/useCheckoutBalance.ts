'use client';
// =============================================================================
// useCheckoutBalance
// Returns the live DB-computed invoice totals for a reservation.
//
// ⚠  The balance_due_bdt value comes directly from a PostgreSQL GENERATED
//    column — it is never calculated in JavaScript. The DB trigger
//    (fn_recalculate_invoice_totals) keeps it accurate after every ledger
//    change. This hook simply subscribes and displays the authoritative value.
//
// Realtime: subscribes to billing_invoices changes for this reservation.
// =============================================================================

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { billingGet, billingPost } from './api';
import type { BillingInvoice } from '@/types/billing';

export const invoiceKeys = {
  all:    (reservationId: string) => ['invoice', reservationId] as const,
  active: (reservationId: string) => ['invoice', reservationId, 'active'] as const,
};

async function fetchActiveInvoice(reservationId: string): Promise<BillingInvoice | null> {
  const payload = await billingGet('invoice', { reservation_id: reservationId }, 'useCheckoutBalance');
  return (payload.row ?? null) as BillingInvoice | null;
}

export function useCheckoutBalance(reservationId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: invoiceKeys.active(reservationId ?? ''),
    queryFn:  () => fetchActiveInvoice(reservationId!),
    enabled:  Boolean(reservationId),
    // No client-side derivation of totals — trust balance_due_bdt from DB.
    select:   (invoice) => invoice ?? null,
    // Replaces the Realtime channel — see the note below.
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  // Was a Supabase Realtime subscription on billing_invoices. Realtime enforces
  // RLS via the browser's publishable key — the access being withdrawn — so it
  // would have gone silent without erroring and the balance would have looked
  // stale rather than broken. The poll above replaces it.
  useEffect(() => {
    if (!reservationId) return;
    queryClient.invalidateQueries({ queryKey: invoiceKeys.all(reservationId) });
  }, [reservationId, queryClient]);

  return query;
}

// ---------------------------------------------------------------------------
// useOrCreateInvoice
// Returns the active invoice for a reservation, creating a DRAFT one
// if none exists. Call this on CHECK_IN before posting any charges.
// ---------------------------------------------------------------------------
// `tenantId` is still accepted so callers do not all have to change at once, but
// it is IGNORED — the server takes the tenant from the session. A client that can
// name its own tenant is the whole bug this refactor closes.
export async function ensureInvoiceExists(
  reservationId: string,
  guestId:       string,
  _tenantId:     string,
  billingName:   string
): Promise<BillingInvoice> {
  const payload = await billingPost('ensure_invoice', {
    reservation_id: reservationId,
    guest_id:       guestId,
    billing_name:   billingName,
  }, 'ensureInvoiceExists');
  return payload.row as BillingInvoice;
}
