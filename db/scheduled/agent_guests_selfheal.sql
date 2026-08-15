CREATE OR REPLACE FUNCTION public.agent_guests_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email_cleaned integer:=0;
  v_phone_cleaned integer:=0;
  v_ledger_gaps integer:=0;
BEGIN
  -- Clean placeholder emails
  UPDATE guests SET email=NULL
  WHERE email IN ('fo.hotelfountain799@gmail.com','fom.hotelfountain@gmail.com',
    'a@b.c','test@example.com') OR email='' OR email~'^\s+$';
  GET DIAGNOSTICS v_email_cleaned = ROW_COUNT;

  -- Clean dummy phones
  UPDATE guests SET phone=NULL
  WHERE phone IN ('000000000','0000000000','11111','111','2222222222222','+880000000')
    OR (phone IS NOT NULL AND length(regexp_replace(phone,'[^0-9]','','g'))<10)
    OR (phone IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g') SIMILAR TO '0{9,}|1{5,}|2{5,}');
  GET DIAGNOSTICS v_phone_cleaned = ROW_COUNT;

  -- Find ledger gaps: CHECKED_OUT with no ledger entry
  SELECT COUNT(*) INTO v_ledger_gaps
  FROM reservations r
  LEFT JOIN guest_ledger gl ON gl.reservation_id=r.id
  WHERE r.status='CHECKED_OUT' AND gl.id IS NULL;

  -- Feedback
  PERFORM agent_record_feedback('lumea-guests','placeholder_email_pattern',
    format('email:%s phone:%s ledger_gaps:%s',v_email_cleaned,v_phone_cleaned,v_ledger_gaps),
    'contact_quality_sweep','SUCCESS',v_email_cleaned+v_phone_cleaned);

  IF v_ledger_gaps > 10 THEN
    PERFORM agent_send('lumea-guests','lumea-ceo','ALERT',
      format('%s reservations missing ledger entries', v_ledger_gaps),
      'Guest ledger coverage dropped. Backfill may be needed.',
      jsonb_build_object('ledger_gaps',v_ledger_gaps),'HIGH');
  END IF;

  PERFORM agent_send('lumea-guests','lumea-ceo','REPORT',
    format('Guests v3: email:%s phone:%s ledger_gaps:%s',v_email_cleaned,v_phone_cleaned,v_ledger_gaps),
    'Contact quality enforced. Ledger coverage checked.',
    jsonb_build_object('email_cleaned',v_email_cleaned,'phone_cleaned',v_phone_cleaned,
      'ledger_gaps',v_ledger_gaps),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-guests','guests_v3',v_email_cleaned+v_phone_cleaned,
    CASE WHEN v_ledger_gaps>10 THEN 'WARN'
         WHEN (v_email_cleaned+v_phone_cleaned)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: email=%s phone=%s ledger_gaps=%s',v_email_cleaned,v_phone_cleaned,v_ledger_gaps));
END;
$function$
