CREATE OR REPLACE FUNCTION public.agent_upsell_checkin()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer := 0;
BEGIN
  INSERT INTO upsell_offers(reservation_id,guest_name,phone,room,offer_type,offer_price,message,tenant_id)
  SELECT r.id, g.name, g.phone,
    array_to_string(r.room_ids,', '),
    offer.type, offer.price,
    format(E'আসসালামু আলাইকুম %s! Hotel Fountain BD.\n%s\nReply YES to add.',g.name,offer.msg),
    r.tenant_id
  FROM reservations r
  JOIN guests g ON g.id=ANY(r.guest_ids)
  CROSS JOIN (VALUES
    ('LAUNDRY',      500,  E'🧺 Laundry ৳500 (same day)'),
    ('BREAKFAST',    400,  E'🍳 Breakfast ৳400/person'),
    ('LATE_CHECKOUT',1000, E'⏰ Late checkout 2PM ৳1,000'),
    ('MINIBAR',      800,  E'🥤 Minibar setup ৳800')
  ) AS offer(type,price,msg)
  LEFT JOIN upsell_offers uo ON uo.reservation_id=r.id AND uo.offer_type=offer.type
  WHERE r.status='CHECKED_IN' AND is_valid_bd_phone(g.phone) AND uo.id IS NULL;
  GET DIAGNOSTICS v_new=ROW_COUNT;

  -- Auto-folio when accepted
  INSERT INTO folios(id,reservation_id,room_number,description,amount,tenant_id)
  SELECT gen_random_uuid(),uo.reservation_id,uo.room,uo.offer_type,uo.offer_price,uo.tenant_id
  FROM upsell_offers uo
  LEFT JOIN folios f ON f.reservation_id=uo.reservation_id AND f.description=uo.offer_type
  WHERE uo.accepted=true AND f.id IS NULL;

  PERFORM agent_record_feedback('lumea-upsell','upsell_checkin',
    format('offered:%s',v_new),'upsell_sweep','SUCCESS',v_new);
  PERFORM agent_send('lumea-corporate','lumea-ceo','REPORT',
    format('Upsell: %s offers created for checked-in guests',v_new),
    'Laundry/breakfast/late-checkout/minibar queued.',
    jsonb_build_object('offers',v_new),'NORMAL');
  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-upsell','upsell_checkin',CASE WHEN v_new>0 THEN 'FIXED' ELSE 'OK' END,
    format('upsell offers=%s',v_new));
END;
$function$
