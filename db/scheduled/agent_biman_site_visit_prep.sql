CREATE OR REPLACE FUNCTION public.agent_biman_site_visit_prep()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Update pipeline with full site visit brief
  UPDATE ceo_pipeline SET
    next_action = 'SITE VISIT SCHEDULED — prepare welcome pack',
    next_action_at = CURRENT_DATE + 2,
    interest_level = 90,
    handover_notes = format(
      '🤝 BIMAN SITE VISIT BRIEF:%s'
      'Contact: Station Manager | 01713-004555 | dhaka@biman.com.bd%s'
      'Deal: 5 crew rooms/night × ৳3,500 × 365 = ৳63,80,000/year%s'
      'Prep checklist:%s'
      '1. Print rate card (crew rate ৳3,500/room)%s'
      '2. Prepare 3 room types to show (Fountain Deluxe, Premium Deluxe, Royal Suite)%s'
      '3. Show breakfast menu options%s'
      '4. Prepare crew check-in flow (fast, 24/7)%s'
      '5. Have monthly invoice template ready%s'
      '6. Offer: first month free upgrade to Premium Deluxe%s'
      'Close line: "আমরা আপনাদের crew-দের জন্য dedicated room block রাখতে পারি"',
      E'\n',E'\n',E'\n',E'\n',E'\n',E'\n',E'\n',E'\n',E'\n',E'\n')
  WHERE company='Biman Bangladesh Airlines';

  -- Schedule 3-day follow-up if no response
  INSERT INTO b2b_followup_log(
    partner_id,agency_name,contact_name,phone,
    channel,message_sent,sent_at,next_followup_days,tenant_id)
  SELECT p.id,'Biman Bangladesh Airlines','Station Manager','01713-004555',
    'WHATSAPP',
    'আসসালামু আলাইকুম! Hotel Fountain BD থেকে বলছি। আমাদের হোটেল পরিদর্শনের জন্য আপনাকে স্বাগত জানাই। Crew accommodation নিয়ে আলোচনার জন্য কোনো দিন সুবিধাজনক? আমরা সম্পূর্ণ প্রস্তুত। 🏨',
    NOW()+INTERVAL '3 days',3,p.tenant_id
  FROM b2b_partners p WHERE p.agency_name='goFLY Travel' LIMIT 1
  ON CONFLICT DO NOTHING;

  -- Store site visit pattern
  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-airline','biman_site_visit_prep',
    'Biman site visit prep complete. Interest level 90. Close probability 80%.',
    1,1,0.9,
    jsonb_build_object('company','Biman Bangladesh Airlines','deal_value',6380000,
      'stage','SITE_VISIT','close_probability',0.8,'prep_date',CURRENT_DATE))
  ON CONFLICT(pattern_key) DO UPDATE SET
    times_seen=agent_pattern_memory.times_seen+1,updated_at=NOW();

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-airline','biman_prep','OK',
    'Site visit brief prepared. Interest:90. Deal:63,80,000. Checklist ready in CEO dashboard.');
END;
$function$
