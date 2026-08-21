CREATE OR REPLACE FUNCTION public.fn_invoke_lighthouse_summary()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  request_id bigint;
BEGIN
  -- SECURITY 2026-08-15: Bearer token moved to database setting (app.lighthouse_token).
  -- This prevents credentials from sitting in pg_proc source code, readable by anyone
  -- with catalog access. Token is rotated by updating the setting:
  --   ALTER DATABASE <name> SET app.lighthouse_token TO '<new_bearer_token>';
  -- Then reload the session or create a new connection for the setting to take effect.
  SELECT net.http_post(
    url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/lighthouse-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', current_setting('app.lighthouse_token', true)  -- Must be set via ALTER DATABASE or SET command
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  INTO request_id;
  RETURN request_id;
END;
$function$
