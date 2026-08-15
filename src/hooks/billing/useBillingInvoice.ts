'use client';
// =============================================================================
// useBillingInvoice
// Fetches a billing invoice with its line items.
// Used on the Folio / Invoice print view.
//
// The invoice can be in DRAFT (live, mutable) or ISSUED (snapshotted, fixed).
// Line items are only populated after the invoice is issued — in DRAFT state
// the folio is assembled from the live guest_ledger instead.
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { billingGet, billingPost } from './api';
import type { BillingInvoice, GuestLedgerEntry, InvoiceLineItem } from '@/types/billing';

export interface InvoiceWithLineItems extends BillingInvoice {
  line_items: InvoiceLineItem[];
}

async function fetchInvoiceWithItems(
  invoiceId: string
): Promise<InvoiceWithLineItems> {
  const payload = await billingGet('invoice_detail', { invoice_id: invoiceId }, 'useBillingInvoice');
  const row = payload.row as InvoiceWithLineItems;
  return { ...row, line_items: row.line_items ?? [] };
}

export function useBillingInvoice(invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: ['invoice-detail', invoiceId],
    queryFn:  () => fetchInvoiceWithItems(invoiceId!),
    enabled:  Boolean(invoiceId),
    // Invoice data is stable once ISSUED — increase stale time to reduce fetches
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// issueInvoice
// Snapshots the current ledger into invoice_line_items and transitions
// the invoice from DRAFT → ISSUED.
// This is called at checkout or when the guest requests a formal invoice.
// ---------------------------------------------------------------------------
// `issuedBy` is no longer sent — issued_by comes from the staff session. The
// ledger snapshot, the line-item build and the DRAFT → ISSUED transition all
// moved server-side, so a browser can no longer write invoice_line_items (which
// has no tenant_id column of its own and was therefore the weakest of the four).
export async function issueInvoice(
  invoiceId: string,
  _issuedBy: string
): Promise<BillingInvoice> {
  const payload = await billingPost('issue_invoice', { invoice_id: invoiceId }, 'issueInvoice');
  return payload.row as BillingInvoice;
}

// ---------------------------------------------------------------------------
// useCheckoutBalance  (re-exported key factory used by usePostPayment)
// ---------------------------------------------------------------------------
export const invoiceKeys = {
  all: (reservationId: string) => ['invoice', reservationId] as const,
};
