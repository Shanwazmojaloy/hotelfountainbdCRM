# App.jsx Split Plan — Lumea CRM

`App.jsx` is currently 5,661 lines. It loads as a single bundle for every role,
even though the `ROLES` map already gates pages. The plan below decomposes it
into per-domain modules without changing runtime behavior.

## Target structure

```
src/crm/
├── index.jsx                  // tiny shell — auth gate + role-aware router
├── lib/
│   ├── supabase.js            // db, dbPost, dbPatch, dbDelete, fetchAllGuests
│   ├── format.js              // BDT, fmtDate, todayDhaka, nightsCount
│   ├── billing.js             // computeBill, sanitizePayload, dbPost*Safe
│   ├── auth.js                // hashPassword, pwHashEqual, ROLES, INIT_STAFF
│   └── invoice.js             // printTransactionInvoice
├── components/
│   ├── Login.jsx
│   ├── Topbar.jsx
│   ├── Sidebar.jsx
│   ├── Toast.jsx
│   └── Modal.jsx
└── pages/
    ├── Dashboard.jsx
    ├── RoomMatrix.jsx          // owner, manager, receptionist, housekeeping
    ├── Reservations.jsx        // owner, manager, receptionist
    ├── Guests.jsx              // owner, manager, receptionist
    ├── Housekeeping.jsx        // owner, manager, housekeeping
    ├── Billing.jsx             // owner, manager, receptionist, accountant
    ├── Reports.jsx             // owner, manager, accountant
    └── Settings.jsx            // owner only
```

## Data-flow conventions (locked, per CLAUDE.md)

- **Single source of truth**: every page reads from a `useReducer` store keyed
  by `reservation_id` (UUID) — never `room_number`.
- **Cascade deletes**: `deleteReservation(id)` removes the reservation, its
  folios, and its transactions in one Supabase RPC. UI calls one helper,
  never raw `DELETE`.
- **Numeric sanitization**: `sanitizePayload` is the only path between UI
  state and Supabase writes. Inputs run through `safeNum` first.

## Migration steps (suggested order)

1. Extract `lib/format.js` + `lib/supabase.js` first — pure helpers, no JSX.
2. Extract `lib/auth.js` — already isolated (INIT_STAFF, hashPassword).
3. Extract `lib/billing.js` and `lib/invoice.js` — keep public signatures
   identical so callers don't change.
4. Extract `components/{Login,Topbar,Sidebar,Toast,Modal}.jsx`.
5. Extract pages one at a time, in this order (low dependency → high):
   `Dashboard`, `Settings`, `Reports`, `Housekeeping`, `Guests`,
   `RoomMatrix`, `Reservations`, `Billing`.
6. Replace App.jsx body with `index.jsx` shell once every page is moved.

## Acceptance per step

- App.jsx still mounts and behaves identically (no observable UI change).
- `npm run typecheck` passes.
- One PR per page so review stays surgical.
- Each PR updates `MEMORY_LOG.md`.

## Why not all at once

A 5,661-line monolith with state spread across `useState` + ad-hoc `dispatch`
calls cannot be split safely in a single edit. The hidden coupling (e.g. a
modal in Reservations reading state from Dashboard) only surfaces at runtime.
Step-by-step extraction with lint+typecheck gates is the only way to keep the
bill-balance invariants intact during the move.

---

**Next move:** confirm this layout, then I'll start with step 1 (pure helpers,
zero behavior change). Reply `Go split-1` to begin.
