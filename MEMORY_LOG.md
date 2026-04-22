# Hotel Fountain BD CRM — Project Memory Log

**Project:** Hotel Fountain BD CRM (`hotelfountainbdCRM`)
**Stack:** Next.js · Supabase · React (inline JSX in `public/crm.html`) · Vercel
**Tenant ID:** `46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8`
**Supabase Project:** `mynwfkgksqqwlqowlscj`
**Primary branch:** `main` (Vercel deploys from here)

---

## Final Decisions & Architecture

### Data Layer
- **Single source of truth for billing:** `computeBill(r)` in `public/crm.html`. All balance/total displays must route through this function or mirror its formula: `net = total_amount − discount_amount − paid_amount`.
- **Transaction writes** must always include `reservation_id` (UUID) to prevent room-based transaction bleed between guests.
- **Cascade delete order:** folios → transactions (by `reservation_id`) → reservation row. Never delete the reservation first.
- **`total_amount`** stores gross room charge (rate × nights). **`discount_amount`** is separate. Net payable = `total_amount − discount_amount`.
- **Date fields** (`check_in`, `check_out`) are stored as `date` type (`YYYY-MM-DD`). Never send ISO timestamps.
- **Removed fields** that do not exist as Supabase columns and must never be sent in POST/PATCH: ~~`stay_type`~~, ~~`discount_amount`~~ (now added — see migrations).

### Folio / Transaction Grouping
Three-stage matching (prevents ghost-bleed):
1. **Stage 1:** Match by `reservation_id` UUID (exact anchor)
2. **Stage 2:** Match by `guest_name` + `room_number` (two-field constraint, requires guest UUID lookup)
3. **Stage 3:** Orphan bucket keyed `orphan|guest_name|room_number` — **never** falls back to room number alone

### Supabase Helpers (crm.html ~line 49)
- `dbPost` / `dbPatch` parse Supabase JSON error body (`{message, hint}`) and surface it in the toast.
- `dbDeleteWhere(table, col, val)` — deletes by any column, used for cascade.

---

## Schema Migrations Applied

| Migration | Date | Description |
|-----------|------|-------------|
| `add_discount_amount_to_reservations` | 2026-04-22 | `ALTER TABLE reservations ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0`. Back-filled from legacy `discount` column. |

### reservations table — key columns
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `total_amount` | numeric | Gross room charge |
| `paid_amount` | numeric | Total collected |
| `discount_amount` | numeric | Discount (added 2026-04-22) |
| `discount` | numeric | Legacy column, kept for backward compat |
| `check_in` | timestamptz | Store as `YYYY-MM-DD` via `todayStr()` |
| `check_out` | timestamptz | Same |
| `status` | text | `CHECKED_IN` \| `RESERVED` \| `CHECKED_OUT` \| `CANCELLED` \| `pending` |
| `payment_method` | text | |
| `on_duty_officer` | text | |
| `special_requests` | text | |
| ~~`stay_type`~~ | — | **Does not exist** — never send |

---

## Bug Fixes Log

### 1. UUID-targeted Delete + Optimistic UI (branch: `claude/refactor-delete-reservation-id-CYJHN`)
- **Problem:** Delete used room number, not UUID. State did not update until reload.
- **Fix:** `deleteReservation(id)` — optimistic state filter → cascade delete → `loadAll()`. Revert on failure.
- **Reservations query** re-ordered to `created_at.desc`.

### 2. Room 506 Ghost Bleed (৳13,600)
- **Problem:** Deleting guest A's reservation caused guest B (same room) to inherit A's payment data. Folio grouping keyed on `room_number` alone.
- **Fix:** Three-stage UUID-first matching. Pure room-number fallback removed.

