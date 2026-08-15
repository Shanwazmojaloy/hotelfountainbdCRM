CREATE OR REPLACE FUNCTION public.agent_referral_queue_builder()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO referral_queue(
    reservation_id,guest_id,guest_name,phone,room,
    checkout_date,message,tenant_id)
  SELECT
    r.id, g.id, g.name, g.phone,
    array_to_string(r.room_ids,', '),
    r.check_out::date,
    format(
      'আসসালামু আলাইকুম %s ভাই/আপা! 🏨%s'
      'Hotel Fountain BD-তে থাকার জন্য ধন্যবাদ।%s'
      'আপনার বন্ধু বা পরিবারকে refer করুন:%s'
      '👉 তারা পাবেন ৳500 ছাড়%s'
      '👉 আপনি পাবেন ৳200 credit (পরের stay-এ)%s'
      -- FIX 2026-08-09: template shipped the literal placeholder "[your number]".
      'Share করুন: Hotel Fountain BD, Nikunja-02, Dhaka. ☎ +880 1322-840799%s'
      'ধন্যবাদ! 🙏',
      g.name,E'\n',E'\n',E'\n',E'\n',E'\n',E'\n'),
    r.tenant_id
  FROM reservations r
  JOIN guests g ON g.id = ANY(r.guest_ids)
  LEFT JOIN referral_queue rq ON rq.reservation_id = r.id
  WHERE r.status = 'CHECKED_OUT'
    AND is_valid_bd_phone(g.phone)
    AND rq.id IS NULL
    AND r.check_out >= NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_new = ROW_COUNT;

  PERFORM agent_record_feedback('lumea-guests','referral_queue',
    format('queued:%s',v_new),'referral_mining','SUCCESS',v_new);

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-guests','referral_queue',
    CASE WHEN v_new>0 THEN 'FIXED' ELSE 'OK' END,
    format('Referral messages queued: %s',v_new));
END;
$function$
