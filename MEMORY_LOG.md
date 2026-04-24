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

RoomModal Ghost Folio Fix (v3.2 — 2026-04-24, commit `13023fa`):
- Symptom: Stale folio rows from historical CHECKED_OUT reservations on the same room rendered inside a freshly opened RoomModal. Concrete case: Minibar ৳80 + ৳100 from reservation `f69e6485…` (2026-04-08) bled into ARNOB N's new Room 307 reservation `f74a812a…` (2026-04-24), inflating Subtotal to ৳4,680 and Balance Due to ৳680 when the true figure was ৳4,500.
- True root cause: **Production `public/crm.html` line 808 fetched folios by `room_number`, not `reservation_id`** (`db('folios','?room_number=eq.${room.room_number}&order=created_at')`). Every folio ever written to that room number across every historical reservation was returned. Reservation-centric anchoring (v3.1) was being bypassed on the read path.
- Deployment gotcha (important): `public/crm.html` is the Vercel-served static file (Next.js `public/` dir). The root-level `crm.html` is NOT what production serves. Initial patches to root `crm.html` had zero effect until the real file at `public/crm.html` was edited. Always verify the deployed md5 (`curl -s https://hotelfountainbd.vercel.app/crm.html | md5sum`) matches the file you edited before trusting the fix.
- Patch (`public/crm.html`):
  - L783: `<RoomModal key={selRoom.id}>` — forces unmount/remount on room switch so no state leaks across instances
  - L807–822: fetch switched to `?reservation_id=eq.${activeRes.id}`, with pre-clear `setFolios([])`, cancellation flag for rapid room-switch races, and strict client-side `x.reservation_id === resId` filter as defense-in-depth
  - L862: `addFolioCharge` rejects any `f` whose `reservation_id` doesn't match `activeRes.id`, dedupes on push
  - L1035: `AddChargeModal.save` refuses to POST when `resId` is falsy (was previously `reservation_id: resId || null`, which silently created orphan folios)
- Root-level `crm.html` received the same patch for parity only; not served.
- Verification: DB query confirmed zero folios for `f74a812a-871c-4ba1-ad64-ecf4d5f38871`. Deploy `dpl_GyxsKdYpcxPdPUMQpD8qYfu3uz8r` READY. Live prod `crm.html` contains all four patch markers (`key={selRoom.id}`, `HARD RESET`, `?reservation_id=eq.${resId}`, strict filter).
- Invariant reinforced: never render, fetch, or persist a folio without a matching `activeRes.id`. `room_number` is display metadata, not a join key. Any future `?room_number=eq.` folio query is a regression.
