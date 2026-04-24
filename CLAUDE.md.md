# Hotel Fountain CRM - Project Guidelines (HF-Core)

## Core Business Logic
- **Ledger Filtering:** A row must ONLY appear on the Daily Report if:
    - `(Paid > 0 OR Due > 0)` AND `(Payment/Record Date == Today)`.
    - Prevent "ghost rows" (rooms with 0 balance appearing on today's report).
- **Billing Calculation:** Total Dues = (Previous Dues + Today's Charges) - Today's Payments.

## Access Control (Role Security)
- **Front Desk:** Strictly NO access to SEO or GEO Agent tools.
- **Admin:** Full access to all modules including AI Leads and Marketing.

## Key Features & Modules
- **AI Leads Tab:** Active module for lead management.
- **Billing Ledger:** Core financial tracking with strict date-filtering.
- **Saturday Schedule:** Automation/Reporting scheduled for weekly Saturdays.

## Technical Standards
- **Git Flow:** Use `Remove-Item .git/*.lock` before commits to prevent terminal hangs in the local environment.
- **Commit Pattern:** Use `feat:` for new features and `fix:` for logic corrections.
- **Frontend:** Maintain the integrated `crm.html` structure.

## Memory Trigger
- When requested with **"HF-Fix"** or **"HF-Core"**, apply all above rules to any code generation.

---

## Architecture Snapshot (2026-04-24 · HEAD `ef923ee`)

| Area | Detail |
|---|---|
| Deploy target | Vercel → `https://hotelfountainbd.vercel.app/crm.html` |
| Only served file | `public/crm.html` (static, Babel Standalone inline) |
| DB | Supabase Postgres, TENANT=`46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8` |
| AI | Supabase Edge Function `ai-agents` (Deno) · Gemini 2.5 Flash · project `mynwfkgksqqwlqowlscj` |
| Locale | BDT · Asia/Dhaka |
| Brand | Gilded Threshold — `#1C1510` / `#C8A96E` / `#8D6F57` / `#FBF8F3` |

## Key Schema

| Table | Important cols |
|---|---|
| `reservations` | `room_ids[]`, `guest_ids[]`, `rate_per_night`, `discount_amount`, `total_amount`, `paid_amount`, `status` |
| `folios` | `room_number`, `reservation_id`, `description`, `category`, `amount` |
| `transactions` | linked to reservation + folio |
| `hotel_settings` | holds `front_desk_brief` payload for AI Research |
| `leads` | AI Prospector output (`status` lifecycle: new → email_drafted → briefed_to_front_desk → contacted → converted) |

## Recent Fixes (commit `5f6553e` · 2026-04-24)

| # | Feature | Location in `public/crm.html` |
|---|---|---|
| 1 | Multi-room reservation edit (chip selector + add/remove + free/occupy on save) | `ReservationDetail` ~L1149 |
| 2 | DUE filter tab (rose pill · CHECKED_IN/OUT with `total > paid`) | Reservations tab ~L1075–1092 |
| 3 | `Phone` → `Contact Number` (required) | `AddGuestModal` |
| 4 | Print Invoice — Gilded Threshold A4 · per-room breakdown · guest detail block · totals panel | `printInvoice(grp,res,tTotal,tPaid,tDue,byType,bill,guest)` ~L1949 |
| 5a | AI agents edge function v13 — robust `extractJSON` (balanced bracket scanner) + graceful non-JSON fallback in client `callAgent` | `callAgent` ~L3020 · edge fn `ai-agents` v13 |
| 5b | `🧠 AI Research` tab (brief card + leads + status filters + copy email) | `AIResearchPanel` before `WorkflowMonitor` |

## Hotfixes (2026-04-24 later · commits `17029a1` → `c49143c`)

| Commit | Fix | Location |
|---|---|---|
| `17029a1` | Restore truncated main App render tree (sidebar + page routes + closing `</script></body></html>`) — file was cut at L3759 mid-word `<em>F` causing "Unterminated JSX contents" on live site | EOF ~L4004–4027 |
| `99472e8` | RoomModal ghost/bleed fix — drop phantom `VAT 15%` + `Service Charge 5%` rows (hotel is not VAT-registered in CRM flow) | RoomModal summary panel ~L920–935 |
| `99472e8` | RoomModal folio filter — exclude admin folios matching `/receivable\|payment\|settlement\|advance\|refund/i` from guest-facing `extras` | RoomModal ~L816 |
| `99472e8` | RoomModal multi-room proration — `discount` and `paid` prorate by `roomRate/resRatesSum`; `due = max(0,total-paid)`; panel shows Subtotal / Discount / Total / Paid / Balance Due | RoomModal ~L818–832 |
| `99472e8` | ReservationDetail per-room `+ Charge` button — next to each chip when res id exists and status is CHECKED_IN/OUT; opens `AddChargeModal(roomNo=rn, resId=res.id)` | ReservationDetail ~L1286–1296 + `chargeFor` state + render before `</Modal>` |
| `0748824` | Universal balance formula **`Balance = Total − Discount − Paid`** across all surfaces — was ignoring `discount_amount` everywhere | see table below |
| `c49143c` | `Today's Revenue` / `BIZ DAY` now sum today's **transactions** (fiscal_day=today, type≠'Balance Carried Forward') — previously summed `reservations.paid_amount` which is lifetime-paid per stay and inflated every day the guest stayed checked-in | Dashboard ~L627 · BillingPage ~L2211 |
| `ef923ee` | RecordPayModal (+ Pay flow) — apply `Balance = Total − Discount − Paid` to dueResList / lockedDue / dropDueAmt / pickRes / dropdown / locked footer / selRes summary; pass `_discount` through from Billing `+ Pay` caller; cap `paid_amount` patch at `(total − discount)` so balance never goes negative | Billing table ~L2565 · RecordPayModal ~L2698–2832 |

### Universal Balance Formula (`0748824`) — every surface

| Surface | Before | After |
|---|---|---|
| ReservationsPage table Balance col | `total - paid` | `resBalance(r)` = `max(0, total - discount - paid)` |
| `dueCount` badge + DUE filter | `total > paid` | `resBalance(r) > 0` |
| BillingPage `outstanding` aggregate | `total - paid` | `_resDue(r)` = `max(0, total - discount - paid)` |
| BillingPage `dueRes` filter | `total > paid` | `_resDue(r) > 0` |
| Day-close `duesCarried` rows | `total - paid` | `total - discount - paid` (also emits `discount` field in row data) |
| Billing ghost-filter | `total - paid` | `max(0, total - discount - paid)` |
| RecordPayModal `dueResList` / locked `lockedDue` / `dropDueAmt` / `pickRes` / dropdown / selRes summary | `total - paid` | `_resDue(r)` inline; Billing `+ Pay` caller passes `_discount:tDiscount`; locked footer renders Discount row when `>0` |
| RecordPayModal `save()` patch | `paid = min(total, paid+a)` | `paid = min(total - discount, paid + a)` |

### RoomModal prop dependency
`RoomsPage` MUST pass `rooms={rooms}` to `RoomModal` — required by multi-room discount proration (`resRatesSum` lookup). See `RoomsPage` ~L782–786.

### `computeBill(r)` contract — multi-room aware
Returns: `{ roomCharge, extras, sub, tax, svc, discount, total, paid, due, folios, nights, roomRate, vatPct, svcPct, perRoom, topFolios }`
- `perRoom[]` = `{room_number, category, rate, nights, roomSubtotal, extras, folios, subtotal}`
- `topFolios[]` = folios not attributable to any room on the reservation
- Falls back to `r.total_amount` only when `sub === 0`

### `printInvoice` signature (extended)
`printInvoice(grp, res, tTotal, tPaid, tDue, byType, bill, guest)`
- `bill` from `computeBill(r)` — drives per-room HTML + totals panel
- `guest` from `guests.find(g => String(g.id) === String(r.guest_ids?.[0]))` — drives Billed-To block

## Known Footguns

| Issue | Mitigation |
|---|---|
| `fmtDate` was declared twice (const L39 + function L2138) | **Removed** function declaration — only keep `const fmtDate = d => d ? String(d).slice(0,10) : '—'` |
| `printInvoice` call site must pass `bill` + `guest` or per-room breakdown renders empty | See BillingPage Print button ~L2559 |
| Windows/OneDrive mount refuses `unlink` on `.git/*.lock` | Use `python3 os.rename(f, f+'.moved')` to sidestep; never `rm -f` |
| `.git/HEAD` can get null-byte-padded by interrupted Windows writes → `fatal: your current branch appears to be broken` | Rewrite via `python3 open('.git/HEAD','wb').write(b'ref: refs/heads/main\n')` |
| **OneDrive save-truncation** — `public/crm.html` tail (closing `</script></body></html>`) can be lost on save during this session | After every large edit, verify `tail -5 public/crm.html` shows `</html>`; restore tail via `git show HEAD:public/crm.html` + Python write |
| `Today's Revenue` must never sum `reservations.paid_amount` | Always sum `transactions WHERE fiscal_day===today AND type!=='Balance Carried Forward'`. `paid_amount` is cumulative-per-stay and inflates every day a guest stays checked-in |
| Revenue / Balance / Discount math | Canonical rule: **`Balance = Total − Discount − Paid`**. Never subtract only paid. Apply 