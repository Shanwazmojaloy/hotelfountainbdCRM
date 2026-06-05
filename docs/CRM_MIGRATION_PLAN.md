# CRM → Next.js migration plan (staged)

**Goal:** retire the hand-maintained 752 KB `public/crm-src.jsx` (babel → terser → static `crm.html`) and move the CRM into the Next.js app as real TypeScript components. This removes the custom build step, the OneDrive-truncation hazard on one giant file, gives type safety + code-splitting, and cuts load time.

**Principle:** strangler-fig. The current `/crm.html` keeps working untouched while a parallel `/app` CRM is built module-by-module. Cut over one route at a time. Never a big-bang rewrite of a live hotel system.

## Target architecture
- Route: `app/(crm)/...` with a shared layout (sidebar + topbar) — auth-gated by middleware.
- Data: typed Supabase client + `types/supabase.ts` (already generated) + TanStack Query (already a dep) for caching/refetch/realtime.
- State: React Query for server data; `useState`/context for UI. Drop the global reducer over time.
- Styling: move the inline CSS-in-a-string into CSS modules or Tailwind (Tailwind v4 already configured).
- Shared logic: extract `computeBill`, `resBalance`, date math, etc. into `src/lib/` with unit tests (`crm.logic.test.ts` already exists — grow it).

## Staging (each stage = its own PR, shippable, reversible)
1. **Scaffold** `app/(crm)/layout.tsx` (sidebar + topbar + auth gate) and a `/app` dashboard route behind a feature flag (`?next=1`). No behaviour change for staff.
2. **Extract pure logic** from `crm-src.jsx` into `src/lib/billing.ts`, `src/lib/dates.ts`, etc., covered by vitest. The old bundle imports nothing new yet; this is prep + a safety net.
3. **Dashboard** module in Next (KPIs, revenue chart via recharts, room status). Ship behind the flag; compare against `/crm.html` side by side.
4. **Room Matrix** + **Reservations** (the highest-traffic screens). Reuse the extracted logic. Realtime via React Query + Supabase channel.
5. **Guest CRM**, **Billing & Invoices**, **Housekeeping**, **Reports**, **AI Council**, **Settings** — one per PR.
6. **Cut over**: point `/crm.html` (or `/crm`) to the new app; keep the old bundle as `/crm-legacy.html` for one release as a rollback.
7. **Delete** `crm-src.jsx`, `build:crm`, babel/terser config, `public/vendor/*`. Remove the OneDrive guard's bundle checks (no longer needed).

## Guardrails during migration
- Each stage ships behind the `?next=1` flag until verified, so staff keep using the stable CRM.
- Keep `crm.logic.test.ts` green; add tests for every extracted function (CI already enforces).
- The DB schema, edge functions, Realtime, and push pipeline are **unchanged** — only the front-end moves. Lower risk.

## Effort
Roughly 1 module per focused session. Stages 1–2 are low-risk prep; 4 (Matrix + Reservations) is the bulk. Realistic: a handful of sessions, shippable at every step.
