-- 2026-06-12  Fix P3 `column "total_amount" does not exist` from the OTA channel report.
-- The view aggregated total_amount into avg_booking_value, so any caller (a manual SQL
-- query or external BI/Sheets connector — no app code references this view) asking for
-- `total_amount` errored. Add it as a trailing column = total booked value per channel.
-- Additive + reversible; preserves security_invoker=true so tenant RLS isolation is unchanged.
CREATE OR REPLACE VIEW public.ota_channel_performance
WITH (security_invoker = true) AS
SELECT source AS channel,
       count(*) AS bookings,
       sum(paid_amount) AS gross_revenue,
       round(avg(total_amount), 0) AS avg_booking_value,
       round(count(*)::numeric / sum(count(*)) OVER () * 100::numeric, 1) AS pct_of_total,
       sum(CASE WHEN check_in >= (now() - '30 days'::interval) THEN 1 ELSE 0 END) AS last_30_days,
       tenant_id,
       round(sum(total_amount), 0) AS total_amount
FROM reservations
GROUP BY source, tenant_id
ORDER BY (count(*)) DESC;
