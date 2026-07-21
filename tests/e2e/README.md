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

## Contract (data-testid added to the app)
`pos-grand-total`, `pos-charge-room`, `pos-settle`, `register-open`, `register-close`.
Keep these stable — tests depend on them (don't couple to CSS classes / Taka strings).

## Not yet covered (good next additions)
- Charge-to-Room → assert the folios line + reservation balance on the Billing page.
- Void → assert the room folio reverses and the reservation total drops back.
- The flagship multi-room checkout money-integrity test (see the skill's
  `example-money-flow.spec.ts`): book 3 rooms, check out ONE, assert the other two
  stay CHECKED_IN and their balances are untouched.
