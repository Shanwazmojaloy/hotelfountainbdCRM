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
import { supabase } from '@/lib/supabase/client';
import type { BillingInvoice, InvoiceLineItem } from '@/types/billing';

export interface InvoiceWithLineItems extends BillingInvoice {
  line_items: InvoiceLineItem[];
}

async function fetchInvoiceWithItems(
  invoiceId: string
): Promise<InvoiceWithLineItems> {
  const { data, error } = await supabase
    .from('billing_invoices')
    .select(`
      *,
      line_items:invoice_line_items (
        *
      )
    `)
    .eq('id', invoiceId)
    .order('sort_order', { referencedTable: 'invoice_line_items', ascending: true })
    .single();

  if (error) throw new Error(`[useBillingInvoice] ${error.message}`);
  return {
    ...(data as BillingInvoice & { line_items: InvoiceLineItem[] }),
    line_items: (data as any).line_items ?? [],
  };
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
export async function issueInvoice(
  invoiceId: string,
  issuedBy:  string
): Promise<BillingInvoice> {
  // 1. Fetch the current ledger entries for this invoice's reservation
  const { data: invoice } = await supabase
    .from('billing_invoices')
    .select('reservation_id')
    .eq('id', invoiceId)
    .single();

  if (!invoice) throw new Error('[issueInvoice] Invoice not found');

  const { data: ledger, error: ledgerErr } = await supabase
    .from('guest_ledger')
    .select('*')
    .eq('reservation_id', invoice.reservation_id)
    .eq('is_voided', false)
    .order('transaction_date', { ascending: true })
    .order('posted_at',        { ascending: true });

  if (ledgerErr) throw new Error(`[issueInvoice] ledger fetch: ${ledgerErr.message}`);

  // 2. Build line items from non-tax ledger entries
  //    Tax children are summarised per parent in sc_amount_bdt / vat_amount_bdt
  const parentEntries = (ledger ?? []).filter(e => !e.is_tax_entry);
  const childMap = new Map<string, { sc: number; vat: number }>();
  (ledger ?? [])
    .filter(e => e.is_tax_entry && e.parent_ledger_id)
    .forEach(child => {
      const key = child.parent_ledger_id!;
      const existing = childMap.get(key) ?? { sc: 0, vat: 0 };
      if (child.entry_type === 'SERVICE_CHARGE') existing.sc += child.amount_bdt;
      if (child.entry_type === 'TAX')            existing.vat += child.amount_bdt;
      childMap.set(key, existing);
    });

  const lineItems = parentEntries.map((entry, idx) => {
    const tax = childMap.get(entry.id) ?? { sc: 0, vat: 0 };
    return {
      invoice_id:       invoiceId,
      ledger_entry_id:  entry.id,
      description:      entry.description,
      entry_type:       entry.entry_type,
      transaction_date: entry.transaction_date,
      quantity:         1,
      unit_amount_bdt:  entry.amount_bdt,
      total_amount_bdt: entry.amount_bdt,
      sc_amount_bdt:    tax.sc,
      vat_amount_bdt:   tax.vat,
      sort_order:       idx,
    };
  });

  // 3. Insert all line items
  if (lineItems.length > 0) {
    const { error: itemErr } = await supabase
      .from('invoice_line_items')
      .insert(lineItems);
    if (itemErr) throw new Error(`[issueInvoice] line items: ${itemErr.message}`);
  }

  // 4. Transition invoice to ISSUED
  const { data: updated, error: updateErr } = await supabase
    .from('billing_invoices')
    .update({
      status:    'ISSUED',
      issued_by: issuedBy,
      issued_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (updateErr) throw new Error(`[issueInvoice] status update: ${updateErr.message}`);
  return updated as BillingInvoice;
}
