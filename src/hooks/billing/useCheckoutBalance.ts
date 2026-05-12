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
import { supabase } from '@/lib/supabase/client';
import type { BillingInvoice } from '@/types/billing';

export const invoiceKeys = {
  all:    (reservationId: string) => ['invoice', reservationId] as const,
  active: (reservationId: string) => ['invoice', reservationId, 'active'] as const,
};

async function fetchActiveInvoice(reservationId: string): Promise<BillingInvoice | null> {
  const { data, error } = await supabase
    .from('billing_invoices')
    .select('*')
    .eq('reservation_id', reservationId)
    .in('status', ['DRAFT', 'ISSUED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();                    // returns null instead of throwing when no rows

  if (error) throw new Error(`[useCheckoutBalance] ${error.message}`);
  return data as BillingInvoice | null;
}

export function useCheckoutBalance(reservationId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: invoiceKeys.active(reservationId ?? ''),
    queryFn:  () => fetchActiveInvoice(reservationId!),
    enabled:  Boolean(reservationId),
    // No client-side derivation of totals — trust balance_due_bdt from DB.
    select:   (invoice) => invoice ?? null,
  });

  // Realtime: billing_invoices updates when the PG trigger fires
  useEffect(() => {
    if (!reservationId) return;

    const channel = supabase
      .channel(`invoice:${reservationId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'billing_invoices',
          filter: `reservation_id=eq.${reservationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: invoiceKeys.all(reservationId) });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [reservationId, queryClient]);

  return query;
}

// ---------------------------------------------------------------------------
// useOrCreateInvoice
// Returns the active invoice for a reservation, creating a DRAFT one
// if none exists. Call this on CHECK_IN before posting any charges.
// ---------------------------------------------------------------------------
export async function ensureInvoiceExists(
  reservationId: string,
  guestId:       string,
  tenantId:      string,
  billingName:   string
): Promise<BillingInvoice> {
  // Check for existing DRAFT/ISSUED
  const { data: existing } = await supabase
    .from('billing_invoices')
    .select('*')
    .eq('reservation_id', reservationId)
    .in('status', ['DRAFT', 'ISSUED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as BillingInvoice;

  // Generate invoice number via DB function
  const { data: numResult } = await supabase
    .rpc('generate_invoice_number');

  const { data: created, error } = await supabase
    .from('billing_invoices')
    .insert({
      tenant_id:      tenantId,
      invoice_number: numResult,
      reservation_id: reservationId,
      guest_id:       guestId,
      invoice_type:   'FOLIO',
      invoice_date:   new Date().toISOString().split('T')[0],
      billing_name:   billingName,
      // Note: totals start at 0 — DB trigger populates them as charges are posted.
    })
    .select()
    .single();

  if (error) throw new Error(`[ensureInvoiceExists] ${error.message}`);
  return created as BillingInvoice;
}
