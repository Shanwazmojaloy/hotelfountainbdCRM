CREATE OR REPLACE FUNCTION public.agent_corporate_spend_detect()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO leads(id,name,email,phone,company,source,status,notes,analyst_brief,tenant_id,created_at,updated_at)
  SELECT DISTINCT ON(g.id)
    gen_random_uuid(), g.name, g.email, g.phone,
    'Corporate Prospect', 'CORPORATE_DETECT', 'NEW',
    format('High spend guest — ৳%s on %s — corporate account candidate',
      r.total_amount, r.check_out::date),
    format('Pitch: 15%% corporate discount for regular bookings. Est. value ৳%s/year if monthly.',
      r.total_amount * 12),
    r.tenant_id, NOW(), NOW()
  FROM reservations r
  JOIN guests g ON g.id = ANY(r.guest_ids)
  LEFT JOIN leads l ON l.phone = g.phone AND l.source = 'CORPORATE_DETECT'
  WHERE r.total_amount >= 15000
    AND r.status = 'CHECKED_OUT'
    AND l.id IS NULL
    AND is_valid_bd_phone(g.phone)
    AND g.phone IS NOT NULL
  ORDER BY g.id, r.total_amount DESC;
  GET DIAGNOSTICS v_new = ROW_COUNT;

  -- Also push into ceo_pipeline
  INSERT INTO ceo_pipeline(lead_id,company,contact_name,contact_phone,contact_email,
    lead_type,stage,pitch_sent,pitch_sent_at,pitch_channel,
    next_action,next_action_at,deal_value_bdt,tenant_id)
  SELECT l.id, l.company, l.name, l.phone, l.email,
    'CORPORATE', 'GENERATED', false, NULL, NULL,
    'Call within 24h — offer corporate account',
    CURRENT_DATE + 1,
    NULLIF(regexp_replace(COALESCE(substring(l.notes::text from '৳([0-9,]+)'), ''), ',', '', 'g'), '')::integer,
    l.tenant_id
  FROM leads l
  LEFT JOIN ceo_pipeline cp ON cp.lead_id = l.id
  WHERE l.source = 'CORPORATE_DETECT' AND l.status = 'NEW'
    AND cp.id IS NULL;

  IF v_new > 0 THEN
    PERFORM agent_send('lumea-corporate','lumea-ceo','ALERT',
      format('%s high-spend guests detected as corporate prospects', v_new),
      'Guests who spent ৳15,000+ auto-flagged. Pitch: 15% corporate discount for regular bookings.',
      jsonb_build_object('new_prospects',v_new,'min_spend',15000),'HIGH');
  END IF;

  PERFORM agent_record_feedback('lumea-corporate','corporate_spend_detect',
    format('detected:%s',v_new),'high_spend_mining',
    CASE WHEN v_new>0 THEN 'SUCCESS' ELSE 'SUCCESS' END, v_new);

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-corporate','corp_detect',
    CASE WHEN v_new>0 THEN 'FIXED' ELSE 'OK' END,
    format('High-spend corporate prospects found: %s',v_new));
END;
$function$
