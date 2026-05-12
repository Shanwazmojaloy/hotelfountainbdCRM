'use client';
// =============================================================================
// useGuestLedger
// Fetches all non-voided ledger entries for a reservation, grouped into
// parent charges with their tax children attached.
//
// Realtime: subscribes to guest_ledger changes for this reservation_id.
// When any row changes on any front-desk screen, ALL screens update instantly
// without a page refresh.
// =============================================================================

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { GuestLedgerEntry, LedgerEntryWithTax } from '@/types/billing';

// ---------------------------------------------------------------------------
// Query key factory — centralised so invalidation is consistent everywhere
// ---------------------------------------------------------------------------
export const ledgerKeys = {
  all:         (reservationId: string) => ['ledger', reservationId] as const,
  active:      (reservationId: string) => ['ledger', reservationId, 'active'] as const,
};

// ---------------------------------------------------------------------------
// Fetcher — sorted by date then posted_at so nightly charges always appear
// in chronological order on the folio
// ---------------------------------------------------------------------------
async function fetchLedger(reservationId: string): Promise<GuestLedgerEntry[]> {
  const { data, error } = await supabase
    .from('guest_ledger')
    .select('*')
    .eq('reservation_id', reservationId)
    .eq('is_voided', false)
    .order('transaction_date', { ascending: true })
    .order('posted_at',        { ascending: true });

  if (error) throw new Error(`[useGuestLedger] ${error.message}`);
  return data as GuestLedgerEntry[];
}

// ---------------------------------------------------------------------------
// Group flat ledger rows into parent entries with tax children attached.
// Tax children (is_tax_entry = true) are nested under their parent.
// ---------------------------------------------------------------------------
function groupLedgerEntries(rows: GuestLedgerEntry[]): LedgerEntryWithTax[] {
  const parents = rows.filter(r => !r.is_tax_entry);
  const childMap = new Map<string, GuestLedgerEntry[]>();

  rows
    .filter(r => r.is_tax_entry && r.parent_ledger_id)
    .forEach(child => {
      const key = child.parent_ledger_id!;
      if (!childMap.has(key)) childMap.set(key, []);
      childMap.get(key)!.push(child);
    });

  return parents.map(parent => {
    const children = childMap.get(parent.id) ?? [];
    const taxSum   = children.reduce((sum, c) => sum + c.amount_bdt, 0);
    return {
      ...parent,
      tax_children:        children,
      inclusive_amount_bdt: parent.amount_bdt + taxSum,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useGuestLedger(reservationId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey:  ledgerKeys.active(reservationId ?? ''),
    queryFn:   () => fetchLedger(reservationId!),
    enabled:   Boolean(reservationId),
    select:    groupLedgerEntries,
  });

  // Realtime subscription — invalidate cache whenever any row changes.
  // The subscription fires for INSERT, UPDATE, and DELETE on this reservation.
  useEffect(() => {
    if (!reservationId) return;

    const channel = supabase
      .channel(`ledger:${reservationId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'guest_ledger',
          filter: `reservation_id=eq.${reservationId}`,
        },
        () => {
          // Invalidate both the ledger and the invoice balance —
          // the DB trigger will have updated invoice totals already.
          queryClient.invalidateQueries({ queryKey: ledgerKeys.all(reservationId) });
          queryClient.invalidateQueries({ queryKey: ['invoice', reservationId] });
        }
      )
      .subscribe();

    // Cleanup: remove channel when component unmounts or reservationId changes.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reservationId, queryClient]);

  return query;
}

// ---------------------------------------------------------------------------
// Derived selectors (use alongside useGuestLedger for specific slices)
// ---------------------------------------------------------------------------

/** All ROOM_CHARGE entries for the folio header */
export function useRoomCharges(entries: LedgerEntryWithTax[]) {
  return useMemo(
    () => entries.filter(e => e.entry_type === 'ROOM_CHARGE'),
    [entries]
  );
}

/** All PAYMENT / ADVANCE_PAYMENT entries */
export function usePaymentEntries(entries: LedgerEntryWithTax[]) {
  return useMemo(
    () => entries.filter(e =>
      e.entry_type === 'PAYMENT' || e.entry_type === 'ADVANCE_PAYMENT'
    ),
    [entries]
  );
}

/** All extra charges (non-room, non-tax, non-payment) */
export function useExtraCharges(entries: LedgerEntryWithTax[]) {
  return useMemo(
    () => entries.filter(e =>
      !['ROOM_CHARGE','TAX','SERVICE_CHARGE','PAYMENT',
        'ADVANCE_PAYMENT','REFUND','TRANSFER_IN','TRANSFER_OUT'].includes(e.entry_type)
    ),
    [entries]
  );
}
