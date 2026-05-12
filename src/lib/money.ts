// =============================================================================
// LUMEA — BDT Money Utilities
//
// ⚠  DISPLAY ONLY — never use these functions to compute totals that get
//    written back to the database. All canonical totals live in PostgreSQL.
//
// All amounts are INTEGER BDT (whole Taka). No floats anywhere.
// =============================================================================

import type { TaxBreakdown } from '@/types/billing';

// ---------------------------------------------------------------------------
// formatBDT
// Formats an integer Taka amount as a human-readable BDT string.
// e.g. formatBDT(9000) → "৳9,000" or "BDT 9,000"
// ---------------------------------------------------------------------------
export function formatBDT(
  amount_bdt: number,
  options: { symbol?: 'symbol' | 'code' | 'none'; sign?: boolean } = {}
): string {
  const { symbol = 'symbol', sign = false } = options;
  const abs = Math.abs(amount_bdt);
  const formatted = new Intl.NumberFormat('en-BD', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);

  const prefix = sign && amount_bdt < 0 ? '-' : sign && amount_bdt > 0 ? '+' : '';
  const curr = symbol === 'symbol' ? '৳' : symbol === 'code' ? 'BDT ' : '';

  return `${prefix}${curr}${formatted}`;
}

// ---------------------------------------------------------------------------
// extractInclusiveTax
// Client-side mirror of the PostgreSQL extract_inclusive_tax() function.
// Used ONLY for display breakdowns — never send the result back to the DB
// as an authoritative total (the DB trigger owns those numbers).
//
// Formula (integer-only, zero rounding loss):
//   net  = Math.floor(price × 10000 / divisor)
//   sc   = Math.floor(net × sc_bps / 10000)
//   vat  = price - net - sc   ← remainder absorbs rounding
// ---------------------------------------------------------------------------
export function extractInclusiveTax(
  inclusiveBdt: number,
  vatBps = 1500,   // 15%
  scBps  = 500     // 5%
): TaxBreakdown {
  const divisor = 10000 + vatBps + scBps;
  const net = Math.floor((inclusiveBdt * 10000) / divisor);
  const sc  = Math.floor((net * scBps) / 10000);
  const vat = inclusiveBdt - net - sc;             // remainder
  return { net_bdt: net, sc_bdt: sc, vat_bdt: vat, total_bdt: net + sc + vat };
}

// ---------------------------------------------------------------------------
// buildTaxLabel
// Returns a human-readable tax summary line for a folio.
// e.g. "VAT (15%): ৳1,125  |  SC (5%): ৳375"
// ---------------------------------------------------------------------------
export function buildTaxLabel(breakdown: TaxBreakdown): string {
  return `VAT (15%): ${formatBDT(breakdown.vat_bdt)}  |  SC (5%): ${formatBDT(breakdown.sc_bdt)}`;
}

// ---------------------------------------------------------------------------
// isValidBdtAmount
// Guard used in mutation payloads — rejects floats and negatives at the edge.
// ---------------------------------------------------------------------------
export function isValidBdtAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0
  );
}

// ---------------------------------------------------------------------------
// today
// Returns today's date as YYYY-MM-DD (used as transaction_date default).
// ---------------------------------------------------------------------------
export function today(): string {
  return new Date().toISOString().split('T')[0];
}
