-- Lumea — per-tenant Google Sheets backup destination (client-readiness item).
-- Migration: 20260704_tenants_sheets_backup_id.sql (applied to prod 2026-07-04)
--
-- NULL = no backup destination. The home tenant (hotelfountainbd) falls back to
-- the SHEETS_BACKUP_ID env var / legacy hardcoded spreadsheet, so its nightly
-- backup behavior is unchanged. Client tenants get their own spreadsheet id set
-- at onboarding; the client shares that sheet with the platform's Google
-- service-account email (Editor).

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sheets_backup_id TEXT;
