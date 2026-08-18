-- Revert for 20260818_revoke_anon_reads_s5.sql. Restores the pre-S-5 anon grants
-- exactly as captured from information_schema.role_table_grants before applying:
--   workflow_runs      anon: REFERENCES, SELECT, TRIGGER, TRUNCATE
--   housekeeping_tasks anon: REFERENCES, SELECT, TRIGGER, TRUNCATE
-- Apply this ONLY if a consumer the audit missed starts 401ing.

GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.workflow_runs      TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.housekeeping_tasks TO anon;
