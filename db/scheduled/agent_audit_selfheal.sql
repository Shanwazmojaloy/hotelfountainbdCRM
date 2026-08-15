CREATE OR REPLACE FUNCTION public.agent_audit_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_open_rls integer;
  v_critical_tables integer;
  v_risk_score integer;
BEGIN
  SELECT COUNT(*) INTO v_open_rls
  FROM pg_policies WHERE schemaname='public' AND qual='true';

  SELECT COUNT(*) INTO v_critical_tables
  FROM pg_policies WHERE schemaname='public' AND qual='true'
    AND tablename IN ('reservations','rooms','guests','folios',
      'transactions','billing_invoices','payment_transactions','guest_ledger');

  -- Risk score: critical tables * 10 + other open * 2
  v_risk_score := (v_critical_tables * 10) + ((v_open_rls - v_critical_tables) * 2);

  PERFORM agent_record_feedback('lumea-db','open_rls_policy_risk',
    format('open_rls:%s critical:%s risk_score:%s',v_open_rls,v_critical_tables,v_risk_score),
    'rls_scan',
    CASE WHEN v_critical_tables>0 THEN 'ESCALATED' ELSE 'SUCCESS' END,
    v_open_rls);

  IF v_critical_tables > 0 THEN
    PERFORM agent_send('lumea-audit','lumea-ceo','ALERT',
      format('SECURITY: %s critical tables have open RLS (risk score: %s)',v_critical_tables,v_risk_score),
      'Critical financial/guest tables exposed. Immediate RLS fix needed.',
      jsonb_build_object('open_rls',v_open_rls,'critical_tables',v_critical_tables,'risk_score',v_risk_score),'CRITICAL');
  END IF;

  PERFORM agent_send('lumea-audit','lumea-ceo','REPORT',
    format('Audit v3: open_rls:%s critical:%s risk_score:%s',v_open_rls,v_critical_tables,v_risk_score),
    'Security scan complete.',
    jsonb_build_object('risk_score',v_risk_score),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-audit','audit_v3',v_open_rls,
    CASE WHEN v_critical_tables>0 THEN 'WARN' ELSE 'OK' END,
    format('v3: open_rls=%s critical=%s risk_score=%s',v_open_rls,v_critical_tables,v_risk_score));
END;
$function$
