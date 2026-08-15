CREATE OR REPLACE FUNCTION public.agent_ngo_leads_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, analyst_brief, tenant_id, created_at, updated_at)
  VALUES
    (gen_random_uuid(), 'Admin & Logistics', 'dhaka@undp.org', '02-9853606',
     'UNDP Bangladesh', 'NGO_CORPORATE', 'NEW',
     'UN office near Gulshan/Nikunja. International staff need transit accommodation.',
     'Pitch: staff layovers, visiting consultants, monthly block booking. USD billing.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Country Director Office', 'dhaka@savethechildren.org', '02-9884983',
     'Save the Children Bangladesh', 'NGO_CORPORATE', 'NEW',
     'Major INGO with Dhaka HQ. Field staff transit stays, international visitors.',
     'Pitch: monthly corporate account. 3-5 rooms/month for field staff.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Admin Manager', 'info@brac.net', '02-9881265',
     'BRAC International', 'NGO_CORPORATE', 'NEW',
     'Largest NGO in world — HQ Dhaka. Thousands of staff travel through DAC.',
     'Pitch: preferred hotel partner. High volume, monthly invoicing.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Dhaka Office Admin', 'dhaka@worldbank.org', '02-5566-7777',
     'World Bank Dhaka Office', 'NGO_CORPORATE', 'NEW',
     'World Bank BD office near Agargaon. International consultants need near-airport stays.',
     'Pitch: consultant accommodation. USD rates. Monthly account.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Logistics Coordinator', 'dhaka@iom.int', '02-9898101',
     'IOM Bangladesh (UN Migration)', 'NGO_CORPORATE', 'NEW',
     'IOM manages refugee/migrant transit — airport proximity critical.',
     'Pitch: transit housing for beneficiaries + staff. High volume potential.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;

  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-ngo', 'ngo_lead_gen', v_new,
    CASE WHEN v_new > 0 THEN 'FIXED' ELSE 'OK' END,
    format('Generated %s NGO/corporate leads', v_new));
END;
$function$