### 3. Four Surgical Fixes
- **Cascade delete:** `deleteReservation` now `Promise.all([dbDeleteWhere('folios','reservation_id',id), dbDeleteWhere('transactions','reservation_id',id)])` before `dbDelete`.
- **Check-In 400:** `check_in: new Date().toISOString()` → `check_in: todayStr()` (date column needs `YYYY-MM-DD`).
- **Calendar button:** Hidden date input set to `pointerEvents:'none'`; button `onClick` calls `el.showPicker()` with `el.click()` fallback.
- **Dropdown contrast:** GuestSearch and RecordPayModal dropdowns use `color:var(--tx-inv)` on dark `var(--s1)` background.

### 4. `stay_type` 400 Error
- **Problem:** `stay_type` column does not exist in Supabase. POST was sending it.
- **Fix:** Removed from `NewReservationModal` POST payload permanently.

### 5. `reservation_id` Missing from All Transaction Writes
- **Problem:** All 4 transaction insert sites only wrote `room_number`, enabling ghost bleed.
- **Fix:** Added `reservation_id` to `doCheckout`, `saveCollectAmount`, `NewReservationModal.save()`, `RecordPayModal.save()`. `NewReservationModal` now captures `const [newRes] = await dbPost('reservations',{...})` to obtain the UUID.

### 6. Supabase Error Body Surfaced in Toasts
- `dbPost` / `dbPatch` now parse `{message, hint}` from Supabase JSON error response and show exact column name in toast.

### 7. `discount_amount` 400 Error
- **Problem:** Column did not exist; `discount_amount` was being sent in POST/PATCH.
- **Fix (step 1):** Removed field as emergency fix.
- **Fix (step 2):** Added column via migration, restored field to POST and PATCH.

### 8. Discount Not Applied to Balances (10 sites)
- **Problem:** `computeBill()` (Billing & Invoices) correctly subtracted discount, but Reservations list, detail modal, DUE filters, outstanding tally, checkout panel, and RecordPayModal all computed `balance = total_amount − paid_amount` (no discount).
- **Fix:** Applied `net = total_amount − discount_amount − paid_amount` consistently at all 10 sites:
  - Reservations list: TOTAL column + BALANCE column
  - DUE count badge + DUE tab filter
  - ReservationDetail modal: `totalAmt` and `balance`
  - Checkout panel: `basePrice`
  - Dashboard outstanding tally + `dueRes` filter
  - RecordPayModal: `dueResList` filter, `dropDueAmt`, `pickRes` due, dropdown display, summary row

### 9. Landing Page Images Not Loading
- **Problem:** `src/app/page.tsx` ROOMS array referenced `/room-fountain-deluxe.jpeg` etc. (`room-` prefix). Uploaded files had no prefix: `fountain-deluxe.jpeg`.
- **Fix:** Removed `room-` prefix from all 5 paths. Fixed `premium-deluxe.jpeg` → `premium-deluxe.jpg` (extension mismatch).

---

## Deployment

- **Platform:** Vercel, auto-deploys from `main`
- **Trigger:** `git push -u origin main`
- **Feature branch:** `claude/refactor-delete-reservation-id-CYJHN` — merged to `main` on 2026-04-22
- All fixes committed directly to `main` after merge

---

## Key File Locations

| File | Purpose |
|------|---------|
| `public/crm.html` | Entire CRM dashboard (~3,500 lines, self-contained React) |
| `src/app/page.tsx` | Public-facing hotel landing page |
| `src/app/billing/page.jsx` | Next.js Billing page (separate from crm.html billing) |
| `src/app/components/NotificationBell.tsx` | Pending reservation notifications |
| `public/` | Static assets: room images, logo, front-view hero |

---

## CSS Variable Reference (crm.html)

| Variable | Value | Use |
|----------|-------|-----|
| `--s1` | `#1C1510` | Dark background |
| `--s2` | lighter dark | Card background |
| `--tx` | dark text | Text on light bg |
| `--tx-inv` | `#EEE8DC` | Text on dark bg (dropdowns) |
| `--tx-inv2` | muted light | Secondary text on dark bg |
| `--grn` | green | Positive amounts, paid |
| `--rose` | red/pink | Balance due, errors |
| `--gold` / `--neon-cyan` | accent | Highlights |

---

*Last updated: 2026-04-22*
