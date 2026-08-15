CREATE OR REPLACE FUNCTION public.agent_copywriter_bn()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slot record; v_body text; v_dyn numeric; v_avail integer;
BEGIN
  SELECT COALESCE(dynamic_rate,4000) INTO v_dyn FROM dynamic_pricing_log
  WHERE category='Fountain Deluxe' AND effective_date=CURRENT_DATE LIMIT 1;
  SELECT COUNT(CASE WHEN status='AVAILABLE' THEN 1 END) INTO v_avail FROM rooms;

  FOR v_slot IN
    SELECT id,content_type,platform,scheduled_for FROM content_calendar
    WHERE status='DRAFT' AND body_bn IS NULL
      AND platform IN ('FACEBOOK','WHATSAPP','ALL')
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
    ORDER BY scheduled_for
  LOOP
    v_body:=CASE
      WHEN v_slot.content_type='ROOM_SPOTLIGHT' THEN
        '🏨 Room Spotlight — Hotel Fountain BD'||E'\n\n'||
        'Step into our Fountain Deluxe Room!'||E'\n\n'||
        '✅ Premium furnishings'||E'\n'||
        '✅ High-speed WiFi'||E'\n'||
        '✅ 24/7 Room Service'||E'\n'||
        '✅ 10 minutes from HSIA Airport'||E'\n\n'||
        '💰 From BDT '||v_dyn::text||'/night'||E'\n\n'||
        '📞 Book now!'
      WHEN v_slot.content_type IN ('OFFER','WEEKEND_OFFER') THEN
        '🎉 Special Weekend Offer!'||E'\n\n'||
        '🛏️ '||v_avail||' rooms available'||E'\n'||
        '💰 Starting BDT '||v_dyn::text||'/night'||E'\n'||
        '✈️ Airport proximity — Nikunja-02'||E'\n\n'||
        '📞 Reserve now — limited rooms!'
      WHEN v_slot.content_type='FLASH_SALE' THEN
        '⚡ FLASH OFFER — Tonight Only!'||E'\n\n'||
        '🛏️ '||v_avail||' rooms available'||E'\n'||
        '💰 Special rate: BDT '||GREATEST((v_dyn*0.8)::integer,2500)::text||E'\n'||
        '⏰ Limited time — call now!'
      WHEN v_slot.content_type='CORPORATE_PITCH' THEN
        '🏢 Corporate Accounts — Hotel Fountain BD'||E'\n\n'||
        '✅ Negotiated corporate rates'||E'\n'||
        '✅ Monthly billing'||E'\n'||
        '✅ Priority room booking'||E'\n'||
        '✅ 10 min from Dhaka Airport'||E'\n\n'||
        '📧 Contact us today to set up your account!'
      WHEN v_slot.content_type='TESTIMONIAL' THEN
        '⭐⭐⭐⭐⭐ Guest Review'||E'\n\n'||
        '"Excellent stay at Hotel Fountain BD. '||
        'Staff was incredibly helpful, room spotless, '||
        'and the airport proximity was perfect."'||E'\n\n'||
        '— Satisfied Guest, Dhaka 2026'||E'\n\n'||
        '🏨 Experience it yourself — Book today!'
      WHEN v_slot.content_type='BEHIND_SCENES' THEN
        '👀 Behind the Scenes at Hotel Fountain BD'||E'\n\n'||
        '🧹 Housekeeping: Every room deep-cleaned'||E'\n'||
        '🛎️ Front Desk: Available 24/7'||E'\n'||
        '🍳 Kitchen: Fresh breakfast every morning'||E'\n\n'||
        'We do not just offer rooms — we offer reliability.'||E'\n'||
        '📞 Book now!'
      WHEN v_slot.content_type='TIPS' THEN
        '💡 Dhaka Travel Tip!'||E'\n\n'||
        'Just landed at Hazrat Shahjalal Airport?'||E'\n\n'||
        '🏨 Hotel Fountain BD is 10 minutes away'||E'\n'||
        '✅ No highway traffic'||E'\n'||
        '✅ 24/7 Front Office'||E'\n'||
        '✅ Rooms from BDT 4,000'||E'\n\n'||
        'The smart choice for Dhaka arrivals!'
      WHEN v_slot.content_type='SEASONAL' THEN
        '🌙 Eid Mubarak from Hotel Fountain BD!'||E'\n\n'||
        'Celebrate Eid with your family in comfort.'||E'\n'||
        '🎊 Special Eid packages available'||E'\n'||
        '🍽️ Festive breakfast included'||E'\n'||
        '🛏️ Family rooms ready'||E'\n\n'||
        'Make your Eid celebration unforgettable!'
      ELSE '🏨 Hotel Fountain BD — Nikunja-02, Dhaka'||E'\n'||
        '10 min from Airport. 28 premium rooms. 24/7 service.'||E'\n'||
        'BDT '||v_dyn::text||'/night. 📞 Book now!'
    END;

    UPDATE content_calendar SET
      body_bn=v_body,
      cta=CASE v_slot.platform
        WHEN 'WHATSAPP' THEN '📞 Reply to this message to book!'
        WHEN 'FACEBOOK' THEN '👇 Comment or send us a message!'
        ELSE '🔗 Link in bio!'
      END,
      hashtags='#HotelFountainBD #NikunjaDhaka #DhakaHotel #AirportHotel #Bangladesh #Travel #BusinessTravel',
      status='PENDING_REVIEW'
    WHERE id=v_slot.id;
  END LOOP;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-copywriter-bn','copy_en','OK','English content written for all platforms');
END;
$function$
