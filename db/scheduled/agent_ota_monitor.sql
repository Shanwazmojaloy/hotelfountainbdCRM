CREATE OR REPLACE FUNCTION public.agent_ota_monitor()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ota_count integer;
  v_booking_com integer;
  v_agoda integer;
  v_direct integer;
  v_total integer;
  v_ota_pct numeric;
BEGIN
  SELECT
    COUNT(CASE WHEN source='BOOKING_COM' THEN 1 END),
    COUNT(CASE WHEN source='AGODA' THEN 1 END),
    COUNT(CASE WHEN source='DIRECT' THEN 1 END),
    COUNT(*)
  INTO v_booking_com, v_agoda, v_direct, v_total
  FROM reservations
  WHERE check_in >= NOW() - INTERVAL '30 days';

  v_ota_count := v_booking_com + v_agoda;
  v_ota_pct := ROUND(v_ota_count::numeric / NULLIF(v_total,0) * 100, 1);

  -- Pattern: first OTA booking ever
  IF v_ota_count > 0 AND NOT EXISTS (
    SELECT 1 FROM agent_pattern_memory
    WHERE agent_id='lumea-ota' AND pattern_key='first_ota_booking_received'
  ) THEN
    INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
    VALUES('lumea-ota','first_ota_booking_received',
      'First OTA booking received — channel validated',
      1,1,0.99,
      jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,'date',CURRENT_DATE));

    -- Escalate to CEO immediately
    PERFORM agent_send('lumea-ota','lumea-ceo','DECISION',
      format('FIRST OTA BOOKING: %s Booking.com + %s Agoda in last 30 days',v_booking_com,v_agoda),
      'OTA channel validated. Scale listings immediately — increase room inventory on OTA, request featured placement, add photos.',
      jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,'ota_pct',v_ota_pct,'deal_value',1440000),
      'CRITICAL');
  END IF;

  -- Store OTA trend daily
  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-ota','ota_channel_mix',
    'Daily OTA vs direct booking mix tracking',1,1,0.9,
    jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,
      'direct',v_direct,'ota_pct',v_ota_pct,'date',CURRENT_DATE))
  ON CONFLICT(pattern_key) DO UPDATE SET
    times_seen=agent_pattern_memory.times_seen+1,
    metadata=jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,
      'direct',v_direct,'ota_pct',v_ota_pct,'date',CURRENT_DATE),
    updated_at=NOW();

  -- Alert CEO if still 0% OTA after 7 days (listing may not be live)
  IF v_ota_count=0 AND CURRENT_DATE > '2026-05-19' THEN
    PERFORM agent_send('lumea-ota','lumea-ceo','ALERT',
      'OTA LISTINGS NOT GENERATING BOOKINGS',
      'Booking.com registered but 0 bookings in 7+ days. Check listing status, photos, and pricing.',
      jsonb_build_object('days_live',CURRENT_DATE-'2026-05-12'),'HIGH');
  END IF;

  PERFORM agent_record_feedback('lumea-ota','ota_channel_mix',
    format('ota:%s direct:%s pct:%s%%',v_ota_count,v_direct,v_ota_pct),
    'channel_monitor','SUCCESS',v_ota_count);

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-ota','ota_monitor',
    CASE WHEN v_ota_count>0 THEN 'FIXED' ELSE 'OK' END,
    format('booking_com=%s agoda=%s direct=%s ota_pct=%s%%',
      v_booking_com,v_agoda,v_direct,v_ota_pct));
END;
$function$
