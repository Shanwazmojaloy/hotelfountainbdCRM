# CRM Orchestra — Nightly Audit & Repair Report

**Date:** 2026-06-14 · **Prod:** Supabase `mynwfkgksqqwlqowlscj` (Bridge Booking) · **Mode:** unattended
**Result:** 2 findings · 0 auto-fixed · 2 HELD for approval · 0 `[EXEC_ERROR]`

---

## Environment self-check

| Connector | Status | Note |
|---|---|---|
| Supabase MCP | ✅ live | prod audited read-only |
| Gmail | ✅ live | digest delivered as draft (per governance §5) |
| Slack `#crm-alerts` | ⚠️ unavailable | OAuth not authenticated; cannot complete interactively in an unattended run. Posted via Gmail draft instead. **Not** a fatal error (Supabase is the only fatal dependency). |

Governance `MASTER_ORCHESTRATION.md` + 6 command specs read OK (in connected repo `F:\Hotel Fountain\Hotel Fountain Web CRM`, not the deprecated `C:\dev\hotelfountainbd`).

---

## GREEN integrity checks (no action)

| Check | Result |
|---|---|
| Negative invoices (`balance_due_bdt < 0`) | **0** |
| Orphaned folios (no `reservation_id`) | **0** |
| Orphaned transactions | **0** |
| Orphaned payment_transactions | **0** |
| Always-true write RLS on sensitive tables | **0** |
| Idempotency-key collisions (both tables) | **0** — June-10 backstop intact |
| Security advisors | 14 WARN (SECURITY DEFINER tenant/auth plumbing fns) + ~20 INFO (`rls_enabled_no_policy` on backup/agent tables = deny-all). All **known/intentional** per `security_advisor_hardening_2026_06_13`. No-op. |
| Performance advisors | Returned (index hygiene only); no failure signal. P3/no-op this run. |

---

## Finding A — `/api/ai/assist` queries `reservations.guest_id` (non-existent column) · **P2 · HELD**

**Statement:** The Lighthouse AI-assist route filters `reservations` by `guest_id=eq.<id>`, but `reservations` has no `guest_id` column — it uses the array column `guest_ids`. PostgREST emits `column reservations.guest_id does not exist` and the guest-scoped context call fails.

**Evidence:**
- Postgres logs (last 24h): `ERROR: column reservations.guest_id does not exist` ×3.
- Schema: `reservations.guest_ids` is `ARRAY`; there is no `guest_id`.
- Source: `app/api/ai/assist/route.ts` ~line 106 — `dbGet('reservations', 'guest_id=eq.${scope.guest_id}...')`.
- Sibling precedent: `app/api/agents/weekly-retention/route.ts:93` already uses the correct array-contains form `guest_ids=cs.{...}`.

**Root cause (confirmed):** wrong predicate operator/column for an array membership test.

**Fix (one line):**
```diff
   out.guest_stay_history = await dbGet(
     'reservations',
-    `guest_id=eq.${scope.guest_id}&tenant_id=eq.${tenant_id}&select=id,check_in,check_out,status,total_amount&order=check_in.desc&limit=10`,
+    `guest_ids=cs.{${scope.guest_id}}&tenant_id=eq.${tenant_id}&select=id,check_in,check_out,status,total_amount&order=check_in.desc&limit=10`,
   );
```

**QA (read-only, prod):** corrected predicate `guest_ids @> array[<gid>]` returns rows with no error; broken predicate errors. ✅

**Why HELD:** Severity P2 → gate policy = always HOLD (no auto-apply). Code-only change (no DB migration). Apply on an atomic branch, `npm run build` + typecheck, then push from PowerShell. Rollback trigger: revert the one-line diff.

---

## Finding B — Legacy duplicate payment_transactions · **P3 · HELD (recommend defer)**

**Statement:** 72 same-`(reservation_id, amount, method)` groups in `payment_transactions`; 22 are tight-window (<120s) accidental double-submits. **All 22 are legacy** (zero idempotency keys, dated 2026-05-02→05-25), **all CHECKED_OUT**. 13 show a cosmetic overpayment in `paid_amount` totaling **৳11,500**.

**Root cause (confirmed):** pre-idempotency-key submit-loop double posting — **already fixed at source** (client UUID idempotency key + DB partial-unique backstop, live 2026-06-10; post-fix collisions = 0). These rows predate the fix.

**Live impact:** none on current operations — all affected stays are closed, in past closed fiscal days; negative invoices = 0; dues math reads `reservations.paid_amount` (source of truth), not the tx sum.

**Why HELD (not auto-applied despite P3):**
1. Cleanup is a **mutation on real historical financial rows** (delete dup tx + re-sync `paid_amount` on 13 folios).
2. A Supabase preview branch carries **no production data**, so the cleanup cannot be sandbox-QA'd for idempotency — it does **not** meet the "P3 + green sandbox QA" auto-apply bar.
3. Owner has standing guidance to **not re-chase** already-remediated legacy artifacts (`negative_invoices_2026_06_06`).

**Recommendation:** defer; if cleanup is desired, run a backup-first idempotent script (snapshot the 22 groups to `_backup_dup_paytxn_2026_06_14`, keep earliest row per group, re-sync `paid_amount`) under explicit owner approval.

---

## Gate decision

| Finding | Severity | QA | Gate | Action |
|---|---|---|---|---|
| A — bad `guest_id` predicate | P2 | GREEN (read-only) | P2 → HOLD | branch + PR prepared; awaiting Shan |
| B — legacy dup payments | P3 | n/a (un-QA-able on data-less branch) | below auto-apply bar | HELD; recommend defer |

**No production mutations performed. Sandbox Rule honored.**
