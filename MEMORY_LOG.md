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

Billing Report Restructure (v3.3 — 2026-04-24, commit `f94b750`):
- Scope: `downloadBillingPDF` + caller `downloadPDF` in `public/crm.html` rewritten to match the owner's "Today's Report" spec.
- Header blocks replaced: was {Today, Month, All-Time, Outstanding} → now {Period Total, Cash Total, Bkash Total, Outstanding Due}. First block respects the active filter (TODAY/MONTH/ALL/DATE) and relabels automatically.
- Table expanded from 5 → 9 columns: Guest Name | Room | Check-In/Out | Bill Total | Discount | Paid | Balance Due | Payment Method | Collected. Paper switched to A4 landscape to fit.
- **Payment type ≠ column**: there is NO `transactions.payment_type` column in Supabase (`mynwfkgksqqwlqowlscj` / Bridge Booking). Payment method is embedded in `type` as a composite string (`Room Payment (Cash)`, `Room Payment (Bkash)`). Cash/Bkash filters use case-insensitive regex (`/cash/i`, `/bkash/i`) against `type`. Display parenthetical via `/\(([^)]+)\)/`. Any future work that assumes a `payment_type` column is wrong — read this entry first.
- **"Paid" vs "Collected" semantics** (owner's explicit spec): `Paid` = lifetime amount paid for the entire reservation/stay (pulled from `computeBill(res).paid`); `Collected` = amount of this individual transaction (`t.amount`). Do not conflate.
- Caller enrichment: `downloadPDF` joins each transaction to its reservation via `reservation_id || res_id` (preferred), with a fallback that matches by `room_number + fiscal_day ∈ [check_in, check_out]` — fallback exists only for legacy orphan tx rows and MUST NOT be broadened.
- New signature: `downloadBillingPDF(enriched, filter, periodTotal, cashTotal, bkashTotal, outstanding, calDate, tokenAmount)`. Closing box adds Cash + Bkash lines above the token deduction.
- Root `crm.html` intentionally skipped (NOT Vercel-served per v3.2). Only `public/crm.html` matters for prod.
- Pending: push from Windows + MD5-verify deployed file + Vercel deploy READY before closing loop.

Hotfix Tail Restoration (v3.3.1 — 2026-04-24):
- Symptom: `Uncaught SyntaxError: Unexpected token, expected "," (4044:62)` from babel.min.js on live prod after v3.3 deploy. App failed to mount; loading screen stuck indefinitely. Error pointed at script line 4044:62 in the notif-dropdown confirm handler.
- Root cause: Edit operations during v3.3 billing PDF work truncated `public/crm.html` at the notif-dropdown confirm handler, stopping mid-token at `}catch(e){toast(e.me`. The final 82 lines of the inline script (notif confirm `finally` block, cancel button, HK urgent / dirty rooms / all-clear notif items, content router JSX `{cur==='dashboard'…}`, `</div></main></>` close tags, `ReactDOM.createRoot` mount call, 8s loading fallback) plus `</script></body></html>` were missing entirely. The Babel error pointed at the visible truncation line — the actual problem was everything AFTER it.
- Fix: Restored tail from commit `13023fa` (last known-good v3.2) by appending script lines 3966–4044 + HTML closers. v3.3 billing PDF restructure (cashTotal/bkashTotal/9-col table) preserved intact. Validated via `@babel/parser` in-sandbox: 4122 script lines, parses OK.
- Post-fix state: `public/crm.html` = 4150 lines / 455,617 bytes. Live prod `(Invoke-WebRequest).Content.TrimEnd()[-20..-1]` now ends `</script></body></html>` (previously `}catch(e){toast(e.me`).
- Invariant (enforce pre-commit): Any Edit to `public/crm.html` MUST be followed by grep checks for BOTH `ReactDOM.createRoot` AND `</html>` before `git add`. Missing either = truncation regression. Byte count should be ≥ 450KB; line count ≥ 4150. If Edit tool returns without error but file shrinks, DO NOT TRUST — re-read and verify tail explicitly.
- Deploy gotcha repeated from v3.2: Vercel serves `public/crm.html`, NOT root `crm.html`. Verify fix is live via `(Invoke-WebRequest https://hotelfountainbd.vercel.app/crm.html).Content.TrimEnd()[-20..-1]` — must contain `</script></body></html>`.
- Sandbox limitation noted: Git commit from Linux sandbox failed due to `.git/*.lock` files owned by Windows UID — unremovable from sandbox. All commits to this repo MUST originate from Windows PowerShell (`git add && git commit && git push`), not from sandbox bash.

Active Billing Ledger Roster Fix (v3.4 — 2026-04-24):
- Symptom: Guest ARNOB N (Room 307) was correctly `CHECKED_IN` in Reservations tab but invisible in the "Active Billing Ledger — Today" on Billing & Invoices. PRINCE and AZIZ appeared normally because each had a transaction posted with `fiscal_day = today`.
- Root cause: `BillingPage` built the unified ledger from two passes: (1) `todayT = transactions.filter(t => t.fiscal_day === today)` — tx-driven, and (2) `dueRes = reservations.filter(r => status∈{CHECKED_IN,CHECKED_OUT} AND _resDue(r) > 0)` — outstanding-only. ARNOB had no tx yet today AND `_resDue = 0` (fully prepaid / not yet billed), so both passes dropped him. Owner spec explicitly requires ALL `CHECKED_IN` guests visible regardless of balance.
- Red herring: Owner asked whether a missing `payment_type` value was filtering ARNOB out. **There is no `payment_type` column in the `transactions` table** (already documented in v3.3). Payment method is embedded in `type` as `"Room Payment (Cash)"` / `"Room Payment (Bkash)"`. Missing-guest bugs in the ledger are roster filter issues, not data-shape issues — do not chase `payment_type` hypotheses.
- Fix (`public/crm.html` BillingPage, ~L2312 + ~L2608):
  - Added `activeRes = reservations.filter(r => r.status==='CHECKED_IN' OR (r.status==='CHECKED_OUT' AND _resDue(r)>0))` — the full ledger roster.
  - Kept `dueRes` for the Outstanding KPI (unpaid-only math).
  - Pass 2 of unified group builder now iterates `activeRes` instead of `dueRes`. `isDue` flag is set per-row from `_resDue(r) > 0` so the unpaid UI cue still distinguishes balance states.
  - Search branch unchanged — typing a query still restricts to tx-driven matches (preserves existing UX).
- Invariant: Active Ledger is a **roster view over reservations**, not a transaction log. Any future filter that uses tx existence OR non-zero balance as a gate for a `CHECKED_IN` guest is a regression. `dueRes` and `activeRes` are not interchangeable.
- Edge cases verified: CHECKED_IN with no-tx-no-balance (shows, "— No Pymt in Period —"), CHECKED_IN fully prepaid (shows, balance=0), CHECKED_IN partial (shows, balance>0), CHECKED_IN with tx today (shows, deduped by `res.id` key), CHECKED_OUT with due (shows), CHECKED_OUT fully settled (excluded — ghost filter at tx pass + activeRes exclusion), CANCELLED/RESERVED (excluded).
- Edit-tool truncation recurrence: Mid-edit the Edit tool again shrank the file tail (4143 lines, ending `{cur==='reports' &`). Re-applied v3.3.1 tail-restore from commit `13023fa`. Billing logic patch survived and was preserved. **Reinforced rule: after ANY Edit to `public/crm.html`, immediately grep for `ReactDOM.createRoot` AND `</html>` — if either missing, re-restore tail before the next Edit.**
