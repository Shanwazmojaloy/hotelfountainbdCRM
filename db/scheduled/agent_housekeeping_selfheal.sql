CREATE OR REPLACE FUNCTION public.agent_housekeeping_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_completed integer:=0; v_superseded integer:=0; v_still_pending integer;
BEGIN
  -- Auto-complete for AVAILABLE rooms
  UPDATE housekeeping_tasks SET status='COMPLETED',completed_at=NOW(),
    notes='Auto-completed: room AVAILABLE'
  WHERE status='PENDING'
    AND room_number IN (SELECT room_number FROM rooms WHERE status='AVAILABLE');
  GET DIAGNOSTICS v_completed = ROW_COUNT;

  -- Auto-supersede for re-occupied rooms
  UPDATE housekeeping_tasks SET status='SUPERSEDED',notes='Auto: room re-occupied'
  WHERE status='PENDING'
    AND room_number IN (SELECT room_number FROM rooms WHERE status='OCCUPIED');
  GET DIAGNOSTICS v_superseded = ROW_COUNT;

  -- Dedup — latest per room only
  UPDATE housekeeping_tasks SET status='SUPERSEDED',notes='Auto-dedup'
  WHERE status='PENDING'
    AND id NOT IN (
      SELECT DISTINCT ON (room_number) id FROM housekeeping_tasks
      WHERE status='PENDING' ORDER BY room_number,created_at DESC);

  -- Count remaining
  SELECT COUNT(*) INTO v_still_pending FROM housekeeping_tasks WHERE status='PENDING';

  -- Track completion pattern
  PERFORM agent_record_feedback('lumea-housekeeping','duplicate_pending_tasks',
    format('completed:%s superseded:%s still_pending:%s',v_completed,v_superseded,v_still_pending),
    'sweep_and_resolve','SUCCESS',v_completed+v_superseded);

  -- Tell rooms when tasks are done (rooms can now go AVAILABLE)
  IF v_completed > 0 THEN
    PERFORM agent_send('lumea-housekeeping','lumea-rooms','REPORT',
      format('%s housekeeping tasks completed → rooms ready', v_completed),
      'These rooms may now be set AVAILABLE pending room agent next sweep.',
      jsonb_build_object('completed',v_completed),'NORMAL');
  END IF;

  PERFORM agent_send('lumea-housekeeping','lumea-ceo','REPORT',
    format('HK v3: completed:%s superseded:%s pending:%s',v_completed,v_superseded,v_still_pending),
    format('Tasks resolved. %s still pending in queue.',v_still_pending),
    jsonb_build_object('completed',v_completed,'superseded',v_superseded,'still_pending',v_still_pending),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-housekeeping','hk_v3',v_completed+v_superseded,
    CASE WHEN v_still_pending>5 THEN 'WARN'
         WHEN (v_completed+v_superseded)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: completed=%s superseded=%s pending=%s',v_completed,v_superseded,v_still_pending));
END;
$function$
