CREATE OR REPLACE FUNCTION public.ceo_process_inbox()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE msg record;
DECLARE v_decision text;
DECLARE v_notes text;
BEGIN
  FOR msg IN
    SELECT * FROM agent_messages
    WHERE to_agent = 'lumea-ceo' AND status = 'PENDING'
    ORDER BY
      CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,
      created_at ASC
    LIMIT 50
  LOOP
    v_decision := CASE
      -- REPORTS always auto-approved (never escalated)
      WHEN msg.message_type = 'REPORT' THEN 'APPROVE'
      -- ALERTS from operational agents auto-approved
      WHEN msg.message_type = 'ALERT'
        AND msg.from_agent IN ('lumea-billing','lumea-rooms',
          'lumea-housekeeping','lumea-reservations',
          'lumea-guests','lumea-audit') THEN 'APPROVE'
      -- Low-value requests auto-approved
      WHEN msg.message_type = 'REQUEST'
        AND (msg.data->>'deal_value')::numeric < 500000 THEN 'APPROVE'
      -- High-value contracts → ESCALATE to Shan
      WHEN msg.message_type = 'DECISION'
        AND (msg.data->>'deal_value')::numeric >= 5000000 THEN 'ESCALATE'
      -- Handover decisions → ESCALATE
      WHEN msg.message_type = 'DECISION'
        AND msg.subject ILIKE '%handover%' THEN 'ESCALATE'
      -- Medium requests → APPROVE
      ELSE 'APPROVE'
    END;

    v_notes := CASE v_decision
      WHEN 'APPROVE'  THEN 'CEO: Auto-approved.'
      WHEN 'ESCALATE' THEN 'CEO: High value — escalating to Shan.'
      ELSE 'CEO: Approved.'
    END;

    UPDATE agent_messages SET
      status       = CASE v_decision WHEN 'ESCALATE' THEN 'ACTIONED' ELSE 'APPROVED' END,
      ceo_decision = v_decision,
      ceo_notes    = v_notes,
      actioned_at  = NOW()
    WHERE id = msg.id;

    -- Pipeline escalation
    IF v_decision = 'ESCALATE' THEN
      UPDATE ceo_pipeline SET
        handover_ready = true,
        handover_notes = format('CEO ESCALATION: %s — ৳%s — Contact: %s',
          msg.subject, msg.data->>'deal_value', contact_phone)
      WHERE company = (msg.data->>'company') AND handover_ready = false;
    END IF;
  END LOOP;

  INSERT INTO agent_run_log(agent_id, action, status, details)
  VALUES('lumea-ceo', 'inbox_processed', 'OK',
    format('CEO processed inbox at %s', NOW()));
END;
$function$
