CREATE OR REPLACE FUNCTION public.fn_invoke_lighthouse_summary()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/lighthouse-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', current_setting('app.lighthouse_token', true)  -- SECURITY 2026-08-15: a live bearer token was hardcoded here; redacted. Set via ALTER DATABASE ... SET app.lighthouse_token, or move this call into an edge function.
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  INTO request_id;
  RETURN request_id;
END;
$function$
