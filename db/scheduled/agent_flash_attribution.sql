CREATE OR REPLACE FUNCTION public.agent_flash_attribution()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update flash_sale_log f
  set targets_sent = 1,
      bookings_from_flash = coalesce(a.bookings, 0),
      revenue_generated   = coalesce(a.revenue, 0)
  from (
    select f2.id,
           (select count(*) from reservations r
             where r.created_at >= f2.created_at
               and r.created_at::date = f2.trigger_date
               and r.check_in::date  = f2.trigger_date
               and lower(coalesce(r.status,'')) not in ('cancelled','no_show')) bookings,
           (select coalesce(sum(r.total_amount),0) from reservations r
             where r.created_at >= f2.created_at
               and r.created_at::date = f2.trigger_date
               and r.check_in::date  = f2.trigger_date
               and lower(coalesce(r.status,'')) not in ('cancelled','no_show')) revenue
    from flash_sale_log f2
    where exists (select 1 from social_content_queue q
                   where q.content_type = 'FLASH_SALE'
                     and q.scheduled_for = f2.trigger_date
                     and q.posted = true)
  ) a
  where a.id = f.id
    and (f.targets_sent is distinct from 1
      or f.bookings_from_flash is distinct from coalesce(a.bookings,0)
      or f.revenue_generated   is distinct from coalesce(a.revenue,0));

  insert into agent_run_log(agent_id, action, status, details)
  values ('lumea-flash', 'attribution_sweep', 'OK',
          format('attributed rows for posted flash sales as of %s', now()::date));
end;
$function$
