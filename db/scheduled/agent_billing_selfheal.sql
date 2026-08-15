CREATE OR REPLACE FUNCTION public.agent_billing_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_null_paid integer:=0; v_discount_errors integer:=0;
  v_folio_gaps integer:=0; v_threshold integer:=10;
  v_pattern record; v_conf integer:=95;
BEGIN
  SELECT INTO v_pattern confidence,metadata FROM agent_pattern_memory
  WHERE agent_id='lumea-billing' AND pattern_key='null_paid_amount_on_checkout';
  v_threshold:=COALESCE((v_pattern.metadata->>'escalate_threshold')::integer,10);
  v_conf:=COALESCE(ROUND(v_pattern.confidence*100)::integer,95);

  UPDATE reservations SET paid_amount=0 WHERE paid_amount IS NULL AND status='CHECKED_OUT';
  GET DIAGNOSTICS v_null_paid=ROW_COUNT;
  UPDATE reservations SET discount=0 WHERE discount>total_amount AND total_amount>0;
  GET DIAGNOSTICS v_discount_errors=ROW_COUNT;
  UPDATE folios SET amount=0 WHERE amount IS NULL;
  GET DIAGNOSTICS v_folio_gaps=ROW_COUNT;
  UPDATE reservations SET paid_amount=(
    SELECT r2.total_amount+COALESCE(SUM(f.amount),0)-COALESCE(r2.discount,0)
    FROM reservations r2 LEFT JOIN folios f ON f.reservation_id=r2.id
    WHERE r2.id=reservations.id GROUP BY r2.total_amount,r2.discount)
  WHERE status='CHECKED_OUT' AND paid_amount>total_amount*2;
  UPDATE reservations SET source='DIRECT' WHERE source IS NULL;

  PERFORM agent_record_feedback('lumea-billing','null_paid_amount_on_checkout',
    format('null:%s discount:%s folio:%s',v_null_paid,v_discount_errors,v_folio_gaps),
    'multi_fix_sweep',
    CASE WHEN v_null_paid>=v_threshold THEN 'ESCALATED'
         WHEN (v_null_paid+v_discount_errors+v_folio_gaps)>0 THEN 'SUCCESS' ELSE 'SUCCESS' END,
    v_null_paid+v_discount_errors+v_folio_gaps);

  IF v_null_paid>=v_threshold THEN
    PERFORM agent_send('lumea-billing','lumea-reservations','ALERT',
      format('HIGH BILLING ANOMALY: %s NULL paid_amounts',v_null_paid),
      'Possible frontend checkout bug.',
      jsonb_build_object('null_paid',v_null_paid,'threshold',v_threshold),'HIGH');
  END IF;

  PERFORM agent_send('lumea-billing','lumea-ceo','REPORT',
    format('Billing v3: %s fixed (threshold:%s conf:%s%%)',
      v_null_paid+v_discount_errors+v_folio_gaps,v_threshold,v_conf),
    format('null_paid:%s bad_discount:%s folio_gaps:%s',v_null_paid,v_discount_errors,v_folio_gaps),
    jsonb_build_object('total_fixed',v_null_paid+v_discount_errors+v_folio_gaps,'threshold',v_threshold),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-billing','billing_v3',v_null_paid+v_discount_errors+v_folio_gaps,
    CASE WHEN v_null_paid>=v_threshold THEN 'WARN'
         WHEN (v_null_paid+v_discount_errors+v_folio_gaps)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: null=%s discount_err=%s folio=%s threshold=%s conf=%s%%',
      v_null_paid,v_discount_errors,v_folio_gaps,v_threshold,v_conf));
END;
$function$
