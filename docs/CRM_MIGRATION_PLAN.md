# CRM Migration Plan — Retiring the Monolithic Bundle

**Status:** Proposed · **Owner:** Shan · **Created:** 2026-06-05

## Problem

The CRM ships as a single ~752 KB Babel+Terser bundle (`public/crm-src.jsx` →
`public/crm-bundle.js`) loaded by a static `public/crm.html` shell. This works, but
it carries real cost:

- **No type safety** — `crm-src.jsx` is plain JSX; the typed Next.js app around it
  (`app/`, `src/`) can't see into it. Refactors are blind.
- **Fragile build** — edits routinely truncate at the OneDrive/Windows mount
  boundary; the file must be spliced with Python and rebuilt with a custom
  babel/terser step, then cache-busted by hand.
- **One blast radius** — a single syntax slip anywhere in the file breaks the whole
  CRM. The `ReactDOM.createRoot==1` and `</html>` grep guards exist precisely
  because of this.
- **Duplicated runtime** — the bundle hand-rolls its own Supabase access, billing
  math (`computeBill`), and routing, parallel to the typed code in `src/`.

## Goal

Move the CRM, **one screen at a time**, into typed Next.js route components under
`app/` — with **zero big-bang risk**. At every step the legacy bundle remains the
default; new screens are opt-in behind a flag until proven, then promoted.

## Strategy — Strangler Fig

Run the new implementation *alongside* the old one and divert traffic screen by
screen. The legacy bundle is never "rewritten"; it is progressively starved until
nothing routes to it, then deleted.

### The opt-in flag: `?next=1`

A single switch decides which implementation renders a given screen:

- **Source of truth:** `localStorage.lumea_next` (set by `?next=1` / cleared by
  `?next=0`), readable by both the bundle and the Next app.
- **Legacy shell (`crm.html` / bundle):** before mounting a migrated view, the
  bundle checks `localStorage.lumea_next` + a per-screen allowlist. If the screen
  is migrated *and* the flag is on, it renders a thin `<iframe>`/redirect to the
  Next route instead of its own component. Otherwise it renders as today.
- **Next app:** migrated routes live at `app/crm/<screen>/page.tsx` and are always
  reachable directly for testing, regardless of the flag.

This lets staff dogfic a single migrated screen (`?next=1`) while every other
screen, and every other user, stays on the proven bundle.

## Shared foundations (build once, before any screen moves)

These remove the bundle's private copies of core logic so migrated screens and the
bundle agree on behavior:

1. **`src/lib/db.ts`** — typed Supabase data layer (reservations, transactions,
   rooms, guests, folios). The booking path already set the precedent server-side
   (`app/api/book`). Mirror reads/writes here with generated types
   (`supabase gen types`).
2. **`src/lib/billing.ts`** — port `computeBill`, the ghost-BCF revenue filter, and
   the paid-amount policy *verbatim* from `crm-src.jsx`, with unit tests in
   `crm.logic.test.ts` asserting parity against known fixtures (e.g. the
   ARULNAYAGAN / SI SHAMIM cases already documented in `MEMORY_LOG.md`).
3. **`src/components/ui/`** — extract the Gilded Threshold primitives (cards,
   status badges, modal, table) as typed components so screens look identical.
4. **Auth/session parity** — confirm the Next routes read the same Supabase session
   the bundle uses, so a flagged screen doesn't bounce the user to re-login.

> **Rule:** no screen migrates until `billing.ts` passes the parity tests. Billing
> drift is the one thing this project cannot afford (see the ৳13,600 rule).

## Migration order (lowest risk → highest)

Ordered by blast radius and write-complexity. Each is one shippable PR behind the
flag.

| # | Screen | Why this order | Risk |
|---|--------|----------------|------|
| 1 | **Audit / Stream** | Already partly native (`app/admin/audit`). Read-only. | Low |
| 2 | **Reports / Analytics** | Read-only aggregations; easy parity check. | Low |
| 3 | **Rooms matrix** | Mostly display + status toggles. | Low–Med |
| 4 | **Guest ledger** | Reads + light writes. | Med |
| 5 | **Reservations list + detail** | Core writes; needs `db.ts` + `billing.ts` solid. | High |
| 6 | **Billing & Invoices** | Highest-value, most math. Migrate last. | High |
| 7 | **Night Audit / closing** | Stateful, date-sensitive. Migrate after billing is native. | High |

## Per-screen checklist

For each screen, in one PR:

1. Build `app/crm/<screen>/page.tsx` using `src/lib/*` + `src/components/ui/*`.
2. Add the screen to the bundle's "migrated" allowlist (renders Next route when
   `lumea_next` is on).
3. **Parity QA:** open old vs new side by side on the same data; reconcile every
   number (totals, dues, counts). For billing screens, diff against
   `crm.logic.test.ts` fixtures.
4. Dogfood with `?next=1` for one full business day (incl. a 3 AM close if
   relevant).
5. Promote: flip the screen's default to Next; leave the bundle fallback in place
   for one more week.
6. Remove the screen's code from `crm-src.jsx`, rebuild, confirm bundle shrinks.

## Definition of done

- Every screen routes to `app/crm/*` by default; `localStorage.lumea_next` no longer
  consulted.
- `crm-src.jsx` / `crm-bundle.js` deleted; `crm.html` either removed or reduced to a
  redirect to `/crm`.
- The Python-splice + custom babel/terser build step and its grep guards are gone.
- `next.config.mjs` `ignoreBuildErrors` / `ignoreDuringBuilds` can be removed
  (tracked separately in `AUDIT_REPORT.md`).

## Explicit non-goals

- No visual redesign during migration — pixel parity only. Design changes happen
  *after*, against typed components.
- No schema changes driven by this effort.
- No multi-tenant work here (tracked separately).

## Rollback

Because every step is flag-gated and the bundle stays intact until a screen is
promoted, rollback at any point is: flip the screen's default back to legacy (or
have the user clear `lumea_next`). No deploy required for the dogfooding phase.
