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

RoomModal Ghost Folio Fix (v3.2 — 2026-04-24):
- Symptom: Stale folio rows from CHECKED_OUT reservations on the same room rendering inside a freshly opened RoomModal (e.g. Minibar ৳80 + ৳100 from reservation `f69e6485…` bleeding into ARNOB N's new Room 307 reservation `f74a812a…`).
- True root cause: **Production `public/crm.html` fetched folios by `room_number`, not `reservation_id`**. Every folio ever written to Room 307 across all historical reservations was returned. Reservation-centric anchoring was not being enforced on the read path.
- Deployment gotcha: `public/crm.html` is the Vercel-served file (Next.js `public/` static dir). Editing the root-level `crm.html` has no effect on production. Always edit `public/crm.html`.
- Patch (`public/crm.html`): fetch changed to `?reservation_id=eq.${activeRes.id}`; `<RoomModal key={selRoom.id}>`; useEffect pre-clears folios + cancellation flag + strict `x.reservation_id === resId` filter; `addFolioCharge` rejects mismatched `f.reservation_id` and dedupes on push; `AddChargeModal.save` refuses to POST without a `reservation_id`.
- Root-level `crm.html` received the same patch for parity, but is not what Vercel serves.
- Verification: DB confirmed zero folios for `f74a812a-871c-4ba1-ad64-ecf4d5f38871`. Post-deploy hard refresh must show only the `Room charge 1×৳4,500` line.
- Invariant: never render, fetch, or persist a folio without a matching `activeRes.id`. All folio reads and writes are reservation-scoped. `room_number` is display metadata, not a join key.
