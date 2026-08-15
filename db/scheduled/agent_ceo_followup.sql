CREATE OR REPLACE FUNCTION public.agent_ceo_followup()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer:=0; v_revenue_mtd numeric:=0;
  v_occupancy numeric:=0; v_pipeline_value numeric:=0; v_handover_count integer:=0;
BEGIN
  UPDATE ceo_pipeline SET
    interest_level=LEAST(60,interest_level+15),
    followup_count=followup_count+1,
    last_followup_at=NOW(),
    next_action_at=CURRENT_DATE+5,
    next_action='Second follow-up — push for site visit',
    stage='FOLLOWED_UP'
  WHERE stage='PITCHED' AND next_action_at<=CURRENT_DATE AND handover_ready=false;
  GET DIAGNOSTICS v_count=ROW_COUNT;

  UPDATE ceo_pipeline SET stage='WARM' WHERE interest_level>=60 AND stage!='WARM' AND handover_ready=false;

  UPDATE ceo_pipeline SET handover_ready=true,stage='HANDOVER',
    handover_notes=format('READY FOR SHAN: %s interested. Deal %s. Call: %s',
      company,deal_value_bdt,contact_phone)
  WHERE interest_level>=80 AND handover_ready=false;
  GET DIAGNOSTICS v_handover_count=ROW_COUNT;

  SELECT COALESCE(SUM(paid_amount),0) INTO v_revenue_mtd
  FROM reservations WHERE check_out>=DATE_TRUNC('month',NOW()) AND status='CHECKED_OUT';

  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/NULLIF(COUNT(*),0)*100,1)
  INTO v_occupancy FROM rooms WHERE tenant_id = fountain_tenant_id();

  SELECT COALESCE(SUM(deal_value_bdt),0) INTO v_pipeline_value
  FROM ceo_pipeline WHERE stage!='CLOSED';

  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-ceo','revenue_intelligence','Monthly revenue and occupancy tracking',1,1,0.9,
    jsonb_build_object('revenue_mtd',v_revenue_mtd,'occupancy_pct',v_occupancy,
      'pipeline_value',v_pipeline_value,'date',CURRENT_DATE))
  ON CONFLICT(pattern_key) DO UPDATE SET
    times_seen=agent_pattern_memory.times_seen+1,
    metadata=jsonb_build_object('revenue_mtd',v_revenue_mtd,'occupancy_pct',v_occupancy,
      'pipeline_value',v_pipeline_value,'date',CURRENT_DATE),
    updated_at=NOW();

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-ceo','ceo_brief_v3','OK',
    format('v3: revenue=%s occ=%s%% pipeline=%s followups=%s handovers=%s',
      v_revenue_mtd,v_occupancy,v_pipeline_value,v_count,v_handover_count));
END;
$function$
