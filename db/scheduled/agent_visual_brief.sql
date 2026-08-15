CREATE OR REPLACE FUNCTION public.agent_visual_brief()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slot record; v_brief text; v_dyn numeric;
BEGIN
  SELECT COALESCE(dynamic_rate,4000) INTO v_dyn FROM dynamic_pricing_log
  WHERE category='Fountain Deluxe' AND effective_date=CURRENT_DATE LIMIT 1;

  FOR v_slot IN
    SELECT id,content_type,platform FROM content_calendar
    WHERE visual_brief IS NULL
      AND status IN ('PENDING_REVIEW','DRAFT')
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
  LOOP
    v_brief:=CASE
      WHEN v_slot.content_type='ROOM_SPOTLIGHT' THEN
        'PHOTO: Fountain Deluxe room — white linen, warm lighting, hero shot. '||
        'OVERLAY: Room name + BDT '||v_dyn::text||'. FONT: Libre Baskerville. COLORS: #F9F7F2 + #C5A059. SIZE: 1080×1080.'
      WHEN v_slot.content_type IN ('OFFER','WEEKEND_OFFER') THEN
        'SPLIT LAYOUT: Room photo left + offer text right. BADGE: "WEEKEND OFFER" gold circle. '||
        'DARK background #1A1816 + gold text #C5A059. Rate in large mono font.'
      WHEN v_slot.content_type='FLASH_SALE' THEN
        'URGENT red banner + hotel photo. "FLASH SALE" bold text top. Rate center. "TONIGHT ONLY" bottom. High contrast: red + white + gold.'
      WHEN v_slot.content_type='CORPORATE_PITCH' THEN
        'CLEAN minimalist. Hotel lobby/exterior. "Corporate Accounts Available" serif. Briefcase + invoice icons. LinkedIn 1200×627.'
      WHEN v_slot.content_type='BEHIND_SCENES' THEN
        'COLLAGE 4 photos: housekeeping/front desk/breakfast/exterior. Candid feel. Caption: "Your comfort begins here".'
      WHEN v_slot.content_type='TESTIMONIAL' THEN
        'QUOTE CARD: Guest quote in large italic serif. ⭐⭐⭐⭐⭐ above. Hotel logo below. Ivory #F9F7F2 + gold border.'
      WHEN v_slot.content_type='TIPS' THEN
        'MAP GRAPHIC: DAC airport → Hotel Fountain BD arrow in gold. "10 min" label. Clean infographic, white background.'
      WHEN v_slot.content_type='SEASONAL' THEN
        'EID DESIGN: Crescent moon + stars. Hotel photo with festive overlay. Gold + green palette. Calligraphic "Eid Mubarak".'
      ELSE 'Hotel exterior or room photo. Logo bottom right. Contact info. Brand colors: #1A1816 + #C5A059.'
    END;
    UPDATE content_calendar SET visual_brief=v_brief WHERE id=v_slot.id;
  END LOOP;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-visual','visual_briefs','OK','Visual briefs written for all slots');
END;
$function$
