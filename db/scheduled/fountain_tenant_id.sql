CREATE OR REPLACE FUNCTION public.fountain_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM tenants WHERE slug = 'hotelfountainbd';
  IF v IS NULL THEN
    RAISE EXCEPTION 'fountain_tenant_id: no tenant with slug hotelfountainbd - refusing to write a NULL tenant_id';
  END IF;
  RETURN v;
END
$function$
