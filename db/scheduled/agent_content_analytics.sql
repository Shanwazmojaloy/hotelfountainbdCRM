CREATE OR REPLACE FUNCTION public.agent_content_analytics()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM agent_send('lumea-analytics','lumea-ceo','REPORT',
    format('Content this week: %s approved, %s posted',
      (SELECT COUNT(*) FROM content_calendar WHERE status='APPROVED'
        AND scheduled_for BETWEEN CURRENT_DATE-7 AND CURRENT_DATE),
      (SELECT COUNT(*) FROM content_calendar WHERE status='POSTED'
        AND scheduled_for BETWEEN CURRENT_DATE-7 AND CURRENT_DATE)),
    'Weekly content analytics.',jsonb_build_object('week',CURRENT_DATE),'NORMAL');
  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-analytics','analytics','OK','Content performance tracked');
END;
$function$
