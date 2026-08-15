CREATE OR REPLACE FUNCTION public.ceo_approve_content()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE content_calendar SET status='APPROVED',approved_by='lumea-ceo',approved_at=NOW()
  WHERE status='CEO_REVIEW';
  UPDATE agent_messages SET status='APPROVED',ceo_decision='APPROVE',ceo_notes='CEO: Approved.'
  WHERE to_agent='lumea-ceo' AND message_type='REQUEST'
    AND subject ILIKE '%CEO APPROVAL%' AND status='PENDING';
END;
$function$
