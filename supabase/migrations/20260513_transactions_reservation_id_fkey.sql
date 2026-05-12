-- ──────────────────────────────────────────────────────────────────────────
-- 20260513_transactions_reservation_id_fkey.sql
-- Enforce referential integrity: transactions.reservation_id → reservations.id
--
-- Pre-flight verified (2026-05-13):
--   - 326/327 rows have reservation_id; 0 dangling references
--   - res_id column has 0 rows — dead column, dropped here
--   - FK is NULLABLE so the 1 NULL row is unaffected
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Drop dead column
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS res_id;

-- 2. Add FK (idempotent — drop first)
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_reservation_id_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_reservation_id_fkey
  FOREIGN KEY (reservation_id)
  REFERENCES public.reservations(id)
  ON DELETE SET NULL;

-- 3. Supporting index (reservation_id already used in WHERE clauses)
CREATE INDEX IF NOT EXISTS idx_transactions_reservation_id
  ON public.transactions(reservation_id)
  WHERE reservation_id IS NOT NULL;

-- Rollback (manual):
-- ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_reservation_id_fkey;
-- DROP INDEX IF EXISTS public.idx_transactions_reservation_id;
-- ALTER TABLE public.transactions ADD COLUMN res_id uuid;
