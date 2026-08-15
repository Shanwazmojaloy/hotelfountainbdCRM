CREATE OR REPLACE FUNCTION public.agent_flash_sale()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant   uuid;
  v_occupancy numeric;
  v_empty     integer;
  v_inventory integer;
  v_flash_rate numeric;
BEGIN
  -- FIX 2026-08-09: tenant was resolved via (SELECT tenant_id FROM reservations LIMIT 1)
  -- (unordered => arbitrary row). Resolve deterministically by slug instead.
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'hotelfountainbd';
  IF v_tenant IS NULL THEN
    INSERT INTO agent_run_log(agent_id,action,status,details)
    VALUES('lumea-flash','flash_check','WARN','tenant hotelfountainbd not found - skipped');
    RETURN;
  END IF;

  -- FIX 2026-08-09: occupancy counted ALL rooms (33 across 2 tenants) but divided by a
  -- hardcoded 28 => the lumeademo tenant inflated Hotel Fountain occupancy. Scope by
  -- tenant and derive inventory from the live room count.
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status='AVAILABLE'),
         ROUND(COUNT(*) FILTER (WHERE status='OCCUPIED')::numeric
               / NULLIF(COUNT(*),0) * 100, 1)
    INTO v_inventory, v_empty, v_occupancy
    FROM rooms WHERE tenant_id = v_tenant;

  IF COALESCE(v_inventory,0) = 0 THEN
    INSERT INTO agent_run_log(agent_id,action,status,details)
    VALUES('lumea-flash','flash_check','WARN','no rooms for tenant - skipped');
    RETURN;
  END IF;

  IF v_occupancy<40 AND EXTRACT(HOUR FROM NOW())>=11
    AND NOT EXISTS(SELECT 1 FROM flash_sale_log WHERE trigger_date=CURRENT_DATE AND tenant_id=v_tenant) THEN

    v_flash_rate:=CASE WHEN v_occupancy<20 THEN 2500 WHEN v_occupancy<30 THEN 2800 ELSE 3200 END;

    INSERT INTO flash_sale_log(trigger_date,occupancy_pct,rooms_empty,flash_rate,tenant_id)
    VALUES(CURRENT_DATE,v_occupancy,v_empty,v_flash_rate,v_tenant);

    INSERT INTO social_content_queue(platform,content_type,body_bn,body_en,
      rooms_available,offer_discount,scheduled_for,tenant_id)
    VALUES('WHATSAPP','FLASH_SALE',
      format(E'⚡ আজ রাতের FLASH OFFER!\nHotel Fountain BD\n\n🏨 %s টি room available\n৳%s/রাত (সাধারণ ৳4,000)\n⏰ আজ রাত পর্যন্ত\n📞 এখনই call করুন!\n#FlashOffer #HotelFountainBD',
        v_empty,v_flash_rate),
      format('FLASH SALE! %s rooms at BDT %s tonight only.',v_empty,v_flash_rate),
      v_empty,ROUND((4000-v_flash_rate)/40),CURRENT_DATE,v_tenant);

    PERFORM agent_send('lumea-flash','lumea-ceo','ALERT',
      format('FLASH SALE: %s%% occupancy — %s rooms — ৳%s rate',v_occupancy,v_empty,v_flash_rate),
      'Post on WhatsApp/Facebook now.',
      jsonb_build_object('occupancy',v_occupancy,'rooms',v_empty,'rate',v_flash_rate),'HIGH');
  END IF;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-flash','flash_check',
    CASE WHEN v_occupancy<40 THEN 'WARN' ELSE 'OK' END,
    format('occ=%s%% empty=%s inventory=%s',v_occupancy,v_empty,v_inventory));
END;
$function$
