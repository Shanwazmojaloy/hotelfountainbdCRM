-- =============================================================
-- LUMEA CRM — DEMO RESET SCRIPT
-- Wipes all demo tenant data so you can re-run demo-seed.sql
-- SAFE: only deletes rows where tenant_id = demo UUID
-- Does NOT touch Hotel Fountain production data
-- =============================================================

DO $$
DECLARE
  T UUID := 'd3m0cafe-feed-4000-a000-000000000001';
BEGIN
  DELETE FROM transactions     WHERE tenant_id = T;
  DELETE FROM corporate_leads  WHERE tenant_id = T;
  DELETE FROM reservations     WHERE tenant_id = T;
  DELETE FROM guests           WHERE tenant_id = T;
  DELETE FROM rooms            WHERE tenant_id = T;
  DELETE FROM hotel_settings   WHERE tenant_id = T;
  DELETE FROM profiles         WHERE id IN (
    'd3m0cafe-feed-4000-e000-000000000001',
    'd3m0cafe-feed-4000-e000-000000000002'
  );
  DELETE FROM tenants          WHERE id = T;

  RAISE NOTICE '🗑️  Demo data wiped for tenant: %', T;
  RAISE NOTICE '   Run demo-seed.sql to re-populate.';
END $$;
