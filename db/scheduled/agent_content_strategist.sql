CREATE OR REPLACE FUNCTION public.agent_content_strategist()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_occ numeric; v_avail integer; v_season text;
  v_strategy text; v_week date; v_tid uuid; v_month integer;
BEGIN
  v_tid := fountain_tenant_id();
  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1),
    COUNT(CASE WHEN status='AVAILABLE' THEN 1 END) INTO v_occ,v_avail FROM rooms;
  v_month:=EXTRACT(MONTH FROM CURRENT_DATE);
  v_week:=DATE_TRUNC('week',CURRENT_DATE)::date;
  v_season:=CASE WHEN v_month IN (4,5) THEN 'RAMADAN_EID'
    WHEN v_month IN (12,1) THEN 'WINTER_PEAK'
    WHEN v_month IN (6,7,8) THEN 'MONSOON_LOW' ELSE 'NORMAL' END;
  v_strategy:=CASE WHEN v_occ<30 THEN 'AGGRESSIVE_PROMO'
    WHEN v_occ<50 THEN 'SOFT_PROMO' WHEN v_occ>80 THEN 'BRAND_BUILDING' ELSE 'BALANCED' END;

  -- Plan 14 slots across 7 days
  INSERT INTO content_calendar(platform,content_type,title,target_audience,scheduled_for,post_time,status,created_by_agent,tenant_id)
  VALUES
    ('FACEBOOK',  'ROOM_SPOTLIGHT','Featured Room','GENERAL',     v_week+0,'10:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'ROOM_SPOTLIGHT','Featured Room','GENERAL',     v_week+0,'10:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'CORPORATE_PITCH','Corporate','CORPORATE',      v_week+1,'09:00','DRAFT','lumea-strategist',v_tid),
    ('LINKEDIN',  'CORPORATE_PITCH','Corporate','CORPORATE',      v_week+1,'09:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'TIPS','Travel Tips','GENERAL',                 v_week+2,'11:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'BEHIND_SCENES','Behind Scenes','GENERAL',      v_week+3,'14:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'BEHIND_SCENES','Behind Scenes','GENERAL',      v_week+3,'14:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'OFFER','Weekend Offer','GENERAL',              v_week+4,'08:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'OFFER','Weekend Offer','GENERAL',              v_week+4,'08:00','DRAFT','lumea-strategist',v_tid),
    ('WHATSAPP',  'OFFER','Weekend Offer','GENERAL',              v_week+4,'08:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'SEASONAL',v_season,'GENERAL',                  v_week+5,'10:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'TESTIMONIAL','Guest Story','GENERAL',          v_week+6,'11:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'TESTIMONIAL','Guest Story','GENERAL',          v_week+6,'11:00','DRAFT','lumea-strategist',v_tid),
    ('WHATSAPP',  'TESTIMONIAL','Guest Story','GENERAL',          v_week+6,'11:00','DRAFT','lumea-strategist',v_tid)
  ON CONFLICT DO NOTHING;

  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-strategist','weekly_strategy','Weekly content strategy',1,1,0.9,
    jsonb_build_object('strategy',v_strategy,'occ',v_occ,'season',v_season,'week',v_week))
  ON CONFLICT(pattern_key) DO UPDATE SET
    metadata=jsonb_build_object('strategy',v_strategy,'occ',v_occ,'season',v_season),
    times_seen=agent_pattern_memory.times_seen+1,updated_at=NOW();

  PERFORM agent_send('lumea-strategist','lumea-ceo','REPORT',
    format('Content strategy: %s | occ:%s%% | %s | 14 slots planned',v_strategy,v_occ,v_season),
    'Weekly calendar set. Copywriters briefed.',
    jsonb_build_object('strategy',v_strategy,'slots',14),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-strategist','weekly_plan','OK',
    format('strategy=%s occ=%s%% season=%s',v_strategy,v_occ,v_season));
END;
$function$
