CREATE OR REPLACE FUNCTION public.agent_generate_variations(p_content_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_slot   record;
  v_dyn    numeric;
  v_avail  integer;
  v_occ    numeric;
  v_tid    uuid;
BEGIN
  SELECT * INTO v_slot FROM content_calendar WHERE id=p_content_id;
  IF v_slot IS NULL THEN RETURN; END IF;

  SELECT COALESCE(dynamic_rate,4000) INTO v_dyn FROM dynamic_pricing_log
  WHERE category='Fountain Deluxe' AND effective_date=CURRENT_DATE LIMIT 1;
  SELECT COUNT(CASE WHEN status='AVAILABLE' THEN 1 END),
    ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_avail, v_occ FROM rooms;
  v_tid := fountain_tenant_id();

  DELETE FROM content_variations WHERE content_id=p_content_id;

  -- V1: PRICE-LED
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,1,v_slot.platform,'PRICE_LED',
    '💰 Best Value in Nikunja-02 — Hotel Fountain BD'||E'\n\n'||
    'Premium rooms at unbeatable airport rates.'||E'\n\n'||
    '🛏️ Fountain Deluxe — BDT '||v_dyn::text||'/night'||E'\n'||
    '🛏️ Premium Deluxe — BDT '||((v_dyn*1.125)::integer)::text||'/night'||E'\n'||
    '🛏️ Royal Suite — BDT '||((v_dyn*2.25)::integer)::text||'/night'||E'\n\n'||
    '✈️ 10 minutes from Hazrat Shahjalal Airport'||E'\n'||
    '📞 Book now for best rates!',
    '📞 Call now for best rate!',
    '#BestRates #HotelFountainBD #DhakaHotel #AirportHotel #BudgetLuxury',
    'PRICE COMPARISON graphic. 3 room tiers with BDT rates. Gold price badges. Dark #1A1816 background. Bold mono font numbers.',
    v_tid);

  -- V2: EMOTION
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,2,v_slot.platform,'EMOTION',
    '🏡 Feel At Home — Hotel Fountain BD'||E'\n\n'||
    'After a long journey, you deserve genuine comfort.'||E'\n\n'||
    '🛏️ Soft premium bedding'||E'\n'||
    '🚿 Spotless ensuite bathroom'||E'\n'||
    '☕ Morning tea & coffee on request'||E'\n'||
    '😊 Warm, attentive staff — around the clock'||E'\n\n'||
    '📍 Nikunja-02, Dhaka — 10 min from the airport.'||E'\n'||
    'From BDT '||v_dyn::text||'/night.',
    '🛏️ Book your rest tonight',
    '#TravelComfort #HotelFountainBD #DhakaStay #HomeAwayFromHome #Hospitality',
    'WARM lifestyle photo. Cozy room. Soft warm lighting. Guest relaxing. Emotional, inviting feel.',
    v_tid);

  -- V3: URGENCY
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,3,v_slot.platform,'URGENCY',
    '⚠️ Only '||v_avail||' Rooms Left — Hotel Fountain BD'||E'\n\n'||
    'Availability is running out fast.'||E'\n\n'||
    '🔴 '||v_avail||' rooms available right now'||E'\n'||
    '💰 From BDT '||v_dyn::text||'/night'||E'\n'||
    '✈️ 10 minutes from HSIA'||E'\n\n'||
    '⏰ Do not wait — rooms are filling up!'||E'\n'||
    '📞 Call now to secure yours!',
    '⚡ Book NOW — rooms filling fast',
    '#LastMinute #HotelFountainBD #OnlyFewLeft #BookNow #DhakaHotel',
    'URGENCY design. Red accents. Room counter "Only '||v_avail||' left!". Bold countdown feel. High contrast.',
    v_tid);

  -- V4: SOCIAL PROOF
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,4,v_slot.platform,'SOCIAL_PROOF',
    '⭐⭐⭐⭐⭐ Guests Are Talking...'||E'\n\n'||
    '"Exceptional location. 10 minutes from the airport and impeccable service."'||E'\n'||
    '— Corporate Guest, Dhaka'||E'\n\n'||
    '"Cleanest hotel room I have stayed in Dhaka. Will always choose Hotel Fountain BD."'||E'\n'||
    '— Frequent Traveler'||E'\n\n'||
    '🏨 Join 880+ satisfied guests.'||E'\n'||
    'From BDT '||v_dyn::text||'/night.',
    '⭐ See more reviews — Book today',
    '#GuestReview #HotelFountainBD #5Stars #DhakaHotel #HappyGuests',
    'REVIEW WALL. 2 quote cards side by side. Star ratings. Names. Ivory #F9F7F2 + gold border. Premium feel.',
    v_tid);

  -- V5: BENEFIT-LED
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,5,v_slot.platform,'BENEFIT',
    '✈️ The #1 Airport Hotel in Nikunja-02 — Hotel Fountain BD'||E'\n\n'||
    'Why frequent Dhaka travelers choose us:'||E'\n\n'||
    '🚗 10-min drive from HSIA — zero highway traffic'||E'\n'||
    '🛎️ 24/7 front desk — no matter when you land'||E'\n'||
    '🧹 Deep-cleaned room after every checkout'||E'\n'||
    '📶 High-speed WiFi in all rooms'||E'\n'||
    '💼 Corporate billing available'||E'\n\n'||
    'From BDT '||v_dyn::text||'/night. Nikunja-02, Dhaka.',
    '✈️ Your airport hotel — Book now',
    '#AirportHotel #BusinessTravel #HotelFountainBD #DhakaTravel #CorporateStay',
    'BENEFITS LIST. 5 icons + benefit text. Clean infographic. Gold checkmarks on dark background.',
    v_tid);

  -- V6: CURIOSITY
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,6,v_slot.platform,'CURIOSITY',
    '🤔 The mistake most travelers make after landing in Dhaka...'||E'\n\n'||
    'They book a hotel far away and spend an hour stuck in traffic.'||E'\n\n'||
    'Smart travelers know about Hotel Fountain BD:'||E'\n'||
    '→ 10 minutes from HSIA — straight road, no traffic'||E'\n'||
    '→ BDT '||v_dyn::text||'/night'||E'\n'||
    '→ 24/7 service'||E'\n\n'||
    'Be the smart traveler. 😉'||E'\n'||
    '📞 Book now!',
    '😉 Be the smart traveler — Book now',
    '#SmartTravel #DhakaAirport #TravelTip #HotelFountainBD #TravelHack',
    'BEFORE/AFTER split. Left: stressed traveler in traffic. Right: relaxed guest in hotel. Hook visual. Bold contrast.',
    v_tid);

  UPDATE content_calendar SET status='VARIATIONS_READY' WHERE id=p_content_id;
END;
$function$
