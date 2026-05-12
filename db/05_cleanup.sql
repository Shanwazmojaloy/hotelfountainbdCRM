-- ═══ PHASE 5/5: Drop staging schema (run AFTER verifying CRM works) ═══
-- WARNING: irreversible. Backup remains in archive_bgqs_20260427 schema.

DROP SCHEMA bgqs_raw CASCADE;

SELECT 'staging dropped — backup preserved in archive_bgqs_20260427' AS status;
