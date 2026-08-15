CREATE OR REPLACE FUNCTION public.agent_leads_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_stale integer:=0; v_new_b2b integer:=0; v_pipeline_health numeric:=0;
BEGIN
  UPDATE leads SET status='STALE',updated_at=NOW()
  WHERE status NOT IN ('CONVERTED','LOST','STALE')
    AND updated_at<NOW()-INTERVAL '14 days';
  GET DIAGNOSTICS v_stale=ROW_COUNT;

  INSERT INTO leads(id,name,email,phone,company,source,status,notes,tenant_id,created_at,updated_at)
  SELECT gen_random_uuid(),p.contact_name,p.email,p.phone,
    p.agency_name,'B2B_PARTNER','NEW',
    format('Auto-generated | %s | %s wholesale',p.city,p.wholesale_rate),
    p.tenant_id,NOW(),NOW()
  FROM b2b_partners p
  LEFT JOIN leads l ON l.company=p.agency_name AND l.source='B2B_PARTNER'
  WHERE l.id IS NULL;
  GET DIAGNOSTICS v_new_b2b=ROW_COUNT;

  SELECT COALESCE(ROUND(
    COUNT(CASE WHEN status='CONVERTED' THEN 1 END)::numeric/NULLIF(COUNT(*),0)*100,1),0)
  INTO v_pipeline_health FROM leads;

  PERFORM agent_send('lumea-leads','lumea-ceo','REPORT',
    format('Leads v3: stale:%s new_b2b:%s conversion:%s%%',
      v_stale,v_new_b2b,v_pipeline_health),
    'Lead pipeline health checked.',
    jsonb_build_object('stale',v_stale,'conversion_rate',v_pipeline_health),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-leads','leads_v3',v_stale+v_new_b2b,
    CASE WHEN (v_stale+v_new_b2b)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: stale=%s new_b2b=%s conversion=%s%%',v_stale,v_new_b2b,v_pipeline_health));
END;
$function$
