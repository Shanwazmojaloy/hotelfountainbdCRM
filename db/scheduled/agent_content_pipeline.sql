CREATE OR REPLACE FUNCTION public.agent_content_pipeline()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Step 1: Strategist plans week
  PERFORM agent_content_strategist();
  -- Step 2: Copywriters fill content
  PERFORM agent_copywriter_bn();
  PERFORM agent_copywriter_en();
  -- Step 3: Visual briefs
  PERFORM agent_visual_brief();
  -- Step 4: Editor approves
  PERFORM agent_editor_review();
  PERFORM ceo_approve_content();
  -- Step 5: Generate 6 variations for every approved slot
  PERFORM agent_generate_all_variations();
  -- Step 6: Email all variations to Shan
  PERFORM trigger_content_approval_email();

  RETURN format('Pipeline complete. Variations emailed to Shan at %s',NOW());
END;
$function$
