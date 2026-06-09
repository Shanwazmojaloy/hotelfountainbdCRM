# Lumea — Architecture Migration Tracker
Started 2026-06-09. Two structural migrations, tracked screen-by-screen / step-by-step.
**Rule: every production cutover step is gated on validation. Never big-bang a live booking/billing system.**

---

## Project A — Retire the 758 KB `crm-src.jsx` monolith → Next.js `/crm`

### Verified current state (audited 2026-06-09)
- `/crm` route (`app/crm/page.tsx`) is **4 lines** — renders `<Layout><Dashboard/></Layout>` only.
- Modern foundation that EXISTS but is mostly un-wired:
  - Components: `Layout`, `Header`, `Sidebar`, `BottomNav`, `Dashboard`, `BillingCard`, `ProgressRing`.
  - Billing hooks (solid): `useBillingInvoice`, `useCheckout`, `useCheckoutBalance`, `useExpandNightlyCharges`, `useGuestLedger`, `usePostCharge`, `usePostPayment` (idempotency-ready), `useRoomStatusSync`, `useVoidEntry`.
- **The live CRM staff use is still `/crm.html` (the monolith).** Only the Dashboard screen is migrated (~1 of 7).

### Screen inventory & status
| Screen | In monolith | In Next `/crm` | Risk | Status |
|---|---|---|---|---|
| Dashboard | ✅ | ✅ (`Dashboard.jsx`, live Supabase) | low | **DONE** |
| Settings | ✅ | — | low | TODO (port first — lowest risk) |
| Room Matrix / Room Mgmt | ✅ | — | med | TODO |
| Reservations (list + detail/edit) | ✅ | — | med-high | TODO |
| Guest Ledger | ✅ | — | med | TODO (hook `useGuestLedger` ready) |
| Billing & Invoices | ✅ | partial (`BillingCard` + hooks) | **high** | TODO |
| Record-Payment modal | ✅ (idempotency live) | hook ready (`usePostPayment`) | **high (money)** | TODO — do LAST, after Project B |

### Sequence (strangler-fig — never big-bang)
1. **Freeze** new features on `crm-src.jsx`; all new CRM work → `app/crm/*` components.
2. Port **Settings** first (lowest risk, mostly static) → new route `app/crm/settings/page.tsx`, validate side-by-side vs `/crm.html`.
3. Port **Room Matrix**, then **Reservations**, then **Guest Ledger** — each its own route + PR + Vercel preview, validated against live.
4. Port **Billing** + **Record-Payment LAST**, and only after Project B (single write-path) lands, so the new UI writes through one clean path.
5. **Cutover:** point the `/crm.html` rewrite in `vercel.json` at `/crm`; keep `crm.html` as fallback for one release.
6. **Delete** `crm-src.jsx`, `crm-bundle.js`, `build:crm`, `bump-cache.js`, their guard rules + `.gitattributes` lines. Corruption class gone.

### Per-screen acceptance criteria
Pixel/behaviour parity with `/crm.html`; reads the same Supabase data; writes verified against the daily integrity monitor; one release of dual-availability with zero regressions before deleting the monolith equivalent.

---

## Project B — Collapse the dual payment write-path

### Verified current state (live audit 2026-06-09)
Modal writes `transactions` → trigger `fn_dual_write_transaction` mirrors to `payment_transactions` (PK=id, ON CONFLICT DO NOTHING).

**The two tables are NOT cleanly symmetric — measured drift:**
| Metric | Count |
|---|---|
| `transactions` total | 1086 |
| `payment_transactions` total | 1167 |
| `transactions` rows with **no** `payment_transactions` mirror | **57** (all have reservation_id) |
| `payment_transactions` rows with **no** `transactions` origin | **138** |

→ **195 rows out of sync.** A naive cutover would orphan/drop payment records = billing errors on a live system. **Reconciliation MUST come before retiring either write path.**

### Sequence (all on a Supabase **preview branch** first; backup-first; never on prod blind)
1. **Canonical = `payment_transactions`** (billing/invoices/usePostPayment already read it). Document it.
2. **Reconcile the 195 drift rows (owner-reviewed):**
   - 57 `transactions`-only: back-fill into `payment_transactions` (the dual-write trigger's guest-resolution gap — confirm each is a real payment, not a charge/BCF, before mirroring).
   - 138 `payment_transactions`-only: classify origin (modern direct inserts vs. orphaned). Keep — they're canonical-table rows; just ensure Dashboard/reports that read `transactions` won't miss them.
3. Add a **reverse trigger** (`payment_transactions`→`transactions`) so legacy Dashboard/reports stay fed during transition.
4. Migrate Dashboard/report reads from `transactions` → `payment_transactions` (or a unified view).
5. **Retire** the modal's `transactions` write + `fn_dual_write_transaction` once `payment_transactions` is the only writer and reports are migrated.
6. Idempotency: `uq_*_idempotency` indexes already on both tables; the surviving path always sends the key.

### Ready reconciliation query (run on a preview branch, review output, do NOT auto-apply to prod)
```sql
-- the 57 transactions-only rows to review for back-fill
SELECT t.id, t.reservation_id, t.type, t.amount, t.fiscal_day, t.created_at
FROM transactions t
WHERE t.reservation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payment_transactions p WHERE p.id = t.id)
ORDER BY t.created_at DESC;

-- the 138 payment_transactions-only rows to classify
SELECT p.id, p.reservation_id, p.amount_bdt, p.status, p.notes,
       (p.metadata->>'dual_write_from') AS src, p.created_at
FROM payment_transactions p
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = p.id)
ORDER BY p.created_at DESC;
```

### Why this is gated (not done-now)
Reconciling 195 payment rows is per-row owner judgment (real payment vs charge vs orphan), and any wrong move misstates revenue or a guest's balance. The safe path: spin up a Supabase preview branch (`create_branch`, ~cents/day), apply + validate the full sequence there, owner-review the reconciliation, then merge. The daily integrity monitor stays on throughout to catch drift.

---

## What's done vs. gated (2026-06-09)
- ✅ **Started & de-risked:** current-state audited for both; #B drift quantified (195 rows); foundation inventoried for #A; sequences + acceptance criteria fixed; reconciliation queries ready.
- ⛔ **Gated on validation (correctly):** the actual UI ports (#A, weeks of work) and the payment-table reconciliation + cutover (#B, owner-reviewed on a preview branch). These change a live booking/billing system; "done now" would mean "broken now."
