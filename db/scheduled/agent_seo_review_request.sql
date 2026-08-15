CREATE OR REPLACE FUNCTION public.agent_seo_review_request()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_queued integer;
BEGIN
  INSERT INTO review_queue(id,reservation_id,tenant_id)
  SELECT gen_random_uuid(),r.id,r.tenant_id
  FROM reservations r
  JOIN reservation_billing_summary rbs ON rbs.id=r.id
  LEFT JOIN review_queue rq ON rq.reservation_id=r.id
  WHERE r.status='CHECKED_OUT' AND rbs.is_settled=true
    AND rq.id IS NULL AND r.check_out>=NOW()-INTERVAL '3 days';
  GET DIAGNOSTICS v_queued=ROW_COUNT;

  IF v_queued>0 THEN
    INSERT INTO social_content_queue(platform,content_type,body_bn,body_en,
      rooms_available,offer_discount,scheduled_for,tenant_id)
    VALUES('WHATSAPP','REVIEW_REQUEST',
      E'আমাদের সাথে থাকার জন্য ধন্যবাদ! 🏨\nGoogle review দিন:\ng.page/hotelfountainbd\nমাত্র ৩০ সেকেন্ড। ধন্যবাদ! 🙏',
      'Thanks for staying at Hotel Fountain BD! Leave a review: g.page/hotelfountainbd',
      0,0,CURRENT_DATE,(SELECT tenant_id FROM reservations LIMIT 1))
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM agent_send('lumea-seo','lumea-ceo','REPORT',
    format('SEO: %s review requests queued',v_queued),
    'Target: 50 Google reviews = 3x OTA visibility.',
    jsonb_build_object('queued',v_queued),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-seo','review_request',
    CASE WHEN v_queued>0 THEN 'FIXED' ELSE 'OK' END,
    format('review requests=%s',v_queued));
END;
$function$
