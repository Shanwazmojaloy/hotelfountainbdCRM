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

Defensive jsonb Unwrap + Malformed-Res Guard (v3.4.1 — 2026-04-24, commit `fc20e7d`):
- Symptom: BillingPage rendered blank on production right after v3.4 deploy. Page stuck with no table, no error in console that mapped to code — React silently remounted on malformed reservation data.
- Root cause investigated: Suspected `reservations.room_ids` arriving as a JSON-encoded string (`'["uuid1","uuid2"]'`) from PostgREST jsonb columns, causing `(r.room_ids||[]).some(...)` to iterate over string characters instead of UUIDs. **Confirmed via `\d reservations` that `room_ids` is actually PG `text[]` (native array), NOT jsonb.** The blank-page cause was elsewhere (v3.4 activeRes expansion dragged in malformed CHECKED_OUT rows that older code skipped).
- Fix (`public/crm.html` ~L2255–2277): added three null-guarded helpers kept as defense-in-depth even though jsonb unwrap is not strictly needed:
  - `_arr(v)` — accepts array OR jsonb string; falls back to `[]`
  - `getGN(r)` — null-safe guest name lookup
  - `getRoom(r)` — null-safe room_ids list
  - Wrapped the main reservation iteration in try/catch (~L2633) so a single malformed row can never crash the whole page.
- Invariant: `reservations.room_ids` is PG `text[]`. Treat it as an array directly. No `JSON.parse`. If it ever arrives as a string, that's a PostgREST config regression — fix the API layer, not the client.

