# Phase 3 — Server-Side Write Enforcement (Spec / Draft)

**Status:** PROPOSED — not implemented. Needs owner sign-off + a maintenance window.
**Date:** 2026-06-09
**Author:** Lumea hardening pass
**Prereqs done:** Phase 1 (server login `/api/crm/login`), Phase 2 (anon locked out of `pw`/`pwh`/`otp_*`; plaintext `pw` column dropped).

---

## 1. Problem

RLS is enabled on every table, but the policies are permissive *within the tenant*, and `anon` holds full **INSERT / UPDATE / DELETE** on the financial + guest tables:

| Table | anon write today | Why it matters |
|---|---|---|
| `transactions` | INSERT/UPDATE/DELETE | record/alter/delete payments |
| `payment_transactions` | INSERT/UPDATE/DELETE | mirror ledger |
| `reservations` | INSERT/UPDATE/DELETE | bookings, `paid_amount`, status |
| `billing_invoices` | INSERT/UPDATE/DELETE | invoices / balances |
| `folios` | INSERT/UPDATE/DELETE | charges |
| `guests` | INSERT/UPDATE/DELETE | guest PII |
| `rooms` | UPDATE | room status |
| `staff` | INSERT/UPDATE/DELETE | accounts/roles |
| `hotel_settings` | UPSERT | VAT, fiscal day |

Anyone holding the public anon key + the tenant header can write to these **directly**, bypassing the UI login entirely. The AuthGate (Phase 1/2) only gates the *interface*; it does not constrain the data layer. This is the last and largest gap.

## 2. Goal

Make the database reject writes that don't originate from an authenticated staff session — so a leaked anon key can read-at-most (still tenant-scoped) but cannot move money or mutate records.

## 3. Two approaches

### Option A — Service-role API routes (incremental, lower blast radius)
Move every write behind a Next.js API route that (1) validates a signed session cookie, then (2) performs the write with the **service role**. Finally `REVOKE INSERT/UPDATE/DELETE … FROM anon` on the protected tables.

- **Pros:** incremental (table-by-table), reuses the `/api/crm/login` pattern already shipped, no client-auth rewrite.
- **Cons:** need a signed session (HTTP-only cookie / JWT we mint) instead of the current `localStorage {id, session_v}`; every write path re-pointed to `fetch('/api/...')`.

### Option B — Supabase Auth (JWT) + RLS by identity (the "correct" end state)
Migrate staff onto Supabase Auth; RLS policies check `auth.uid()` / role claim. Writes stay client-side but carry a real verified JWT.

- **Pros:** canonical model; RLS becomes genuinely identity-aware; no per-write API routes.
- **Cons:** larger migration (provision auth users for staff, re-issue credentials, rewrite policies), touches both apps at once.

**Recommendation:** Option A, phased. It composes with what's already shipped and can be rolled out one table at a time with instant per-table rollback (re-GRANT). Option B is the eventual target once A proves the session model.

## 4. Session upgrade (shared prerequisite for A)

Replace the cosmetic `localStorage {id, session_v}` with a **server-signed, HTTP-only session cookie**:
- `/api/crm/login` (already exists) also sets `Set-Cookie: lumea_sess=<signed JWT {id, role, session_v}>; HttpOnly; Secure; SameSite=Lax`.
- A tiny `requireSession(req)` helper verifies the cookie (HMAC with a server secret) and re-checks `session_v` against `staff` (so Logout-All still works).
- AuthGate keeps the localStorage copy only for UI state; authority moves to the cookie.

## 5. Write inventory (what must be routed) — 24 sites / 12 components

| Table | Ops | Components → new route |
|---|---|---|
| `transactions` (MONEY) | 4× insert | RecordPaymentModal, ReservationEditModal, NewReservationModal, RoomFolioModal → `POST /api/crm/payment` |
| `reservations` | 4× update, 1× insert | NewReservationModal, CheckActionModal, ReservationEditModal, `lib/recalcResTotal` → `POST /api/crm/reservation` |
| `rooms` | 6× update, 1× insert | RoomStatusModal, RoomFormModal, RoomFolioModal, CheckActionModal, NewReservationModal, ReservationEditModal → `POST /api/crm/room` |
| `folios` | 1× insert, 1× delete | AddChargeModal, RoomFolioModal → `POST /api/crm/folio` |
| `guests` | 1× insert, 1× update, 1× delete | GuestFormModal → `POST /api/crm/guest` |
| `staff` | 1× insert, 3× update, 1× delete | StaffFormModal, Settings(logout-all) → `POST /api/crm/staff` (owner-only) |
| `housekeeping_tasks` | 1× insert | TaskFormModal → `POST /api/crm/task` |
| `hotel_settings` | upsert | Settings → `POST /api/crm/settings` (owner-only) |
| `payment_transactions` | — | written by `fn_dual_write_transaction` trigger; no client write |

Money paths (`transactions`) carry the **idempotency_key** already; the server route must preserve it (the DB partial-unique guard still applies).

## 6. Rollout (per table, repeatable)

1. Build the API route (service role + `requireSession` + role check); keep the exact same payload/derivations as the current client write (preserve `recalcResTotal`, idempotency, dual-write).
2. Repoint the component(s) to `fetch()` the route; deploy; verify the flow live.
3. **Then** `REVOKE INSERT, UPDATE, DELETE ON <table> FROM anon;` (instantly reversible with the matching GRANT).
4. Verify the UI still works and a raw anon write now returns 401/permission-denied.

Order (lowest risk → highest): `housekeeping_tasks` → `rooms` → `guests` → `folios` → `reservations` → `transactions` → `staff` → `hotel_settings`.

## 7. Rollback

- Per table: `GRANT INSERT, UPDATE, DELETE ON <table> TO anon;` (re-opens that table instantly).
- Per route: revert the component commit (writes go back to direct client supabase calls).
- No data migration is involved, so rollback is grant + code-revert only.

## 8. Risks / watch-items

- **Session cookie correctness** — a bug locks out *all* writes. Mitigate: ship the cookie + `requireSession` first, behind no REVOKE, and verify before any grant change.
- **Legacy `/crm.html`** writes directly via anon — after a table's REVOKE, legacy can no longer write that table. Acceptable post-cutover; note per table.
- **Edge functions / crons** use the **service role** → unaffected by anon REVOKEs.
- **Triggers** (`fn_dual_write_transaction`, settlement checks, housekeeping) run as definer/table owner → unaffected.
- Keep `anon` SELECT (reads) — the apps still read tenant-scoped data on the anon key; only writes move server-side in this phase.

## 9. Immediate follow-ups (independent of Phase 3)

- **Rotate all 6 staff passwords** — they were stored in plaintext (`pw`) readable by the anon key until today; treat as compromised.
- Consider salting/upgrading the password hash (current `pwh` is unsalted SHA-256) when staff next set passwords.
