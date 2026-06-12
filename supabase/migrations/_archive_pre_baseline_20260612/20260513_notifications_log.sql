-- ─────────────────────────────────────────────────────────────────────────────
-- notifications_log
-- 2026-05-13: Documentation migration — table already exists in production.
--             Schema confirmed against live DB on 2026-05-13.
--
-- Used by: daily-ops (revenue-manager, automated-marketer),
--          deal-alert, ceo-auditor agents
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  workflow       TEXT,                         -- 'deal-alert' | 'revenue-manager' | 'automated-marketer'
  recipient_email TEXT,
  subject        TEXT,
  body           TEXT,
  status         TEXT,                         -- 'success' | 'error' | 'low' | 'high'
  error_msg      TEXT,
  triggered_by   TEXT,                         -- 'agent:ceo-auditor' | 'cron:daily-ops'
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_notifications_log_tenant
  ON notifications_log (tenant_id);

CREATE INDEX IF NOT EXISTS idx_notifications_log_created
  ON notifications_log (created_at DESC);

-- RLS
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications_log' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON notifications_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications_log' AND policyname = 'tenant_read'
  ) THEN
    CREATE POLICY "tenant_read" ON notifications_log
      FOR SELECT TO authenticated
      USING (tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid);
  END IF;
END$$;
