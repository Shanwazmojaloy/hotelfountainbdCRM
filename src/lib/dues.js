// Canonical outstanding-dues math - single source of truth for Billing, Reports, Dashboard.
// Owner decision 2026-06-12: "Outstanding Dues" = RECEIVABLES only - reservations that are
// CHECKED_IN or CHECKED_OUT with a positive balance. Future RESERVED/PENDING bookings that are
// only part-prepaid are NOT counted as outstanding until the guest checks in.
export const dueOf = (r) => Math.max(0, (+r?.total_amount || 0) - (+r?.discount_amount || +r?.discount || 0) - (+r?.paid_amount || 0));
export const isReceivable = (r) => { const s = String(r?.status || '').toUpperCase(); return s === 'CHECKED_IN' || s === 'CHECKED_OUT'; };
export const outstandingList = (reservations) => (reservations || []).filter((r) => isReceivable(r) && dueOf(r) > 0).sort((a, b) => dueOf(b) - dueOf(a));
export const outstandingTotal = (reservations) => outstandingList(reservations).reduce((a, r) => a + dueOf(r), 0);
