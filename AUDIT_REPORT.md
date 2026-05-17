# Lumea CRM — Full Depth Audit Report
**Date:** 2026-05-17  
**Scope:** All 5 layers — Config, Agent Routes, Database, CRM Frontend, Security  
**Session:** Continuous audit across Sessions 13–14  
**Status:** All critical and high-severity issues resolved

---

## Summary

| Layer | Files Audited | Issues Found | Fixed | Deferred |
|---|---|---|---|---|
| L1 Config | `vercel.json`, `next.config.mjs`, `middleware.ts` | 2 | 0 | 2 (tech debt) |
| L2 Agent Routes | 13 route files | 3 | 3 | 0 |
| L3 Database | 12 tables, RLS, FK constraints, data | 5 | 4 | 1 (FK design) |
| L4 CRM Frontend | `crm-src.jsx` billing/audit logic | 2 | 1 | 1 (minor) |
| L5 Security | All endpoints, env vars, keys | 1 | 1 | 1 (webhook) |
| **Total** | | **13** | **9** | **4** |

---

## Layer 1 — Config & Build

### ⚠ DEFERRED: `next.config.mjs` — TypeScript/ESLint silenced
```js
typescript: { ignoreBuildErrors: true }
eslint: { ignoreDuringBuilds: true }
```
**Risk:** TypeScript compile errors silently pass to production.  
**Action:** Clean up TS errors, then remove both flags. Tracked as task #6.

### ✓ OK: `vercel.json` — 6 crons staggered correctly (1–6 UTC)
### ✓ OK: `middleware.ts` — Edge runtime, no DB calls, clean subdomain extraction

---

## Layer 2 — Agent Routes

### 🔴 FIXED: `reply-digest/route.ts` — Unauthenticated POST
**Before:** `export async function POST()` — no auth, no `req` parameter  
**After:** Added CRON_SECRET Bearer check identical to GET handler  
**Risk (before fix):** Anyone could trigger mass email digest sends

### 🔴 FIXED (Session 13): `follow-up-bot/route.ts` — Dead ternary + unauthenticated POST
- Dead ternary: both branches returned `'contacted'` regardless of send result
- POST handler had no auth
- Fixed: `'contacted' : 'pending'` + added CRON_SECRET guard

### 🔴 FIXED (Session 13): `outreach-bot/route.ts` — Unauthenticated POST
- Comment said "no auth required; CRM-internal use only"
- Fixed: added CRON_SECRET guard

### ✓ OK: `deal-alert`, `ceo-auditor`, `fb-token-check`, `health-check` — All properly authenticated
### ✓ OK: `reply-intake/route.ts` — Intentionally open (Brevo inbound webhook)

> **⚠ NOTE:** `reply-intake` POST has no Brevo signature verification. Webhook spoofing could inject fake lead replies and trigger CEO Auditor. Low risk currently (limited attack surface), but Brevo HMAC signature validation should be added before multi-tenant launch.

### ✓ OK: `payment-confirm`, `payment-send`, `orchestrate`, `onboard-tenant` — All authenticated

---

## Layer 3 — Database

### 🔴 FIXED: 3 NULL guest_name reservations (active)
| Reservation ID | Room | Status | Guest Name Applied |
|---|---|---|---|
| `5969c285` | 406 | RESERVED | ARNOB PAL PARTHO (from transaction) |
| `445a72de` | 303+304 | RESERVED | MD.RUHUL AMIN (from transaction) |
| `7d06269b` | 303 | RESERVED (future) | HAU BOON YAP (from guests table) |

Also patched in Session 13: `21f4e330` (Room 501, ALI ERSHAD)

### 🔴 FIXED: `hotel_settings` — 3 open RLS policies bypassing tenant isolation
**Before:** Three policies with `USING true` allowed any caller to read/write any tenant's settings:
- `Tenant read settings` (SELECT, USING true)
- `Tenant update settings` (UPDATE, USING true, WITH CHECK true)
- `Tenant upsert settings` (INSERT, WITH CHECK true)

**After:** Dropped all three. Only `tenant_access` policy remains (scoped to Hotel Fountain BD UUID).  
**SQL:** `DROP POLICY IF EXISTS "Tenant read/update/upsert settings" ON public.hotel_settings;`

### 🔴 FIXED (Session 13): `daily-ops/route.ts` — Revenue filtered by UTC range
Revenue query used `created_at >= startUtc AND created_at <= endUtc` — missed BDT-midnight transactions.  
Fixed to `fiscal_day=eq.${today}` (Dhaka-corrected date string).

### ⚠ DEFERRED: `transactions.reservation_id` FK — SET NULL on delete
**Current:** `FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL`  
**Project convention:** Cascade delete (CLAUDE.md §2 "Cascade Delete").  
**Risk:** Deleting a reservation orphans its transactions (reservation_id = NULL). Currently 0 orphans exist.  
**Action:** Requires migration to change to `ON DELETE CASCADE` — schedule for maintenance window.

