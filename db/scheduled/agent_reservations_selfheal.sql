CREATE OR REPLACE FUNCTION public.agent_reservations_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status_fixed integer:=0;
  v_source_fixed integer:=0;
  v_conflicts integer:=0;
BEGIN
  -- Fix status casing
  UPDATE reservations SET status=UPPER(status) WHERE status!=UPPER(status);
  GET DIAGNOSTICS v_status_fixed = ROW_COUNT;

  -- Fix NULL source
  UPDATE reservations SET source='DIRECT' WHERE source IS NULL;
  GET DIAGNOSTICS v_source_fixed = ROW_COUNT;

  -- Detect overbooking: same room, overlapping dates, both CHECKED_IN
  SELECT COUNT(*) INTO v_conflicts
  FROM reservations r1
  JOIN reservations r2 ON r1.id != r2.id
    AND r1.room_ids && r2.room_ids
    AND r1.status='CHECKED_IN' AND r2.status='CHECKED_IN'
    AND r1.check_in < r2.check_out AND r1.check_out > r2.check_in;

  IF v_conflicts > 0 THEN
    PERFORM agent_send('lumea-reservations','lumea-ceo','ALERT',
      format('OVERBOOKING DETECTED: %s conflicts', v_conflicts),
      'Multiple CHECKED_IN reservations share same room and overlapping dates. Immediate review needed.',
      jsonb_build_object('conflicts',v_conflicts),'CRITICAL');
  END IF;

  PERFORM agent_record_feedback('lumea-reservations','lowercase_status_silent_fail',
    format('status_fixed:%s source_fixed:%s conflicts:%s',v_status_fixed,v_source_fixed,v_conflicts),
    'status_and_conflict_check',
    CASE WHEN v_conflicts>0 THEN 'ESCALATED' ELSE 'SUCCESS' END,
    v_status_fixed+v_source_fixed);

  PERFORM agent_send('lumea-reservations','lumea-ceo','REPORT',
    format('Reservations v3: status:%s source:%s conflicts:%s',v_status_fixed,v_source_fixed,v_conflicts),
    'Status casing, source attribution, overbooking all checked.',
    jsonb_build_object('status_fixed',v_status_fixed,'conflicts',v_conflicts),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-reservations','reservations_v3',v_status_fixed+v_source_fixed,
    CASE WHEN v_conflicts>0 THEN 'WARN'
         WHEN (v_status_fixed+v_source_fixed)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: status=%s source=%s overbooking=%s',v_status_fixed,v_source_fixed,v_conflicts));
END;
$function$
