# Correction to `5fc1500` — the 406 rows are a legacy import, not corruption

**Status: the code change in `5fc1500` stands. The blast-radius claim in its commit message is RETRACTED.**

## What the commit message claimed

> 406 of 1732 reservations carry a check_in that is not the canonical 06:00 Dhaka booking
> midnight. 84 of those now compute check_out - check_in <= 0 nights, against 1.8% in the
> untouched set - an 11x enrichment that isolates this route as the cause.

The enrichment is real. The attribution is wrong.

## What the data actually says

| group | rows | ≤0 nights |
|---|---|---|
| `created_at = 2026-04-27 03:25:46.79084+00` — a single bulk import | **388** (95.6%) | **82** |
| everything else | 18 | 2 |

All 388 share that `created_at` to the microsecond: one import transaction, covering arrivals
2026-01-18 → 2026-03-10. Their `check_in` / `check_out` hold genuine wall-clock times carried over
from the previous system — e.g. `07:33 → 21:35` Dhaka, `22:19 → 22:19`. `checked_in_at` equals
`created_at` exactly on every one, because `trg_stamp_movement_times` fires on INSERT when the row
already arrives as `CHECKED_IN`.

These are **real same-day / day-use stays**, not damaged records. It is also why
`total_amount / rack_rate` lands at 0.70–0.93 instead of 1.00 — day-use pricing, not a missing night.

## Do NOT repair these rows

The repair under consideration was `check_in = check_out - interval '1 day'` for the 84 ≤0-night rows.
Applying it would have rewritten 82 genuine historical day-use bookings to claim an overnight stay
that never happened, and would have put `reservations` permanently out of step with the money already
recorded against them.

**No backfill is required. The correct number of affected-by-the-bug rows is at most 2.**

## Why the original analysis went wrong

1. The `06:00 Dhaka` marker identifies **system-created** bookings, not **correct** ones. Imported rows
   legitimately carry real clock times.
2. `check_out` is scattered across wall-clock times as well — and **no code path writes `check_out = now()`**.
   A one-sided bug cannot produce two-sided scatter. That contradiction should have stopped the analysis
   before the commit, not after.
3. `guest_ledger` rows for these reservations are labelled `"Auto-backfill: room charge"` — they were
   derived *from* the reservations, so their agreement is circular and proves nothing.

**Rule going forward: `GROUP BY created_at` before attributing any data pattern to a code path.
An identical microsecond timestamp across hundreds of rows means one transaction — an import.**

## What remains true

`/api/crm/check` did stamp `resPatch.check_in = new Date().toISOString()` on every check-in;
`check_in` is the booked arrival date that prices the stay, and `checked_in_at` already records the
real arrival moment. Removing that line was correct. It was a **latent** bug that had not yet caused
measurable loss — not, as claimed, a realised one.
