// Canonical outstanding-dues math - single source of truth for Billing, Reports, Dashboard.
// Owner decision 2026-06-12: "Outstanding Dues" = RECEIVABLES only - reservations that are
// CHECKED_IN or CHECKED_OUT with a positive balance. Future RESERVED/PENDING bookings that are
// only part-prepaid are NOT counted as outstanding until the guest checks in.

// Legacy `discount` and current `discount_amount` coexist; only the latter is ever written.
// NULL-semantics, NOT falsy-`||` — a deliberately ZEROED discount_amount must win over the
// stale legacy column, otherwise a revoked discount reads as still-applied and the front desk
// is told the reservation is "already fully settled". Matches the SQL side, which has always
// used COALESCE(discount_amount, discount, 0). Audit 2026-08-15 H-5.
//
// Behaviour-preserving on every existing row: prod has 495 reservations with
// discount_amount IS NULL + a legacy discount (those still fall through, unchanged) and
// ZERO rows in the discount_amount = 0 state. This only prevents the bug going forward.
// Do NOT backfill the legacy column — 5 protected reverse rows depend on it.
export const discountOf = (r) => (r?.discount_amount != null ? (+r.discount_amount || 0) : (+r?.discount || 0));

export const dueOf = (r) => Math.max(0, (+r?.total_amount || 0) - discountOf(r) - (+r?.paid_amount || 0));
export const isReceivable = (r) => { const s = String(r?.status || '').toUpperCase(); return s === 'CHECKED_IN' || s === 'CHECKED_OUT'; };
export const outstandingList = (reservations) => (reservations || []).filter((r) => isReceivable(r) && dueOf(r) > 0).sort((a, b) => dueOf(b) - dueOf(a));
export const outstandingTotal = (reservations) => outstandingList(reservations).reduce((a, r) => a + dueOf(r), 0);

// ── Canonical payment predicate ──────────────────────────────────────────────
// POSITIVE match. An exclusion-only filter ("everything that isn't Balance Carried
// Forward") lets CHARGES count as cash: on 2026-08-07 five `Stay Extension (+1 night)`
// rows worth 21,500 BDT were reported as collections on top of 41,500 BDT of real
// payments. Migration 20260808_night_audit_positive_payment_match.sql fixed the RPC
// and close-day-chain.ts; this is the same rule for every client surface.
//
// Single source of truth — import it, never re-declare it. Previously copy-pasted into
// Reports.jsx, Dashboard.jsx, Billing.jsx and app/billing/page.jsx, and one of the four
// was missed by the 2026-08-08 fix. Audit 2026-08-15 H-7.
export const REAL_PAY = /payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card/i;

export const isRealPayment = (t) => {
  const type = t?.type ?? '';
  return REAL_PAY.test(type)
    && !/^\[VOID-DUP\]/.test(type)
    && !/balance carried forward/i.test(type);
};

// Fiscal day a transaction belongs to. fiscal_day is authoritative (it is the OPEN
// business day, not the calendar date); created_at is only a fallback for legacy rows.
export const txDay = (t) => (t?.fiscal_day || t?.created_at || '').slice(0, 10);

// Sum of genuine collections within an inclusive [from, to] fiscal-day window.
export const collectedBetween = (txs, from, to) => (txs || [])
  .filter((t) => { const d = txDay(t); return isRealPayment(t) && d && d >= from && d <= to; })
  .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
