CREATE OR REPLACE FUNCTION public.agent_airline_leads_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, analyst_brief, tenant_id, created_at, updated_at)
  VALUES
    (gen_random_uuid(), 'Station Manager', 'dhaka@biman.com.bd', '01713-004555',
     'Biman Bangladesh Airlines', 'AIRLINE_CREW', 'NEW',
     'National carrier — crew layovers at DAC. 10 min from Nikunja. High volume nightly crew rooms needed.',
     'Pitch: block 5 rooms nightly at ৳3,500/room for crew. Annual contract = ৳63.8L+',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Station Manager', 'dhaka@us-bangla.com', '09610-010101',
     'US-Bangla Airlines', 'AIRLINE_CREW', 'NEW',
     'Largest private airline in BD — domestic + international. Crew based at DAC.',
     'Pitch: 3-5 crew rooms/night. Contract rate ৳3,200/room. Airport 10 min away.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Station Manager', 'dhaka@novoair.com', '16534',
     'Novoair', 'AIRLINE_CREW', 'NEW',
     'Domestic carrier with DAC hub. Crew accommodation needed near airport.',
     'Pitch: crew rest rooms between flights. Budget tier fits our pricing.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Dhaka Country Manager', 'dhaka@airarabia.com', '+971-600-544-7444',
     'Air Arabia Bangladesh', 'AIRLINE_CREW', 'NEW',
     'International LCC with Dhaka routes. Crew layovers at DAC. Premium paying.',
     'Pitch: international crew standard rooms. Royal Suite for pilots. Contract in USD.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Ground Handling Manager', 'dhaka@flygroupbd.com', '01730-333444',
     'Fly Dubai Dhaka Office', 'AIRLINE_CREW', 'NEW',
     'Dubai-Dhaka route crew layovers. International crew paying USD rates.',
     'Pitch: 2-4 rooms/layover. USD billing. 10 min from airport.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;

  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-airline', 'airline_lead_gen', v_new,
    CASE WHEN v_new > 0 THEN 'FIXED' ELSE 'OK' END,
    format('Generated %s airline crew leads', v_new));
END;
$function$