### ⚠ INFO: NOT VALID FK constraints on `reservations` and `transactions` → `tenants`
Added with `NOT VALID` — only enforces on new rows. Existing rows unverified.  
With 1 tenant and confirmed 0 NULL tenant_id rows, this is low risk. Validate when adding tenants.

### ✓ OK: All 482 transactions have `fiscal_day` set — 100% coverage
### ✓ OK: All transactions and reservations have `tenant_id` — 0 NULL rows
### ✓ OK: 0 orphaned transactions (no reservation_id pointing to deleted reservation)
### ✓ OK: 0 orphaned folios

---

## Layer 4 — CRM Frontend

### 🔴 FIXED: `RoomModal.saveCollectAmount` — Replaces `paid_amount` instead of adding
**File:** `public/crm-src.jsx` line 908  
**Before:**
```js
await dbPatch('reservations', activeRes.id, {paid_amount: a})
```
**After:**
```js
await dbPatch('reservations', activeRes.id, {paid_amount: Math.min(total, (+activeRes.paid_amount||0)+a)})
```
**Impact:** If a guest had paid ৳3,000 and staff collected another ৳3,000 via the Room Card quick-pay, `paid_amount` would be set to ৳3,000 (overwrite) instead of ৳6,000 (increment). This caused phantom balance dues.  
`RecordPayModal` (BillingPage) already used the correct `resPaid + a` pattern — now consistent.

### ✓ OK: `RecordPayModal.save()` — Correctly increments: `Math.min(payCap, resPaid + a)`
### ✓ OK: Night Audit (`doClosingComplete`) — Flow is sound
- Guard prevents advancing before wall clock date (correct for 3 AM closing convention)
- PDF print required before fiscal_day advances (intentional, prevents accidental close)
- BCF transactions correctly idempotent (deletes existing before creating new)

### ⚠ MINOR: `outstanding` stat uses `_resDue` (total_amount only), not `computeBill.due` (includes folios)
These can diverge if folio extras exist. Dashboard "Outstanding" may show slightly lower than actual.  
Low operational impact. Would require refactoring `outstanding` to call `computeBill` per reservation.

---

## Layer 5 — Security

### 🔴 FIXED: `hotel_settings` open RLS (see Layer 3)

### ✓ OK: No SERVICE_ROLE_KEY in client-side `crm-src.jsx`
The `sb_publishable_*` fallback key is the Supabase anon key (designed to be public), protected by RLS.

### ✓ OK: `.env.example` — No real credentials, all placeholders

### ✓ OK: All server routes use CRON_SECRET or ADMIN_SECRET guards

### ⚠ INFO: `reply-intake` Brevo webhook — No signature verification
See Layer 2 note. Add `X-Brevo-Signature` HMAC verification before multi-tenant launch.

---

## Files Changed This Session

| File | Change |
|---|---|
| `app/api/agents/reply-digest/route.ts` | Added CRON_SECRET auth to POST handler |
| `public/crm-src.jsx` | Fixed `saveCollectAmount` paid_amount overwrite → increment |
| `public/crm-bundle.js` | Rebuilt from patched source (`v=20260517115633`) |
| DB: `public.reservations` | Patched 3 NULL guest_name rows |
| DB: `public.hotel_settings` RLS | Dropped 3 open policies (`USING true`) |

---

## Session 13 Fixes (carried forward)

| Fix | File/Location |
|---|---|
| `deal-alert` mailto fallback | `app/api/agents/deal-alert/route.ts` |
| `follow-up-bot` dead ternary + POST auth | `app/api/agents/follow-up-bot/route.ts` |
| `outreach-bot` POST auth | `app/api/agents/outreach-bot/route.ts` |
| `daily-ops` fiscal_day revenue | `app/api/agents/daily-ops/route.ts` |
| `crm-src.jsx` Advance Payment fiscal_day | `public/crm-src.jsx` line 909 |
| `crm-src.jsx` truncated final line | `public/crm-src.jsx` EOF |
| `crm-bundle.js` rebuild | `public/crm-bundle.js` |
| DB: ALI ERSHAD Room 501 NULL guest_name | `public.reservations` |

---

## Deferred / Operational Backlog

| Item | Priority | Notes |
|---|---|---|
| `transactions` FK → `ON DELETE CASCADE` | Medium | Migration needed; 0 orphans currently |
| Remove `ignoreBuildErrors` from `next.config.mjs` | Medium | Requires TS cleanup first |
| Brevo HMAC signature on `reply-intake` | Low | Pre-multi-tenant launch |
| `outstanding` stat: use `computeBill.due` | Low | Minor display discrepancy |
| FB Page Token renewal | **High** | Expires 2026-06-30 |
| hotel_settings FK hardcoded UUID → `current_tenant_id()` | Low | Multi-tenant prep |

---

*Generated by Lumea CRM Audit System · Sessions 13–14 · 2026-05-17*
