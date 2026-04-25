# CLAUDE.md — Hotel Fountain BD CRM (Lumea)

24-room boutique property in Dhaka. Senior Full-Stack Engineer + Lead UI/UX Designer mode. Concise, technical, direct — no pleasantries.

## Stack & Topology

| Layer | Detail |
|---|---|
| Frontend | React (inline Babel JSX), Tailwind, single-file SPA |
| Live entry point | `public/crm.html` (Vercel-served via `vercel.json` rewrite `/crm.html`) |
| Backend | Supabase / PostgreSQL — project `mynwfkgksqqwlqowlscj` (Bridge Booking) |
| Currency | BDT (`৳`) — Bangladesh VAT/Tax standards |
| Timezone | Asia/Dhaka (UTC+6) — all wall-clock math goes through `_dhakaParts` |

**Critical:** root-level `crm.html` is NOT served. Only `public/crm.html` matters in prod. Verify with `(Invoke-WebRequest https://hotelfountainbd.vercel.app/crm.html).Content` before claiming a fix is live.

## Architecture Invariants

`reservation_id` (UUID) is the single anchor for every financial row. Every `transactions` and `folios` write must carry a non-null `reservation_id`; `dbPostTransactionSafe` throws if missing. `foliosMap` is keyed strictly by `reservation_id` — `room_number` is display metadata, never a join key. Any `?room_number=eq.` folio query is a regression.

**FK reality (verified 2026-04-25, contradicts older v3.1 MEMORY claim):**

| Table | Column | FK | On Delete |
|---|---|---|---|
| `folios` | `reservation_id` | → `reservations(id)` | `CASCADE` ✓ |
| `transactions` | `reservation_id` (canonical) | **NO FK** ⚠ | — |
| `transactions` | `res_id` (legacy) | → `reservations(id)` | `SET NULL` |

Any DELETE from `reservations` will silently orphan related transactions. Migration to add `transactions_reservation_id_fkey FK ... ON DELETE CASCADE` is pending — see `MEMORY_LOG.md` v3.5.1. Until then, treat reservation deletes as a multi-step procedure: explicitly delete tx + folios first, OR run inside a transaction with manual cascade.

`reservations.total_amount` is the canonical bill total. `computeBill` falls back to `roomCharge + extras - discount` only when canonical is missing (legacy rows). Display, PDF, and ledger math must agree on this hierarchy.

`reservations.room_ids` is PG `text[]` (native array), NOT jsonb. Treat it as an array directly — no `JSON.parse`. If it ever arrives as a string, that's a PostgREST config regression — fix the API layer, not the client.

There is **no** `transactions.payment_type` column. Payment method is embedded in `type` as composite: `Room Payment (Cash)` / `Room Payment (Bkash)`. Filters use case-insensitive regex against `type`.

Active Billing Ledger is a roster view over reservations, not a tx log. Any filter that uses tx existence OR non-zero balance as a gate for a `CHECKED_IN` guest is a regression. `dueRes` (outstanding KPI) and `activeRes` (full roster) are not interchangeable.

"Today's Revenue" on any surface uses per-reservation dedup. Never sum raw `transactions.amount` without bucketing. Cash/Bkash takes priority over Final Settlement when both exist for one stay.

## Date & Time — v3.5 Canonical Helpers

Top of script (~L40-41). Use everywhere; never call `toLocaleString` for date math again.

| Helper | Returns | Use for |
|---|---|---|
| `_dhakaParts(d=new Date())` | `{y,m,d,H,M,S}` strings | Component extraction from any Date |
| `todayStr()` | `'YYYY-MM-DD'` Dhaka-local | Filter equality against `fiscal_day` |
| `todayDhaka()` | `Date` w/ Dhaka wall components | Relative comparisons in renderers |

Built on `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',hourCycle:'h23',...}).formatToParts()`. Browser-TZ-agnostic by construction. **Forbidden pattern:** `new Date(d.toLocaleString('en',{timeZone:'Asia/Dhaka'}))` — round-trip parse is browser-TZ-dependent and silently drifts the day.

`active_fiscal_day` (DB row in `hotel_settings`) is the operational night-audit pointer. Live clock = wall time. BIZ DAY label = `active_fiscal_day`. They are not the same thing — and divergence > 1 day means night-audit fired wrong (see below).

## Brand & Visual Standard — Concept 2 (Warm Ivory Editorial)

| Element | Spec |
|---|---|
| Headings | Libre Baskerville |
| Body | DM Sans |
| Numbers / data | IBM Plex Mono |
| Background | `#F9F7F2` |
| Accent (gold) | `#C5A059` |
| Sidebar | `#1A1816` |
| Borders | `1px solid #EAE6DD` |
| Card padding | `2rem` |
| Status badges | "Subtle Glow" — 10% bg opacity, 100% text |
| Modal/transition timing | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Currency display | `৳` symbol, mono font for column alignment |

