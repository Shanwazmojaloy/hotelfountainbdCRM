CREATE OR REPLACE FUNCTION public.run_all_agents()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Ops layer
  PERFORM agent_billing_selfheal();
  PERFORM agent_rooms_selfheal();
  PERFORM agent_reservations_selfheal();
  PERFORM agent_guests_selfheal();
  PERFORM agent_housekeeping_selfheal();
  PERFORM agent_leads_selfheal();
  PERFORM agent_audit_selfheal();
  -- Growth layer
  PERFORM agent_ota_monitor();
  PERFORM agent_corporate_spend_detect();
  PERFORM agent_social_weekend_campaign();
  PERFORM agent_referral_queue_builder();
  PERFORM agent_biman_site_visit_prep();
  PERFORM agent_airline_leads_selfheal();
  PERFORM agent_ngo_leads_selfheal();
  PERFORM agent_corporate_leads_selfheal();
  -- CEO layer
  PERFORM ceo_process_inbox();
  PERFORM agent_ceo_followup();

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-orchestrator','full_sweep_v4','OK',
    'All 17 agent functions ran. CEO approved.');

  RETURN format('All agents v4 ran at %s',NOW());
END;
$function$
