# crm-src.jsx Modular Split — Phased Plan

> Status: PLAN ONLY — do not execute without review  
> Date: 2026-05-14  
> Current file: `public/crm-src.jsx` — **5,278 lines**

---

## Why Split

- 5,278 lines is hard to navigate and edit surgically
- Edit tool truncation risk increases with file size
- Module isolation catches scope leakage bugs earlier
- Enables per-page lazy loading if CRM grows beyond current size

## Why NOT Split Yet

- The single-file Babel+Terser pipeline is battle-tested and simple
- Splitting requires a new bundler (esbuild/webpack) — new failure modes
- All 9 sessions of fixes have been on the single-file approach
- **Recommendation: defer until a quiet week with no active billing bugs**

---

## Proposed Module Map

### Tier 1 — Utilities (no JSX dependencies)

| Module | Components | Lines (approx) |
|---|---|---|
| `src/crm/utils/db.js` | `db()` Supabase helper, `SB_URL`, `SB_KEY`, `TENANT_ID` | ~30 |
| `src/crm/utils/billing.js` | `_isRealPayment`, `_bizDayTotalFn`, `fmt()` date helpers | ~30 |
| `src/crm/utils/pdf.js` | `printPDF`, `downloadBillingPDF`, `printInvoice` | ~360 (L1924–2267) |

### Tier 2 — Shared UI components

| Module | Components | Lines (approx) |
|---|---|---|
| `src/crm/components/Toast.jsx` | `Toast` | ~5 |
| `src/crm/components/Shared.jsx` | `Av`, `SBadge`, `Modal`, `BarChart`, `GuestSearchInput` | ~80 |

### Tier 3 — Pages (each is a standalone route)

| Module | Components | Lines (approx) | Notes |
|---|---|---|---|
| `src/crm/pages/Login.jsx` | `LoginPage` | ~177 (L434–610) | Auth gate |
| `src/crm/pages/Dashboard.jsx` | `Dashboard` | ~143 (L611–753) | Uses `_bizDayTotalFn` |
| `src/crm/pages/Rooms.jsx` | `RoomsPage`, `RoomModal`, `AddChargeModal`, `AddRoomModal` | ~348 (L754–1101) | |
| `src/crm/pages/Reservations.jsx` | `ReservationsPage`, `ReservationDetail`, `NewReservationModal` | ~488 (L1102–1590) | Largest non-billing page |
| `src/crm/pages/Guests.jsx` | `GuestsPage`, `GuestModal`, `EditGuestModal`, `AddGuestModal` | ~226 (L1591–1816) | |
| `src/crm/pages/Housekeeping.jsx` | `HousekeepingPage`, `AddTaskModal` | ~106 (L1817–1923) | |
| `src/crm/pages/Billing.jsx` | `BillingPage`, `RecordPayModal` | ~671 (L2268–3113) | Most critical — touch last |
| `src/crm/pages/Reports.jsx` | `ReportsPage` | ~71 (L3114–3184) | |
| `src/crm/pages/Settings.jsx` | `SettingsPage`, `AddStaffModal`, `EditStaffModal` | ~261 (L3185–3445) | |
| `src/crm/pages/Growth.jsx` | `AIAgentsPanel`, `AIResearchPanel`, `B2BSwarmPanel`, `PlanGPanel`, `LeadGenSwarmPanel`, `WorkflowMonitor`, `GoogleSheetsCard`, `LeadPipelinePage` | ~1439 (L3446–4885) | Growth module is a sub-app |

### Tier 4 — Root

| Module | Components | Lines (approx) |
|---|---|---|
| `src/crm/App.jsx` | `App` (router + data fetch) | ~390 (L4886–5278) |
| `src/crm/main.jsx` | `ReactDOM.createRoot(...)` mount | ~3 |

---

## Build Pipeline Change Required

### Current
```
babel public/crm-src.jsx --config-file ./babel.crm.json --out-file public/crm-bundle.js
terser public/crm-bundle.js --compress --mangle --output public/crm-bundle.js
node scripts/bump-cache.js
```

### Required after split — Option A: esbuild (recommended)
```
esbuild src/crm/main.jsx --bundle --minify --outfile=public/crm-bundle.js --jsx=automatic
node scripts/bump-cache.js
```
- esbuild handles JSX + bundling + minification in one step
- 10–100× faster than Babel+Terser
- No separate Terser pass needed
- `package.json` change: replace `@babel/cli` + `terser` with `esbuild`

### Required after split — Option B: Webpack (heavier)
- Slower, more config, not recommended for this use case

---

## Shared State Concern

**Problem:** `App` fetches all data (`rooms`, `guests`, `reservations`, `transactions`) and passes everything as props. After splitting, all pages still need these as props or via context.

**Recommendation:** Keep prop-drilling (current approach) in Phase 1. Migrate to React Context in Phase 2 only if props become unmanageable.

**Do not introduce Redux or Zustand** — overkill for a 24-room property CRM.

---

## Critical Rule: `_isRealPayment` and `_bizDayTotalFn`

These two helpers MUST be defined in `utils/billing.js` and imported by BOTH `Dashboard.jsx` and `Billing.jsx`. They must NEVER be duplicated. This is the root cause of the ৳6,002 sync bug fixed in session 8.

```js
// utils/billing.js — single source of truth
export const _isRealPayment = t =>
  !/balance carried forward/i.test(t.type || '') &&
  !/final\s*settlement/i.test(t.type || '')

export const _bizDayTotalFn = list => { ... }
```

---

## Execution Phases

### Phase 0 — Prerequisite (do now)
- [ ] Upgrade Vercel to Pro (enables 60s function timeout for cron agents)
- [ ] Commit all pending changes from sessions 7–9

### Phase 1 — Extract Utilities (lowest risk)
- [ ] Create `src/crm/utils/billing.js` — extract `_isRealPayment`, `_bizDayTotalFn`
- [ ] Create `src/crm/utils/db.js` — extract `db()`, constants
- [ ] Create `src/crm/utils/pdf.js` — extract `printPDF`, `downloadBillingPDF`, `printInvoice`
- [ ] Switch build from Babel+Terser to esbuild
- [ ] Verify bundle size ~279KB and CRM loads cleanly

### Phase 2 — Extract Non-Billing Pages (medium risk)
Order: Login → Dashboard → Housekeeping → Reports → Settings (smallest/safest first)
- [ ] One page at a time
- [ ] Rebuild + verify each time before moving to next

### Phase 3 — Extract Core Pages (higher risk)
Order: Guests → Rooms → Reservations
- [ ] These pages share modals and cross-reference each other's data

### Phase 4 — Extract Billing (highest risk — touch last)
- [ ] `Billing.jsx` + `RecordPayModal`
- [ ] `pdf.js` utilities already extracted in Phase 1
- [ ] Full regression test: BIZ DAY total, PAID column, invoice generation

### Phase 5 — Growth Module
- [ ] `Growth.jsx` — largely independent, can be done any time after Phase 1

---

## Rollback Strategy

Each phase must end with a working `crm-bundle.js`. Keep the old `crm-src.jsx` in git for at least 2 weeks after the split is complete. Tag the last single-file commit:
```powershell
git tag crm-single-file-last
git push origin crm-single-file-last
```