## Editing Rules

Surgical edits only. Show changed snippets with `// ... existing code` comments — never re-emit the whole file. State: `useState` for local UI, `dispatch` for global data.

After **any** Edit to `public/crm.html`, immediately verify:

```bash
grep -c "ReactDOM.createRoot" public/crm.html  # must be 1
grep -c "</html>" public/crm.html              # must be ≥ 1
wc -c public/crm.html                          # must be ≥ 450KB
wc -l public/crm.html                          # must be ≥ 4150
```

If any check fails, the Edit tool truncated the tail. Restore from git HEAD (`git show HEAD:public/crm.html`) before the next edit. This has happened 5+ times — see `MEMORY_LOG.md` v3.3.1, v3.4, v3.4.3, v3.5.

Brace/paren counter shows `-1` paren diff in HEAD — that's a regex-literal artifact, not a defect. Local file should match (within edit delta).

## Deploy Pipeline

Commits MUST originate from Windows PowerShell (`git add && git commit && git push`). Sandbox bash cannot commit due to `.git/*.lock` Windows-UID ownership. From `C:\Users\ahmed\OneDrive\Desktop\New folder\claude\hotelfountainbd-vercel\Hotel Fountain BD CRM\`:

```powershell
git add public/crm.html MEMORY_LOG.md
git commit -m "fix(vX.Y): <description>"
git push
```

After push, watch Vercel dashboard until commit shows `READY`, then verify a unique marker is in the live bundle (e.g. `_dhakaParts` for v3.5):

```powershell
$live = (Invoke-WebRequest -UseBasicParsing https://hotelfountainbd.vercel.app/crm.html).Content
if ($live -match '<MARKER>') { 'LIVE' } else { 'OLD BUILD STILL SERVED' }
```

Hard-reload Chrome (`Ctrl+Shift+R`) — browser cache will serve the old bundle even after Vercel goes READY (v3.4.3 lesson).

## Bug History (most recent first)

| Ver | Date | Scope | Commit |
|---|---|---|---|
| v3.5 | 2026-04-25 | Canonical Dhaka date helpers + 4 prod bugs (clock TZ, Today filter, canonical bill total) | `10cd760` |
| v3.4.3 | 2026-04-24 | Per-reservation payment dedup (Biz Day) | `300be9d` |
| v3.4.2 | 2026-04-24 | Ghost filter scope to `Balance Carried Forward` rows only | `28012f5` |
| v3.4.1 | 2026-04-24 | Defensive jsonb unwrap + malformed-res guard | `fc20e7d` |
| v3.4 | 2026-04-24 | Active Billing Ledger roster fix (CHECKED_IN visibility) | — |
| v3.3.1 | 2026-04-24 | Hotfix tail restoration after Edit truncation | — |
| v3.3 | 2026-04-24 | Billing PDF restructure (9-col, A4 landscape, period totals) | `f94b750` |
| v3.2 | 2026-04-24 | RoomModal ghost folio fix (folio fetch by `reservation_id`) | `13023fa` |
| v3.1 | 2026-04-23 | Reservation-centric financial anchoring, FK + cascade |  — |

Full audit trail in `MEMORY_LOG.md`. Append a new entry for any architectural decision; never overwrite past entries.

## Open Investigations

`active_fiscal_day` advanced twice on 2026-04-25 (04:02 Dhaka, then 13:35 Dhaka) — should never advance more than once per Dhaka day. Need to grep for writes to `hotel_settings.active_fiscal_day` and add a guard preventing advancement to a date strictly later than wall-clock day.

## Quick-Commands

`Plan-First` — give 3-bullet plan before code. Don't write code until "Go".
`Status Report` — 5-line summary of CRM progress + remaining tasks.
`Reset` — after 10 messages, summarize thread to memory log and prepare for context reset.

## DO / DON'T

| Do | Don't |
|---|---|
| Use `_dhakaParts` / `todayStr` for any date math | Use `new Date(toLocaleString('en',{timeZone:'Asia/Dhaka'}))` |
| Anchor every folio/tx to `reservation_id` | Match by `room_number` or `guest_name` |
| Use `reservations.total_amount` as canonical | Recompute total when canonical exists |
| Verify `public/crm.html` byte/line count post-Edit | Trust Edit tool silently — it's truncated 5+ times |
| Push from Windows PowerShell | `git commit` from sandbox bash |
| Hard-reload Chrome after deploy | Trust the visual until `Ctrl+Shift+R` |
| Append to `MEMORY_LOG.md` for any architectural decision | Modify existing entries — they're an audit trail |
