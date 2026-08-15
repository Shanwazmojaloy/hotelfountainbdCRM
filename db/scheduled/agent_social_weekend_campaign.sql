CREATE OR REPLACE FUNCTION public.agent_social_weekend_campaign()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_available integer; v_occupancy numeric;
  v_discount integer; v_friday date;
BEGIN
  SELECT COUNT(*) INTO v_available FROM rooms WHERE status='AVAILABLE';
  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_occupancy FROM rooms;

  v_discount := CASE
    WHEN v_occupancy < 30 THEN 20
    WHEN v_occupancy < 50 THEN 15
    ELSE 10 END;

  -- Next Friday as proper date
  v_friday := DATE_TRUNC('week', CURRENT_DATE)::date + 4;

  INSERT INTO social_content_queue(
    platform,content_type,body_bn,body_en,
    rooms_available,offer_discount,scheduled_for,tenant_id)
  SELECT t.platform, 'WEEKEND_OFFER',
    format(
      E'🏨 Weekend Escape — Hotel Fountain BD!\n'
      'এই শুক্র-শনিবার আমাদের সাথে থাকুন — %s%% ছাড়!\n'
      '✅ %s টি room available\n'
      '✅ Airport থেকে মাত্র ১০ মিনিট\n'
      '✅ 24/7 Service\n'
      '✅ Fountain Deluxe মাত্র ৳%s/রাত\n'
      '📞 এখনই book করুন!\n'
      '#HotelFountainBD #WeekendOffer #DhakaHotel',
      v_discount, v_available,
      ROUND(4000*(1-v_discount::numeric/100))),
    format('Weekend %s%% off at Hotel Fountain BD. %s rooms from BDT %s.',
      v_discount,v_available,ROUND(4000*(1-v_discount::numeric/100))),
    v_available, v_discount, v_friday,
    fountain_tenant_id()
  FROM (VALUES ('FACEBOOK'),('WHATSAPP')) AS t(platform)
  WHERE NOT EXISTS(
    SELECT 1 FROM social_content_queue
    WHERE scheduled_for=v_friday AND content_type='WEEKEND_OFFER');

  PERFORM agent_send('lumea-corporate','lumea-ceo','REPORT',
    format('Weekend campaign: %s%% off, %s rooms, Friday %s',v_discount,v_available,v_friday),
    'Content queued for Facebook and WhatsApp.',
    jsonb_build_object('discount',v_discount,'rooms',v_available),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-corporate','weekend_campaign','OK',
    format('Campaign: %s%% discount for %s (%s rooms)',v_discount,v_friday,v_available));
END;
$function$
