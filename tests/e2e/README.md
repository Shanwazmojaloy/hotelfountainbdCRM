# Lumea E2E (Playwright)

Money & reservation-integrity smoke tests through the real UI. **Run only against a
NON-PROD test tenant** — never prod data.

## One-time setup
```bash
npm i -D @playwright/test
npx playwright install chromium
```
These specs are excluded from the Next.js build (`tsconfig.json` → `exclude`), so
`@playwright/test` not being installed never breaks `next build`.

## Required env
```
E2E_BASE_URL=http://localhost:3000     # or a Vercel preview URL
E2E_EMAIL=<POS-capable test account>   # Restaurant Supervisor or Owner (has posRegister + compItem)
E2E_PASSWORD=<its password>
```

## Run
```bash
# against a running dev server (or set E2E_BASE_URL to a preview deploy):
npm run dev            # in one terminal
E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_PASSWORD=... npx playwright test
```

## What's covered
- **auth-gate.spec.ts** — unauthenticated → login gate only; no money/nav leaked.
- **restaurant-pos.spec.ts**
  - Walk-in order: add a menu item, assert grand total == price (recomputed, not
    hardcoded), settle, and verify it appears in History.
  - Register: open with a float, close, and confirm the control returns to "Open Register".
- **restaurant-charge-void.spec.ts** — Charge-to-Room posts an F&B folio line + raises the
  guest's Billing balance by exactly the order total; **Void** (History) reverses it and the
  balance returns to 0. Seeds/tears down its own CHECKED_IN reservation via the API.
- **multiroom-checkout.spec.ts** — **flagship money-integrity test**: seed a 3-room booking
  (per-room fan-out), check out ONE room, and assert the other two stay `CHECKED_IN` with
  byte-for-byte unchanged balances (UI room tiles + backend re-fetch). Guards the
  ABDULLAH-BIN-SAFAT sibling-flip regression.
- **billing-payment.spec.ts** — recording a partial payment reduces the Billing balance by
  EXACTLY the amount (guards double-discount / rounding drift). Seeds/tears down its own stay.
- **close-day.spec.ts** — DESTRUCTIVE smoke: "Closing Complete" posts a night-audit close
  through the UI. Skipped unless `E2E_ALLOW_CLOSE_DAY=1`; run on a reset-able test tenant only
  (it rolls the fiscal day and can't be undone from the UI).

## Contract (data-testid added to the app)
POS: `pos-grand-total`, `pos-charge-room`, `pos-settle`, `register-open`, `register-close`,
`history-void`. Billing: `billing-balance-due`, `payment-amount`, `payment-submit`. Rooms:
`room-tile-<roomNumber>` (+ a `data-status` attribute). Reports: `close-day-submit`. Keep these
stable — tests depend on them (don't couple to CSS classes or Taka strings).

## Seeding & isolation
The charge/void and multi-room specs seed their own reservation via `page.request` (the
authenticated API) and cascade-delete it in `afterEach`, so a failed run never orphans data.
They assume a test tenant with free rooms in `101..110` (and `201..205` for multi-room). Run
against a **NON-PROD tenant only**.

## CI (GitHub Actions)
`.github/workflows/e2e.yml` runs the suite. It's **manual (`workflow_dispatch`) by default** —
enable the commented `pull_request` trigger once you've set three repo secrets
(Settings → Secrets and variables → Actions):
- `E2E_BASE_URL` — a NON-PROD test deployment URL (Vercel preview or a dedicated test deploy).
- `E2E_EMAIL` / `E2E_PASSWORD` — a POS-capable account on that test tenant.

The workflow installs `@playwright/test` ad-hoc in the runner, so it never touches
`package.json` / the lockfile / `next build`.

## Not yet covered (good next additions)
- Add-charge canonical-total resync (it's on the folio modal, not Billing — needs its own testids).
- Full post-close report-shape assertions (close-day.spec is a smoke of the endpoint only).
- Public-site smoke (home/rooms render, single H1, booking bar).
