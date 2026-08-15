CREATE OR REPLACE FUNCTION public.agent_corporate_leads_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, analyst_brief, tenant_id, created_at, updated_at)
  SELECT v.* FROM (VALUES
    (gen_random_uuid(), 'HR Manager', 'hr@dsebd.org', '02-9564601',
     'Dhaka Stock Exchange (DSE)', 'CORPORATE', 'NEW',
     'DSE Tower in Nikunja — visiting brokers, investors, foreign delegates need hotel.',
     'Pitch: preferred hotel for DSE visitors. 5 min from DSE Tower.',
     fountain_tenant_id(), NOW(), NOW()),

    (gen_random_uuid(), 'Corporate Travel Desk', 'admin@grameenphone.com', '01711-380380',
     'Grameenphone Ltd', 'CORPORATE', 'NEW',
     'Major telecom — staff travel for Dhaka meetings, training, airport transits.',
     'Pitch: corporate room block. Monthly billing. Near airport.',
     fountain_tenant_id(), NOW(), NOW()),

    (gen_random_uuid(), 'Admin & Procurement', 'info@banglalink.net', '01911-304121',
     'Banglalink Digital Communications', 'CORPORATE', 'NEW',
     'Telecom company — field engineers, management travel through Dhaka.',
     'Pitch: corporate rate ৳3,500/night. Monthly invoicing available.',
     fountain_tenant_id(), NOW(), NOW()),

    (gen_random_uuid(), 'Travel Coordinator', 'corporate@beximco.com', '02-9886030',
     'Beximco Group', 'CORPORATE', 'NEW',
     'Large conglomerate — pharma, garments, media. Corporate guests visiting Dhaka.',
     'Pitch: executive rooms for visiting partners. Royal Suite for VIPs.',
     fountain_tenant_id(), NOW(), NOW()),

    (gen_random_uuid(), 'HR & Admin', 'hr@squarepharma.com.bd', '02-8833047',
     'Square Pharmaceuticals', 'CORPORATE', 'NEW',
     'Top pharma company — medical reps, executives traveling to/from Dhaka.',
     'Pitch: corporate account, 5-10 rooms/month for field staff.',
     fountain_tenant_id(), NOW(), NOW())
  ) AS v(id, name, email, phone, company, source, status, notes, analyst_brief, tenant_id, created_at, updated_at)
  WHERE NOT EXISTS (
    SELECT 1 FROM leads l WHERE l.phone = v.phone AND l.source = v.source
  );
  GET DIAGNOSTICS v_new = ROW_COUNT;

  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-corporate-leads', 'corporate_lead_gen', v_new,
    CASE WHEN v_new > 0 THEN 'FIXED' ELSE 'OK' END,
    format('Generated %s corporate leads', v_new));
END;
$function$
