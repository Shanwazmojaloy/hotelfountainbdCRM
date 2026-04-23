Purpose: Persistent memory of key decisions and technical hurdles.

Key Decisions Made:
Pricing Logic: Room rates are calculated using a base rate plus a combined 20% markup (15% VAT and 5% Service Charge).
Operational Hours: Standardized check-in at 12:00 PM or 2:00 PM and check-out at 12:00 PM.
Room Inventory: Strictly categorized into Fountain Deluxe, Premium Deluxe, Superior Deluxe, Twin Deluxe, and Royal Suite.

Financial Anchoring (v3.1 — 2026-04-23):
- `reservation_id` is the SINGLE anchor for all financial rows. Every `transactions` and `folios` write MUST carry a non-null `reservation_id`; `dbPostTransactionSafe` throws if missing.
- `computeBill(res, rooms, foliosMap, settings, transactions)` derives `paid` by reducing over `transactions.filter(t => t.reservation_id === res.id && isPaymentTx(t))`. `r.paid_amount` is now a denormalized cache, NOT the source of truth for display math.
- `foliosMap` is keyed strictly by `reservation_id`. The legacy `room_number` fallback key was a ghost-bleed source and has been removed.
- No fallback matching by `room_number` or `guest_name` is permitted anywhere (deletes, revenue reduction, bill computation). `buildCorrectedAmounts()` chronological capping is obsolete.
- DB enforcement: `transactions.reservation_id` and `folios.reservation_id` are `NOT NULL` with FK → `reservations(id) ON DELETE CASCADE`. Indexes on `reservation_id` added for reduce-path performance.
- Migration: `backfill-orphan-tx.js` matched orphan rows to reservations by `room_number + fiscal_day ∈ [check_in, check_out]`. Unmatched rows reviewed manually; no auto-delete.

Known Bugs & Gotchas:
Deployment Asset Issue: Images and maps frequently fail to load after Vercel deployment if relative paths are used; must use absolute paths referencing the /public directory .
Map Rendering: Maps require API keys to be explicitly defined in Vercel Environment Variables rather than just local files to function in production.
SSR Compatibility: Map scripts must be loaded with client-side checks to prevent build failures on Vercel.