Ghost Filter Over-Reach + ARNOB Missing (v3.4.2 — 2026-04-24, commit `28012f5`):
- Symptom: ARNOB N (Room 307) paid ৳500 Final Settlement at checkout but his row did not appear on the Active Billing Ledger — Today. He was CHECKED_OUT with balance=0. Biz Day revenue also showed ৳30,500 while owner expected ৳26,500.
- Root cause: `activeLedgerTx` ghost filter at BillingPage ~L2226 dropped every tx for any CHECKED_OUT reservation with `_resDue === 0`. This was correct for synthetic "Balance Carried Forward" rows (display-only), but over-reached to real payment txs. ARNOB's reservation `f74a812a…` is CHECKED_OUT, balance=0 after his ৳500 settlement — so his real Final Settlement tx was discarded.
- Fix (~L2225–2237): ghost rejection now applies ONLY to `type==='Balance Carried Forward'` rows whose reservation is CHECKED_OUT with `_resDue===0`. All real cash/bkash/settlement txs ALWAYS pass, regardless of reservation state.
- Biz Day calc refined to Cash+Bkash only (`_isPayVehicle = t => /cash|bkash/i.test(t.type)` — excludes Final Settlement from today's gross). This yielded ৳26,000, still off by ARNOB's ৳500 FS.
- Superseded by v3.4.3 — this attempt got the ghost filter right but the Biz Day math wrong.

Per-Reservation Payment Dedup (v3.4.3 — 2026-04-24, commit `300be9d` + Dashboard follow-up):
- Symptom: MOHAMMAD ZUNAIR (Room 509) had staff-posted both a ৳4,000 Cash tx AND a ৳4,000 Final Settlement tx for the same stay (staff double-post / data-entry bug in DB). Biz Day summed both → ৳30,500. Owner wanted ৳26,500 (one payment per stay). Separately, ARNOB N's FS of ৳500 was a real collection with no cash counterpart and MUST count.
- Root cause: Cash-only filter (v3.4.2) dropped ARNOB's legitimate ৳500. Raw sum (pre-fix) double-counted ZUNAIR's ৳4,000. Neither captures the correct accounting intent.
- Fix — `_bizDayTotal(list)` / `_bizDayTotalDash(list)`: per-reservation dedup bucket keyed by `reservation_id || room_number|guest_name|fiscal_day`.
  - Cash/Bkash accumulates into `pay`, sets `hasCash=true`.
  - Final Settlement (positive amount only) accumulates into `fsPos`.
  - Final contribution per key: `hasCash ? pay : fsPos`. ZUNAIR double-post collapses to ৳4,000; ARNOB FS-only counts as ৳500.
  - Negative Final Settlement (refunds — DIDARUL ISLAM ৳-500) excluded from headline gross; they adjust prior revenue, not today's collection.
  - "Stay Extension" / "Room Charge" / any non-payment tx type contributes 0 (matches neither regex).
- Applied in TWO places (must stay in sync):
  - BillingPage ~L2294 (`_bizDayTotal`) — fixed first, commit `300be9d`.
  - Dashboard ~L630 (`_bizDayTotalDash`) — second pass after owner screenshot showed Dashboard still ৳35,000 while Billing read ৳26,500. Logic is a local duplicate, not hoisted. Both functions must be updated together if this math changes.
- Verification against live DB (`fiscal_day='2026-04-24'`, 11 rows): dedup produced exactly ৳26,500. Matches both Billing and Dashboard surfaces.
- Invariant: "Today's Revenue" on any surface must use per-reservation dedup. Never sum raw `transactions.amount` without bucketing. If a staff member posts both Cash and Final Settlement for the same stay, only Cash counts (it is the payment vehicle; FS is the accounting closeout). If a stay settles via FS with no cash counterpart (ARNOB-style), the FS counts.
- DB hygiene follow-up (pending owner action, not code): MOHAMMAD ZUNAIR Room 509 has duplicate ৳4,000 FS row (id `9d212286…`) that should be deleted to remove the double-post from raw reports and other consumers.
- Edit-tool truncation recurrence (fourth time this feature line): Dashboard edit truncated tail again, ending mid-word `{cu`. Restored via `/tmp/prev_full.html` splice (head through guests-route line + prev_full housekeeping-onward). Post-restore: 4216 lines, `ReactDOM.createRoot` count=1, `</html>` present, `@babel/parser` parses OK (454,202 bytes).
- Deploy cache gotcha: After push + Vercel build READY, owner screenshot STILL showed old ৳35,000. Curl confirmed live JS contained `_bizDayTotalDash` (ETag match). Root cause: browser was serving a stale cached bundle. Fix: Ctrl+Shift+R (hard-reload). Add this to the verification checklist for any visual-math change.

Canonical Dhaka Date Helpers + 4-Bug Hotfix (v3.5 — 2026-04-25):
- Scope: Four production bugs fixed in `public/crm.html` in one pass. Bug #1 — Md Shakawat Hossain (Room 506) reservation showed ৳3,500/৳0 balance but Billing ledger read ৳3,999/৳499 (off-by-one ghost balance). Bug #2 — Md Sohag Babu's ৳8,000 paid Apr-24 appeared in Apr-25 Today report. Bug #3 — Chanchal Das ৳3,000 paid Apr-24 appeared same day (same root cause as #2). Bug #4 — Live clock displayed `Sun, 26 Apr 2026` while wall time was `Sat, 25 Apr 2026` (+24h offset).
- Root cause (Bugs #2–#4): pervasive use of `new Date(d.toLocaleString('en',{timeZone:'Asia/Dhaka'}))`. The localized string is then re-parsed by the **browser's** local TZ — so on a machine in Asia/Dhaka the round-trip is identity, but on UTC/PST/etc. it shifts hours and can flip the day. Triggered the +24h clock skew and made Today filters slip a day for late-evening payments.
- Root cause (Bug #1): `computeBill` recomputed total from `roomCharge + extras - discount` and ignored the canonical `reservations.total_amount` written at booking. Floating-point/rounding drift between the two paths produced ৳3,999 vs ৳4,000.
- Fix — new canonical date helpers (must be used everywhere; never call `toLocaleString` for date math again):
  - `_dhakaParts(d=new Date())` — wraps `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',hourCycle:'h23',...}).formatToParts(d)` and returns `{y,m,d,H,M,S}` strings. The `formatToParts` API extracts components directly with no string round-trip, so it is browser-TZ-agnostic by construction.
  - `todayStr()` — returns Dhaka-local `YYYY-MM-DD` for filter equality (`t.fiscal_day === todayStr()` etc.).
  - `todayDhaka()` — returns a `Date` object whose wall-clock components match Dhaka, suitable for relative comparisons inside the renderer.
  - All three live near top of script (~L40–41) so they are hoisted before any consumer.
- Fix — clock display (~L3939–3949): rebuilt `clockStr` to use `_dhakaParts`-style `formatToParts` directly. No more `new Date(toLocaleString())` re-parse. Month name array indexed by `parseInt(_p('month'))-1`.
- Fix — Today filter in BillingPage (~L2238): `todayT = transactions.filter(t => _txWallDay(t) === todayStr())` where `_txWallDay(t)` derives the wall-clock day from `t.created_at` via `_dhakaParts`, falling back to `t.fiscal_day` only if `created_at` missing. This anchors "Today" to the actual payment timestamp's Dhaka calendar day, not the stay window.
- Fix — `computeBill` canonical total (~L2338–2343): `canonical = +r.total_amount || 0; rawTotal = canonical>0 ? canonical : (sub>0 ? sub : 0); total = max(0, rawTotal - discount)`. Booking-time canonical wins over recomputation. PDF export `bill_total` (~L2543) updated symmetrically: `(+res.total_amount||0) || bill.sub`.
- Invariant: **never** use `new Date(d.toLocaleString('en',{timeZone:'Asia/Dhaka'}))` again. Any day/time math that needs to be Dhaka-correct on every browser MUST go through `_dhakaParts` / `todayStr` / `todayDhaka`. Grep `toLocaleString.*Asia/Dhaka` before any future commit — should return zero matches in client code.
- Invariant: `reservations.total_amount` is the canonical bill total. `computeBill` may fall back to `roomCharge+extras` only when canonical is missing (legacy rows). Display, PDF, and ledger math must all agree on this hierarchy — divergence is a regression.
- Edit-tool truncation recurrence (fifth time): Edit pass shrank `public/crm.html` tail again, ending mid-token at `{cur==='rooms'        &`. Restored from git HEAD (lines 4193–4216) and `truncate -s 460826` to remove the orphan remnant. Post-restore: 460,826 bytes, ends cleanly with `</html>\r\n`, brace/paren/bracket signature matches HEAD (same `-1` paren delta is a regex-literal artifact of the brace counter, not a defect).
- Pending owner action: push from Windows + verify deploy md5 + Ctrl+Shift+R to bust browser cache.

Day Reset + FK Schema Correction (v3.5.1 — 2026-04-25, post-deploy):
- Trigger: After v3.5 deploy verified (`_dhakaParts` present in live, header reads `Sat, 25 Apr 2026` ✓, BIZ DAY chip reads `25-APR-2026` ✓), owner requested `remove all data inputs todays` for a clean operational reset of 2026-04-25.
- Pre-reset diagnostics: `active_fiscal_day` had been over-advanced (rolled twice on 2026-04-25 — at 04:02 Dhaka from 04-24→04-25, then again at 13:35 Dhaka from 04-25→04-26). Manually rolled it back via `UPDATE hotel_settings SET value='2026-04-25' WHERE key='active_fiscal_day'`. Re-stamped 7 tx rows that had been bucketed to fiscal_day='2026-04-26' but were created on 2026-04-25 wall day.
- Reset performed (Option A — full reset): backups created in `transactions_deleted_20260425` (24 rows, ৳91,500), `folios_deleted_20260425` (1 row, ৳499), `reservations_deleted_20260425` (12 rows). Then DELETE all rows where `(created_at AT TIME ZONE 'Asia/Dhaka')::date='2026-04-25'`. Folios and tx deleted directly (no FK cascade available, see below); reservations deleted last to clean any remnants.
- Critical schema correction — v3.1 MEMORY entry was WRONG about `transactions.reservation_id`:
  - **CLAIM (v3.1):** "`transactions.reservation_id` and `folios.reservation_id` are `NOT NULL` with FK → `reservations(id) ON DELETE CASCADE`."
  - **REALITY (verified via `pg_get_constraintdef` 2026-04-25):**
    - `folios.reservation_id` → `reservations(id) ON DELETE CASCADE` ✓ (matches claim)
    - `transactions.reservation_id` has **NO FK constraint** at all
    - `transactions.res_id` (legacy column) → `reservations(id) ON DELETE SET NULL`
  - The FK was added to the wrong column or never migrated to the canonical column when the v3.2 RoomModal fix promoted `reservation_id` as the join key.
- Consequence: 24 pre-existing orphan tx (dates 2026-04-04 → 2026-04-23, sum ৳70,680) point to deleted reservations. They were already orphaned BEFORE today's reset; the cleanup just made them visible. They inflate `THIS MONTH` KPI by ৳70,680 (real total ৳713,801 vs displayed ৳784,481).
- Backfill attempt (v3.1 logic — match by `room_number + fiscal_day ∈ [check_in, check_out]`): 0/24 matched. The reservations these orphans tied to are completely deleted; no surrogate reservation exists on the same rooms (any date) or under the same guest names. Backfill against existing reservations is impossible.
- Owner aborted further orphan handling. Three options remained on the table for future cleanup: (a) recreate phantom reservations from tx data, (b) hard delete orphans, (c) demote `reservation_id` to NULL on the 24 rows.
- Invariant correction: `transactions.reservation_id` IS the canonical join key (per v3.2), but it currently has no FK protection. Any deletion from `reservations` will silently orphan related tx until the FK is added. Add this migration before any further bulk reservation deletes:
  ```sql
  -- 1. Decide what to do with current 24 orphans (delete/recreate/null) FIRST.
  -- 2. Then add the FK:
  ALTER TABLE transactions
    ADD CONSTRAINT transactions_reservation_id_fkey
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
  -- 3. Optionally drop the legacy res_id column after migrating any data:
  -- ALTER TABLE transactions DROP COLUMN res_id;
  ```
- Invariant: backup tables `*_deleted_YYYYMMDD` are the audit trail for reset operations. Do not drop them; archive into a `_audit` schema if needed.

RecordPayModal Discount Double-Count + Final Settlement Ghost Bleed (v3.5.2 — 2026-04-26):
- Symptom A: Shanwaz Ahmed (Room 304, Total ৳4,000 / Discount ৳500 / Paid ৳1,000). Reservation modal, Room detail modal, and Billing ledger row all correctly showed Balance Due ৳2,500. The "+ Pay" → Record Payment modal alone showed Balance Due ৳2,000 (off by ৳500). Amount field auto-filled ৳2,000 — collecting that would leave a ghost ৳500 residue.
- Root cause A: Billing row passed `_total: tTotal` where `tTotal = computeBill(r).total`, and `computeBill` returns `rawTotal − discount` (line 2366). `RecordPayModal` (line 2898) then computed `lockedDue = _total − _discount − _paid` — applying discount twice. Modal also displayed `_total` as 3,500 in its "Total" cell, contradicting every other surface.
- Symptom B: MD SHAKAWAT HOSSAIN (Room 506, settled). Billing row Paid column read ৳3,500 / Balance Due ৳0 ✓ but the "Payments (Filtered)" chip column showed both `Room Payment (Cash) ৳3,500` AND `Final Settlement ৳3,500` (sum ৳7,000) — a phantom 2× of actual money received.
- Root cause B: `doCheckout()` at L878 posted a Final Settlement transaction for the **full `total`** at every checkout, regardless of how much had already been collected via Cash/Bkash. So a fully-prepaid stay always wrote a duplicate FS row mirroring the Cash payment. `_bizDayTotalDash` already deduped this for KPI math (line 637, "Cash takes priority over FS"), but the Billing row's per-row `byType` aggregator did not — so the ledger surface displayed inflated sums.
- Fix A — `crm.html:2754`: when opening RecordPayModal from a billing row, pass `grossTotal = r ? (+r.total_amount||0) : tTotal` instead of `tTotal`. Modal now subtracts discount exactly once. Total cell displays canonical ৳4,000; Balance Due math collapses to 4,000 − 500 − 1,000 = ৳2,500. `payCap` inside `save()` now correctly equals 3,500 (was 3,000), so settling the full balance no longer leaves a ghost residue.
- Fix B1 — `crm.html:874-882` (`doCheckout`): post Final Settlement ONLY for residual unpaid amount, and skip the post entirely when residual=0. Tx now also carries `reservation_id: activeRes.id` so the row is anchored per v3.1.
  ```js
  const residual = Math.max(0, total - (+activeRes?.paid_amount||0))
  if (residual > 0) await dbPost('transactions',{type:'Final Settlement',amount:residual,reservation_id:activeRes.id,...})
  ```
- Fix B2 — `crm.html:2721-2731` (Billing row `byType` aggregator): apply same dedup as Dashboard `_bizDayTotalDash` — when any Cash/Bkash tx exists for the reservation, suppress Final Settlement chips from the row sum. This makes existing legacy duplicate FS rows render correctly without DB mutation.
- Pending DB hygiene: 1+ legacy duplicate FS row(s) exist (confirmed: MD SHAKAWAT HOSSAIN Room 506, fiscal_day 2026-04-25, ৳3,500). Display dedup hides them from UI but they still inflate raw `SELECT SUM(amount) FROM transactions` queries. Optional cleanup SQL provided in chat — owner deferred execution.
- Architecture rule reinforced (4th instance of this pattern, see v3.4.3, v3.5 Bug #1, v3.5.1):
  - **`transactions` table records real money movements only.** Never write a synthetic mirror of `paid_amount` (e.g. "Final Settlement = full bill" at checkout). Every consumer that sums `transactions.amount` would otherwise have to reverse-engineer the dedup, and at least one always misses (Billing row `byType` did this time).
  - **Pass canonical fields, not derived ones, across component boundaries.** `_total` between BillingPage and RecordPayModal is canonical `r.total_amount` (gross). `computeBill().total` is derived (net of discount) and is for display, not for re-deriving dependent values downstream. Mixing the two is the root pattern of the "৳13,600 Rule" / ghost bleed family.
- Edit-tool stability: 3 surgical edits to `public/crm.html` in this session, no truncation. Tail-check (`grep -c ReactDOM.createRoot` + `grep -c </html>`) verified after each edit.
- Verification: deployed and live-verified 2026-04-26. Owner confirmed Shanwaz Ahmed (304) Record Payment modal reads ৳2,500 balance and MD SHAKAWAT HOSSAIN (506) row payment chip suppresses duplicate FS. Marker grep `pass GROSS total_amount` returned LIVE.
- Status: **LIVE** — commit chain `29728ea` (Fix A) → `728bda6` (Fix B1 doCheckout) → `3cb9547` (Fix B2 row dedup) → `cb7be26` (consolidated tag). Vercel deploy READY 2026-04-26.

BIZ DAY KPI Dedup Key Fragmentation (v3.5.3 — 2026-04-26):
- Symptom: After v3.5.2 deploy, Dashboard "Today's Revenue" correctly read ৳4,500 (Shanwaz ৳1,000 + MD SHAKAWAT ৳3,500 deduped). Billing & Invoices "BIZ DAY" KPI read ৳8,000 — counting MD SHAKAWAT's Cash AND Final Settlement as ৳3,500 each (৳7,000) plus Shanwaz ৳1,000.
- Root cause: dedup key in both `_bizDayTotal` (Billing) and `_bizDayTotalDash` (Dashboard) was `t.reservation_id || \`${room}|${guest}|${fiscal_day}\``. Two compounding bugs:
  1. Most tx-write paths (`RecordPayModal.save`, `saveCollectAmount`, pre-v3.5.2 `doCheckout`) leave `reservation_id` NULL — so fallback key is hit for nearly every tx. The `||` short-circuit was effectively dead code.
  2. The fallback included `fiscal_day`. When `active_fiscal_day` rolls mid-session (v3.5.1 logged this happening twice in one Dhaka day), a Cash tx posted at 23:50 with `fiscal_day='2026-04-25'` and an FS tx posted at 00:30 with `fiscal_day='2026-04-26'` got DIFFERENT fallback keys for the same stay → dedup missed → both counted.
- Why Dashboard appeared correct: it pre-filters `transactions.filter(t => t.fiscal_day === today)` BEFORE running `_bizDayTotalDash`. The drifted FS row gets dropped from the input entirely. Dashboard wasn't deduping — it was silently hiding the misdated row. Billing pre-filters by `_txWallDay` (created_at Dhaka day) which kept both rows in scope and exposed the broken dedup.
- Fix (`crm.html` L641 + L2327): drop both `reservation_id` and `fiscal_day` from the dedup key. New key is `${room_number||''}|${guest_name||''}`. Justification: the input list is ALREADY day-filtered before `_bizDayTotal*` runs, so fiscal_day in the key is redundant noise that fragments same-stay buckets when active_fiscal_day drifts. `reservation_id` was inert because it's null on most tx rows.
- Edge cases verified mentally: same guest two separate stays same day (over-collapse, but for daily revenue dedup that's intentional — represents "what this stay paid today"). Different guests same room same day (separate buckets ✓ via guest_name). Walk-in with no guest_name (single empty-key bucket — pre-existing edge case, unchanged).
- Architecture rule reinforced: **dedup keys must be deterministic across all tx-write paths.** If a write path can omit a field, that field cannot be a discriminator in the key. `reservation_id` and `fiscal_day` both fail this test. Only `room_number` + `guest_name` are written by every path.
- Verification: deployed and live-verified 2026-04-26. Owner confirmed Dashboard Today's Revenue and Billing BIZ DAY both read ৳4,500 identically. Marker grep `v3.5.3` returned LIVE.
- Status: **LIVE** — commit `3a15639`. Vercel deploy READY 2026-04-26.

Closing Complete Idempotency Guard (v3.5.4 — 2026-04-26):
- Symptom: Real Dhaka wall day = 2026-04-26. Front office staff clicked "Closing Complete" extra times during the day, advancing `active_fiscal_day` from 2026-04-26 → 2026-04-27 → 2026-04-28. Live BIZ DAY chip and KPIs read "28-APR-2026" against a real Apr 26 wall. All today's tx writes received `fiscal_day='2026-04-28'`, breaking every date-bucket query.
- Root cause: `doClosingComplete()` (~L2423) had no upper bound on advancement. It computed `nextDay = today + 1` and POSTed unconditionally to `hotel_settings.active_fiscal_day`. No confirmation prompt either — single accidental click silently rolled the day. Open Investigation in CLAUDE.md explicitly flagged this exact failure mode (logged in v3.5.1) — finally fixed here.
- Fix (`crm.html:2423`): two stacked guards at function entry:
  1. `if (nextDay > _wallToday) return` — refuses any advance that would push BIZ DAY strictly ahead of current Dhaka calendar day. Allowed direction: catch-up only (today < wallToday). Refused: today >= wallToday.
  2. `window.confirm(...)` — explicit "Close BIZ DAY X and advance to Y?" prompt. Single-click no longer triggers a one-way operation.
- DB cleanup performed in tandem (Supabase SQL editor):
  - `UPDATE hotel_settings SET value='2026-04-26' WHERE key='active_fiscal_day'` — rolled BIZ DAY back to wall.
  - `DELETE FROM transactions WHERE type='Balance Carried Forward' AND fiscal_day > '2026-04-26'` — removed phantom carry-forward rows the bad closes wrote into Apr 27 and Apr 28.
  - No real-money txs needed re-stamping (today's actual payments already had correct created_at; only the synthetic BCF rows were dated to phantom days).
- Architecture rule: **state-mutating "advance" buttons must be idempotent within their natural cycle.** Day-rollover, month-close, year-end — all should compute the target state and refuse if the system is already at-or-past that state. Confirm prompts on one-way operations are mandatory; muscle-memory clicks shouldn't be able to mutate global state.
- Related Open Investigation in CLAUDE.md (v3.5.1) → **CLOSED** by this entry.
- Verification: deployed and live-verified 2026-04-26. UPSERT on `hotel_settings.active_fiscal_day` with value '2026-04-26' for tenant `46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8` reset BIZ DAY chip from 28-APR back to 26-APR after page reload. Pre-fix DB state: row missing entirely (page was holding stale React state from earlier session when row had value '2026-04-28'). Post-UPSERT: row authoritative, chip correct.
- Status: **LIVE** — commit `b3d553d`. Vercel deploy READY 2026-04-26.

Day Reset 2026-04-26 (v3.5.5 — 2026-04-26):
- Trigger: After v3.5.4 deploy + BIZ DAY restored to 26-APR, owner requested clean reset of all data created on 2026-04-26 Dhaka wall day. Same playbook as v3.5.1 reset of 2026-04-25.
- Pre-reset diagnostic (Dhaka-local `created_at = '2026-04-26'`, tenant `46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8`):
  | Table | Rows |
  |---|---|
  | reservations | 15 |
  | transactions | 23 |
  | folios | 1 |
- Backups created (per v3.5.1 invariant — never drop these audit tables):
  - `transactions_deleted_20260426`
  - `folios_deleted_20260426`
  - `reservations_deleted_20260426`
- Deletion order: transactions → folios → reservations (transactions.reservation_id has NO FK per v3.5.1 verified schema; manual cascade required).
- Filter strategy: Dhaka-local `(created_at AT TIME ZONE 'Asia/Dhaka')::date = '2026-04-26'` rather than fiscal_day. This catches real wall-day records regardless of `active_fiscal_day` drift — important after the Closing Complete over-advance bug (v3.5.4) that had stamped some rows with fiscal_day='2026-04-28'.
- Post-reset verify: all three tables returned 0 rows for the filter ✓.
- Caveat carried into next session: any reservation that checked in on 2026-04-25 but whose Apr 26 payment was wiped by this reset will show its prior balance as outstanding. Owner accepted this trade-off (no Apr 25 reservations in scope today; clean slate preferred).
- Pending FK migration from v3.5.1 still not applied: `transactions_reservation_id_fkey FK ... ON DELETE CASCADE`. Each reset cycle re-exposes this gap. Add to next sprint.
