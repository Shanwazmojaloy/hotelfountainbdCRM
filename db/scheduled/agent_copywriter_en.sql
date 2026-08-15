CREATE OR REPLACE FUNCTION public.agent_copywriter_en()
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
    WHERE status IN ('DRAFT','PENDING_REVIEW') AND body_en IS NULL
      AND platform IN ('INSTAGRAM','LINKEDIN','ALL')
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
    ORDER BY scheduled_for
  LOOP
    v_body:=CASE
      WHEN v_slot.content_type='ROOM_SPOTLIGHT' THEN
        '✨ Fountain Deluxe Room at Hotel Fountain BD.'||E'\n\n'||
        'Premium furnishings. High-speed WiFi. 24/7 concierge.'||E'\n'||
        '📍 Nikunja-02 — 10 min from HSIA.'||E'\n'||
        '🛏️ From BDT '||v_dyn::text||' per night.'||E'\n\n'||
        'Your comfort, our commitment.'
      WHEN v_slot.content_type='CORPORATE_PITCH' THEN
        'Streamline corporate travel with Hotel Fountain BD.'||E'\n\n'||
        '✅ Negotiated corporate rates'||E'\n'||
        '✅ Monthly invoicing'||E'\n'||
        '✅ Priority availability'||E'\n'||
        '✅ 10 min from Dhaka Airport'||E'\n\n'||
        'DM us to set up your corporate account.'
      WHEN v_slot.content_type='TIPS' THEN
        'Traveling through Dhaka? 🇧🇩'||E'\n\n'||
        'Smart travelers stay in Nikunja-02.'||E'\n'||
        '→ 10-min straight drive from HSIA'||E'\n'||
        '→ 24/7 front desk'||E'\n'||
        '→ From BDT 4,000/night'||E'\n\n'||
        'Hotel Fountain BD. Your airport hotel in Dhaka. ✈️'
      WHEN v_slot.content_type='TESTIMONIAL' THEN
        '"Seamless transit stay. Clean rooms, fast check-in, helpful staff."'||E'\n'||
        '— Corporate Guest, Dhaka 2026'||E'\n\n'||
        'Experience the difference. Book today.'
      WHEN v_slot.content_type='BEHIND_SCENES' THEN
        'What makes a perfect hotel stay? 🏨'||E'\n\n'||
        '🧹 Housekeeping that never cuts corners'||E'\n'||
        '🛎️ Front desk around the clock'||E'\n'||
        '☕ Fresh breakfast every morning'||E'\n\n'||
        'We offer reliability, not just rooms.'
      WHEN v_slot.content_type IN ('OFFER','WEEKEND_OFFER') THEN
        'Weekend in Dhaka? 🌆'||E'\n\n'||
        v_avail||' rooms available. From BDT '||v_dyn::text||'/night.'||E'\n'||
        'Airport proximity included. Book directly for best rates.'
      WHEN v_slot.content_type='SEASONAL' THEN
        'Eid Mubarak from Hotel Fountain BD! 🌙'||E'\n\n'||
        'Special Eid packages available. Family rooms. Festive breakfast.'||E'\n'||
        'Book your stay for the holidays.'
      ELSE 'Hotel Fountain BD — Premium stay near Dhaka Airport.'||E'\n'||
        'Nikunja-02 | 28 rooms | 24/7 service | BDT '||v_dyn::text
    END;

    UPDATE content_calendar SET body_en=v_body WHERE id=v_slot.id;
  END LOOP;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-copywriter-en','en_copy','OK','English content written for Instagram/LinkedIn');
END;
$function$
