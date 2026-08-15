CREATE OR REPLACE FUNCTION public.fn_channel_reconcile()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid;
  v_today  date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
  DELETE FROM inventory_ledger
  WHERE tenant_id = v_tenant AND stay_date < v_today;

  PERFORM fn_ledger_recount(
    v_tenant,
    (SELECT array_agg(DISTINCT category) FROM rooms WHERE tenant_id = v_tenant),
    v_today, v_today + 365);

  INSERT INTO sync_queue (tenant_id, direction, event_type, payload)
  SELECT v_tenant, 'outbound', 'overbook_alert',
         jsonb_build_object('category', il.category, 'stay_date', il.stay_date,
                            'total', il.total_units, 'booked', il.booked_units)
  FROM inventory_ledger il
  WHERE il.tenant_id = v_tenant
    AND il.booked_units > il.total_units
    AND il.stay_date >= v_today
    AND NOT EXISTS (
      SELECT 1 FROM sync_queue q
      WHERE q.event_type = 'overbook_alert'
        AND q.status IN ('pending','processing','failed')
        AND q.payload->>'category'  = il.category
        AND q.payload->>'stay_date' = il.stay_date::text
    );
END;
$function$
