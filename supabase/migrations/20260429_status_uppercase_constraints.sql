-- ──────────────────────────────────────────────────────────────────────────
-- 20260429_status_uppercase_constraints.sql
-- Hotel Fountain CRM (Lumea) — enforce canonical UPPERCASE status enums
--
-- Why: client code (App.jsx, page.tsx, NotificationBell.tsx) was split between
--      'pending'/'PENDING' and 'available'/'AVAILABLE'. The bell view returned
--      empty because of casing drift. This migration:
--        1. Backfills any lowercase rows to UPPERCASE
--        2. Adds CHECK constraints that reject lowercase writes going forward
--
-- SECURITY: SECURITY INVOKER respected — no SECURITY DEFINER used.
-- IDEMPOTENT: safe to re-run; constraints are dropped before re-creation.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Backfill lowercase rows ────────────────────────────────────────────
UPDATE public.rooms
SET status = UPPER(status)
WHERE status IS NOT NULL AND status <> UPPER(status);

UPDATE public.reservations
SET status = UPPER(status)
WHERE status IS NOT NULL AND status <> UPPER(status);

-- ── 2. Drop existing CHECK constraints if present (idempotent) ────────────
ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_status_uppercase_chk;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_uppercase_chk;

-- ── 3. Add CHECK constraints ──────────────────────────────────────────────
-- rooms.status canonical set: AVAILABLE | OCCUPIED | DIRTY | OOO | RESERVED
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_status_uppercase_chk
  CHECK (status IN ('AVAILABLE','OCCUPIED','DIRTY','OOO','RESERVED'));

-- reservations.status canonical set:
--   PENDING | CONFIRMED | CHECKED_IN | CHECKED_OUT | CANCELLED | NO_SHOW
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_uppercase_chk
  CHECK (status IN ('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW'));

-- ── 4. Helpful indexes for status filters used in CRM queries ─────────────
CREATE INDEX IF NOT EXISTS idx_rooms_status        ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);

COMMIT;

-- ── Rollback (manual, if needed) ──────────────────────────────────────────
-- ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_status_uppercase_chk;
-- ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_status_uppercase_chk;
-- DROP INDEX IF EXISTS public.idx_rooms_status;
-- DROP INDEX IF EXISTS public.idx_reservations_status;
