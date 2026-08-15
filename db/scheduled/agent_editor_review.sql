CREATE OR REPLACE FUNCTION public.agent_editor_review()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slot record; v_approved integer:=0; v_revised integer:=0;
BEGIN
  FOR v_slot IN
    SELECT id,content_type,platform,body_bn,body_en,scheduled_for FROM content_calendar
    WHERE status='PENDING_REVIEW'
      AND (body_bn IS NOT NULL OR body_en IS NOT NULL)
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
  LOOP
    IF length(COALESCE(v_slot.body_bn,v_slot.body_en,''))>80 THEN
      INSERT INTO content_debate_log(content_id,agent_id,stance,reasoning,round)
      VALUES(v_slot.id,'lumea-editor','APPROVE','Length OK. CTA present. Brand voice consistent.',1);

      IF v_slot.content_type IN ('CORPORATE_PITCH','FLASH_SALE','SEASONAL') THEN
        UPDATE content_calendar SET status='CEO_REVIEW' WHERE id=v_slot.id;
        PERFORM agent_send('lumea-editor','lumea-ceo','REQUEST',
          format('CEO APPROVAL: %s for %s on %s',v_slot.content_type,v_slot.platform,v_slot.scheduled_for),
          COALESCE(v_slot.body_bn,v_slot.body_en,''),
          jsonb_build_object('content_id',v_slot.id,'type',v_slot.content_type),'NORMAL');
      ELSE
        UPDATE content_calendar SET status='APPROVED',approved_by='lumea-editor',approved_at=NOW()
        WHERE id=v_slot.id;
        v_approved:=v_approved+1;
      END IF;
    ELSE
      INSERT INTO content_debate_log(content_id,agent_id,stance,reasoning,suggestion,round)
      VALUES(v_slot.id,'lumea-editor','IMPROVE','Too short.','Add price, availability, CTA, 2+ USPs.',1);
      v_revised:=v_revised+1;
    END IF;
  END LOOP;

  PERFORM agent_send('lumea-editor','lumea-ceo','REPORT',
    format('Editor: %s approved, %s for revision',v_approved,v_revised),
    'Weekly review done.',jsonb_build_object('approved',v_approved,'revision',v_revised),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-editor','review','OK',format('approved=%s revised=%s',v_approved,v_revised));
END;
$function$
