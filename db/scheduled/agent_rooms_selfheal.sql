CREATE OR REPLACE FUNCTION public.agent_rooms_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ghost integer:=0; v_mismatch integer:=0;
  v_occupancy_rate numeric; v_pattern record; v_conf integer:=95;
BEGIN
  SELECT INTO v_pattern confidence FROM agent_pattern_memory
  WHERE agent_id='lumea-rooms' AND pattern_key='occupied_no_reservation';
  v_conf:=COALESCE(ROUND(v_pattern.confidence*100)::integer,95);

  UPDATE rooms r SET status='DIRTY' WHERE r.status='OCCUPIED'
    AND NOT EXISTS(SELECT 1 FROM reservations res
      WHERE res.status='CHECKED_IN' AND r.room_number=ANY(res.room_ids));
  GET DIAGNOSTICS v_ghost=ROW_COUNT;

  UPDATE rooms r SET status='OCCUPIED' WHERE r.status='AVAILABLE'
    AND EXISTS(SELECT 1 FROM reservations res
      WHERE res.status='CHECKED_IN' AND r.room_number=ANY(res.room_ids));
  GET DIAGNOSTICS v_mismatch=ROW_COUNT;

  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_occupancy_rate FROM rooms;

  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-rooms','occupancy_trend','Daily occupancy tracking',1,1,0.9,
    jsonb_build_object('rate',v_occupancy_rate,'date',CURRENT_DATE,
      'available',(SELECT COUNT(*) FROM rooms WHERE status='AVAILABLE'),
      'occupied',(SELECT COUNT(*) FROM rooms WHERE status='OCCUPIED'),
      'dirty',(SELECT COUNT(*) FROM rooms WHERE status='DIRTY')))
  ON CONFLICT(pattern_key) DO UPDATE SET
    times_seen=agent_pattern_memory.times_seen+1,
    metadata=jsonb_build_object('rate',v_occupancy_rate,'date',CURRENT_DATE,
      'available',(SELECT COUNT(*) FROM rooms WHERE status='AVAILABLE'),
      'occupied',(SELECT COUNT(*) FROM rooms WHERE status='OCCUPIED'),
      'dirty',(SELECT COUNT(*) FROM rooms WHERE status='DIRTY')),
    updated_at=NOW();

  PERFORM agent_record_feedback('lumea-rooms','occupied_no_reservation',
    format('ghost:%s mismatch:%s occ:%s%%',v_ghost,v_mismatch,v_occupancy_rate),
    'sync_and_track','SUCCESS',v_ghost+v_mismatch);

  IF v_ghost>0 THEN
    PERFORM agent_send('lumea-rooms','lumea-housekeeping','ALERT',
      format('%s ghost rooms set DIRTY',v_ghost),'Housekeeping needed.',
      jsonb_build_object('dirty_rooms',v_ghost),'HIGH');
  END IF;

  IF v_occupancy_rate<30 THEN
    PERFORM agent_send('lumea-rooms','lumea-ceo','ALERT',
      format('LOW OCCUPANCY: %s%% — only %s/28 rooms occupied',
        v_occupancy_rate,ROUND(v_occupancy_rate*28/100)),
      'Consider B2B activation or OTA push.',
      jsonb_build_object('occupancy_rate',v_occupancy_rate),'HIGH');
  END IF;

  PERFORM agent_send('lumea-rooms','lumea-ceo','REPORT',
    format('Rooms v3: %s%% occupancy %s fixed conf:%s%%',v_occupancy_rate,v_ghost+v_mismatch,v_conf),
    format('ghost:%s mismatch:%s occ:%s%%',v_ghost,v_mismatch,v_occupancy_rate),
    jsonb_build_object('occupancy_rate',v_occupancy_rate,'corrections',v_ghost+v_mismatch),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-rooms','rooms_v3',v_ghost+v_mismatch,
    CASE WHEN (v_ghost+v_mismatch)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: ghost=%s mismatch=%s occ=%s%% conf=%s%%',v_ghost,v_mismatch,v_occupancy_rate,v_conf));
END;
$function$
