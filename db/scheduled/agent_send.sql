CREATE OR REPLACE FUNCTION public.agent_send(p_from text, p_to text, p_type text, p_subject text, p_body text, p_data jsonb DEFAULT '{}'::jsonb, p_priority text DEFAULT 'NORMAL'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO agent_messages(from_agent, to_agent, message_type, subject, body, data, priority, tenant_id)
  SELECT p_from, p_to, p_type, p_subject, p_body, p_data, p_priority,
    fountain_tenant_id()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$
