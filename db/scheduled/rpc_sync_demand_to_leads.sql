CREATE OR REPLACE FUNCTION public.rpc_sync_demand_to_leads()
 RETURNS TABLE(tenant_id uuid, soft boolean, flagged integer, reverted integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH soft_t AS (
    SELECT d.tenant_id,
           bool_or(
             d.demand_tier = 'LOW'
             AND d.stay_date <= current_date + (COALESCE(th.horizon_days,14) || ' days')::interval
           ) AS is_soft
    FROM public.vw_daily_demand_plan d
    LEFT JOIN public.fountain_demand_thresholds th ON th.tenant_id = d.tenant_id
    GROUP BY d.tenant_id
  ),
  flag AS (
    UPDATE public.corporate_leads cl
       SET priority='high', demand_flagged=true, updated_at=now()
      FROM soft_t s
     WHERE cl.tenant_id = s.tenant_id AND s.is_soft
       AND cl.status='pending'
       AND COALESCE(cl.demand_flagged,false)=false
       AND cl.priority IS DISTINCT FROM 'high'
    RETURNING cl.tenant_id
  ),
  revert AS (
    UPDATE public.corporate_leads cl
       SET priority='med', demand_flagged=false, updated_at=now()
      FROM soft_t s
     WHERE cl.tenant_id = s.tenant_id AND s.is_soft = false
       AND COALESCE(cl.demand_flagged,false)=true
    RETURNING cl.tenant_id
  )
  SELECT s.tenant_id, s.is_soft,
         (SELECT count(*) FROM flag   f WHERE f.tenant_id = s.tenant_id)::int,
         (SELECT count(*) FROM revert r WHERE r.tenant_id = s.tenant_id)::int
  FROM soft_t s;
END$function$
