-- =============================================================
-- LUMEA CRM — DEMO SEED SCRIPT v1.0
-- Purpose : Populate a fresh Supabase project with realistic
--           demo data for sales demos / prospect trials.
-- Hotel   : Grand Palace Hotel (fictional)
-- Run on  : Any new Supabase project OR the staging branch
-- Safe    : 100% idempotent — ON CONFLICT DO NOTHING throughout
-- Reset   : Run demo-reset.sql first to wipe and re-seed
-- =============================================================

DO $$
DECLARE
  -- Fixed UUIDs — reproducible across runs
  T   UUID := 'd3m0cafe-feed-4000-a000-000000000001'; -- tenant

  -- Rooms (Floor 2 = Standard, Floor 3 = Deluxe, Floor 4 = Superior, Floor 5 = Suite)
  R201 UUID := 'd3m0cafe-feed-4000-b000-000000000201';
  R202 UUID := 'd3m0cafe-feed-4000-b000-000000000202';
  R203 UUID := 'd3m0cafe-feed-4000-b000-000000000203';
  R204 UUID := 'd3m0cafe-feed-4000-b000-000000000204';
  R205 UUID := 'd3m0cafe-feed-4000-b000-000000000205';
  R301 UUID := 'd3m0cafe-feed-4000-b000-000000000301';
  R302 UUID := 'd3m0cafe-feed-4000-b000-000000000302';
  R303 UUID := 'd3m0cafe-feed-4000-b000-000000000303';
  R304 UUID := 'd3m0cafe-feed-4000-b000-000000000304';
  R305 UUID := 'd3m0cafe-feed-4000-b000-000000000305';
  R401 UUID := 'd3m0cafe-feed-4000-b000-000000000401';
  R402 UUID := 'd3m0cafe-feed-4000-b000-000000000402';
  R403 UUID := 'd3m0cafe-feed-4000-b000-000000000403';
  R404 UUID := 'd3m0cafe-feed-4000-b000-000000000404';
  R405 UUID := 'd3m0cafe-feed-4000-b000-000000000405';
  R501 UUID := 'd3m0cafe-feed-4000-b000-000000000501';
  R502 UUID := 'd3m0cafe-feed-4000-b000-000000000502';
  R503 UUID := 'd3m0cafe-feed-4000-b000-000000000503';
  R504 UUID := 'd3m0cafe-feed-4000-b000-000000000504';
  R505 UUID := 'd3m0cafe-feed-4000-b000-000000000505';

  -- Guests
  GU1 UUID := 'd3m0cafe-feed-4000-c000-000000000001';
  GU2 UUID := 'd3m0cafe-feed-4000-c000-000000000002';
  GU3 UUID := 'd3m0cafe-feed-4000-c000-000000000003';
  GU4 UUID := 'd3m0cafe-feed-4000-c000-000000000004';
  GU5 UUID := 'd3m0cafe-feed-4000-c000-000000000005';
  GU6 UUID := 'd3m0cafe-feed-4000-c000-000000000006';
  GU7 UUID := 'd3m0cafe-feed-4000-c000-000000000007';
  GU8 UUID := 'd3m0cafe-feed-4000-c000-000000000008';
  GU9 UUID := 'd3m0cafe-feed-4000-c000-000000000009';
  GU10 UUID := 'd3m0cafe-feed-4000-c000-000000000010';

  -- Reservations
  RES1  UUID := 'd3m0cafe-feed-4000-d000-000000000001';
  RES2  UUID := 'd3m0cafe-feed-4000-d000-000000000002';
  RES3  UUID := 'd3m0cafe-feed-4000-d000-000000000003';
  RES4  UUID := 'd3m0cafe-feed-4000-d000-000000000004';
  RES5  UUID := 'd3m0cafe-feed-4000-d000-000000000005';
  RES6  UUID := 'd3m0cafe-feed-4000-d000-000000000006';
  RES7  UUID := 'd3m0cafe-feed-4000-d000-000000000007';
  RES8  UUID := 'd3m0cafe-feed-4000-d000-000000000008';
  RES9  UUID := 'd3m0cafe-feed-4000-d000-000000000009';
  RES10 UUID := 'd3m0cafe-feed-4000-d000-000000000010';
  RES11 UUID := 'd3m0cafe-feed-4000-d000-000000000011';
  RES12 UUID := 'd3m0cafe-feed-4000-d000-000000000012';
  RES13 UUID := 'd3m0cafe-feed-4000-d000-000000000013';
  RES14 UUID := 'd3m0cafe-feed-4000-d000-000000000014';

  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD');

BEGIN

-- ============================================================
-- 1. TENANT
-- ============================================================
INSERT INTO tenants (id, hotel_name, hotel_slug, primary_color, country, currency, timezone, is_white_label, onboarding_complete)
VALUES (T, 'Grand Palace Hotel', 'grand-palace', '#8B5E3C', 'BD', 'BDT', 'Asia/Dhaka', true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. DEMO LOGIN PROFILE
-- Owner: demo@lumea.io  PIN: 1234
-- Manager: front@lumea.io  PIN: 5678
-- ============================================================
INSERT INTO profiles (id, name, email, role, pin, password)
VALUES
  ('d3m0cafe-feed-4000-e000-000000000001', 'Demo Owner',   'demo@lumea.io',  'owner',   '1234', 'demo_password_hash'),
  ('d3m0cafe-feed-4000-e000-000000000002', 'Front Desk',   'front@lumea.io', 'manager', '5678', 'demo_password_hash')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. ROOMS — 20 rooms across 4 floors
-- ============================================================
INSERT INTO rooms (id, room_number, category, price, status, floor, beds, view, tenant_id)
VALUES
  -- Floor 2: Standard (৳3,500/night)
  (R201,'201','Standard', 3500,'OCCUPIED',   2,'Double','City', T),
  (R202,'202','Standard', 3500,'AVAILABLE',  2,'Twin',  'City', T),
  (R203,'203','Standard', 3500,'OCCUPIED',   2,'Double','Pool', T),
  (R204,'204','Standard', 3500,'MAINTENANCE',2,'Double','City', T),
  (R205,'205','Standard', 3500,'AVAILABLE',  2,'Twin',  'City', T),
  -- Floor 3: Deluxe (৳5,500/night)
  (R301,'301','Deluxe',   5500,'OCCUPIED',   3,'Double','City', T),
  (R302,'302','Deluxe',   5500,'OCCUPIED',   3,'King',  'Pool', T),
  (R303,'303','Deluxe',   5500,'RESERVED',   3,'Double','City', T),
  (R304,'304','Deluxe',   5500,'AVAILABLE',  3,'Twin',  'City', T),
  (R305,'305','Deluxe',   5500,'OCCUPIED',   3,'King',  'Pool', T),
  -- Floor 4: Superior Deluxe (৳7,500/night)
  (R401,'401','Superior Deluxe',7500,'OCCUPIED',  4,'King',  'Pool', T),
  (R402,'402','Superior Deluxe',7500,'OCCUPIED',  4,'Double','City', T),
  (R403,'403','Superior Deluxe',7500,'AVAILABLE', 4,'King',  'Pool', T),
  (R404,'404','Superior Deluxe',7500,'RESERVED',  4,'Double','City', T),
  (R405,'405','Superior Deluxe',7500,'MAINTENANCE',4,'King', 'Pool', T),
  -- Floor 5: Royal Suite (৳14,000/night)
  (R501,'501','Royal Suite',14000,'OCCUPIED',  5,'King',  'Panoramic', T),
  (R502,'502','Royal Suite',14000,'AVAILABLE', 5,'King',  'Panoramic', T),
  (R503,'503','Royal Suite',14000,'OCCUPIED',  5,'King',  'Panoramic', T),
  (R504,'504','Royal Suite',14000,'AVAILABLE', 5,'King',  'Panoramic', T),
  (R505,'505','Royal Suite',14000,'OCCUPIED',  5,'King',  'Panoramic', T)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. GUESTS
-- ============================================================
INSERT INTO guests (id, name, phone, email, nationality, vip, total_stays, total_spent, tenant_id)
VALUES
  (GU1,  'Arif Hossain',       '+8801711000001', 'arif.h@gmail.com',        'Bangladeshi', false, 3,  31500, T),
  (GU2,  'Sadia Rahman',       '+8801812000002', 'sadia.r@yahoo.com',       'Bangladeshi', false, 1,  11000, T),
  (GU3,  'Tanvir Ahmed',       '+8801913000003', 'tanvir.a@outlook.com',    'Bangladeshi', false, 7,  87500, T),
  (GU4,  'Nadia Islam',        '+8801614000004', 'nadia.i@hotmail.com',     'Bangladeshi', true,  12, 168000,T),
  (GU5,  'James McKinley',     '+447911234567',  'james.m@corporate.co.uk', 'British',     true,  4,  56000, T),
  (GU6,  'Fatema Begum',       '+8801715000006', 'fatema.b@gmail.com',      'Bangladeshi', false, 2,  21000, T),
  (GU7,  'Rajib Kumar Das',    '+8801816000007', 'rajib.d@gmail.com',       'Bangladeshi', false, 5,  52500, T),
  (GU8,  'Priya Sharma',       '+8801617000008', 'priya.s@gmail.com',       'Indian',      false, 1,  14000, T),
  (GU9,  'Mohammad Karim',     '+8801718000009', 'mkarim@robi.com.bd',      'Bangladeshi', true,  9,  126000,T),
  (GU10, 'Chen Wei',           '+8613800138000', 'chen.w@cnco.com',         'Chinese',     true,  2,  28000, T)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. RESERVATIONS
-- Mix: 9 active CHECK_IN, 3 CHECKED_OUT (history), 2 RESERVED (upcoming)
-- ============================================================
INSERT INTO reservations (
  id, room_ids, guest_ids, check_in, check_out, status,
  total_amount, paid_amount, discount_amount, payment_method,
  guest_name, phone, room_type, guests, source, tenant_id
)
VALUES
  -- Active check-ins (checked in 1–4 days ago)
  (RES1,  ARRAY[R201::text], ARRAY[GU1::text], NOW()-INTERVAL'2 days', NOW()+INTERVAL'1 day',  'CHECK_IN', 10500, 10500, 0,    'Cash',   'Arif Hossain',    '+8801711000001', 'Standard',       2, 'Walk-in',    T),
  (RES2,  ARRAY[R203::text], ARRAY[GU2::text], NOW()-INTERVAL'1 day',  NOW()+INTERVAL'2 days', 'CHECK_IN', 11000, 5500,  0,    'bKash',  'Sadia Rahman',    '+8801812000002', 'Standard',       1, 'Phone',      T),
  (RES3,  ARRAY[R301::text], ARRAY[GU3::text], NOW()-INTERVAL'3 days', NOW()+INTERVAL'1 day',  'CHECK_IN', 22000, 22000, 0,    'Cash',   'Tanvir Ahmed',    '+8801913000003', 'Deluxe',         2, 'Booking.com',T),
  (RES4,  ARRAY[R302::text], ARRAY[GU4::text], NOW()-INTERVAL'2 days', NOW()+INTERVAL'3 days', 'CHECK_IN', 27500, 27500, 2500, 'Card',   'Nadia Islam',     '+8801614000004', 'Deluxe',         2, 'Direct',     T),
  (RES5,  ARRAY[R305::text], ARRAY[GU5::text], NOW()-INTERVAL'1 day',  NOW()+INTERVAL'4 days', 'CHECK_IN', 27500, 14000, 0,    'Card',   'James McKinley',  '+447911234567',  'Deluxe',         1, 'Expedia',    T),
  (RES6,  ARRAY[R401::text], ARRAY[GU6::text], NOW()-INTERVAL'4 days', NOW()+INTERVAL'1 day',  'CHECK_IN', 37500, 37500, 0,    'Cash',   'Fatema Begum',    '+8801715000006', 'Superior Deluxe',2, 'Walk-in',    T),
  (RES7,  ARRAY[R402::text], ARRAY[GU7::text], NOW()-INTERVAL'2 days', NOW()+INTERVAL'2 days', 'CHECK_IN', 30000, 15000, 0,    'bKash',  'Rajib Kumar Das', '+8801816000007', 'Superior Deluxe',1, 'Phone',      T),
  (RES8,  ARRAY[R501::text], ARRAY[GU9::text], NOW()-INTERVAL'3 days', NOW()+INTERVAL'2 days', 'CHECK_IN', 70000, 70000, 7000, 'Card',   'Mohammad Karim',  '+8801718000009', 'Royal Suite',    2, 'Corporate',  T),
  (RES9,  ARRAY[R503::text], ARRAY[GU10::text],NOW()-INTERVAL'1 day',  NOW()+INTERVAL'6 days', 'CHECK_IN', 98000, 50000, 0,    'Card',   'Chen Wei',        '+8613800138000', 'Royal Suite',    2, 'Corporate',  T),
  -- Checked out (history — last 7 days)
  (RES10, ARRAY[R202::text], ARRAY[GU1::text], NOW()-INTERVAL'8 days', NOW()-INTERVAL'5 days', 'CHECKED_OUT',10500,10500, 0,   'Cash',   'Arif Hossain',    '+8801711000001', 'Standard',       2, 'Walk-in',    T),
  (RES11, ARRAY[R304::text], ARRAY[GU8::text], NOW()-INTERVAL'6 days', NOW()-INTERVAL'3 days', 'CHECKED_OUT',16500,16500, 0,   'bKash',  'Priya Sharma',    '+8801617000008', 'Deluxe',         1, 'Agoda',      T),
  (RES12, ARRAY[R504::text], ARRAY[GU4::text], NOW()-INTERVAL'10 days',NOW()-INTERVAL'7 days', 'CHECKED_OUT',42000,42000, 0,   'Card',   'Nadia Islam',     '+8801614000004', 'Royal Suite',    2, 'Direct',     T),
  -- Upcoming / reserved
  (RES13, ARRAY[R303::text], ARRAY[GU3::text], NOW()+INTERVAL'1 day',  NOW()+INTERVAL'4 days', 'RESERVED', 16500, 5000,  0,   'bKash',  'Tanvir Ahmed',    '+8801913000003', 'Deluxe',         2, 'Phone',      T),
  (RES14, ARRAY[R404::text], ARRAY[GU5::text], NOW()+INTERVAL'2 days', NOW()+INTERVAL'7 days', 'RESERVED', 37500, 0,     0,   'Card',   'James McKinley',  '+447911234567',  'Superior Deluxe',1, 'Expedia',    T)
ON CONFLICT (id) DO NOTHING;

-- Update rooms with current guest info for occupied rooms
UPDATE rooms SET
  guest_name = 'Arif Hossain',
  check_in   = NOW()-INTERVAL'2 days',
  check_out  = NOW()+INTERVAL'1 day'
WHERE id = R201 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Sadia Rahman',
  check_in   = NOW()-INTERVAL'1 day',
  check_out  = NOW()+INTERVAL'2 days'
WHERE id = R203 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Tanvir Ahmed',
  check_in   = NOW()-INTERVAL'3 days',
  check_out  = NOW()+INTERVAL'1 day'
WHERE id = R301 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Nadia Islam',
  check_in   = NOW()-INTERVAL'2 days',
  check_out  = NOW()+INTERVAL'3 days'
WHERE id = R302 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'James McKinley',
  check_in   = NOW()-INTERVAL'1 day',
  check_out  = NOW()+INTERVAL'4 days'
WHERE id = R305 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Fatema Begum',
  check_in   = NOW()-INTERVAL'4 days',
  check_out  = NOW()+INTERVAL'1 day'
WHERE id = R401 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Rajib Kumar Das',
  check_in   = NOW()-INTERVAL'2 days',
  check_out  = NOW()+INTERVAL'2 days'
WHERE id = R402 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Mohammad Karim',
  check_in   = NOW()-INTERVAL'3 days',
  check_out  = NOW()+INTERVAL'2 days'
WHERE id = R501 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Chen Wei',
  check_in   = NOW()-INTERVAL'1 day',
  check_out  = NOW()+INTERVAL'6 days'
WHERE id = R503 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'Tanvir Ahmed (arriving tomorrow)',
  check_in   = NOW()+INTERVAL'1 day',
  check_out  = NOW()+INTERVAL'4 days'
WHERE id = R303 AND tenant_id = T;

UPDATE rooms SET
  guest_name = 'James McKinley (arriving in 2 days)',
  check_in   = NOW()+INTERVAL'2 days',
  check_out  = NOW()+INTERVAL'7 days'
WHERE id = R404 AND tenant_id = T;

-- ============================================================
-- 6. TRANSACTIONS
-- ============================================================
INSERT INTO transactions (id, reservation_id, room_number, guest_name, type, amount, tenant_id, fiscal_day, bill_total)
VALUES
  -- RES1: Arif - full cash payment on check-in
  ('d3m0cafe-feed-4000-f000-000000000001', RES1,  '201','Arif Hossain',   'Cash',      10500, T, today_str, 10500),
  -- RES2: Sadia - partial bKash
  ('d3m0cafe-feed-4000-f000-000000000002', RES2,  '203','Sadia Rahman',   'bKash',     5500,  T, today_str, 11000),
  -- RES3: Tanvir - full cash
  ('d3m0cafe-feed-4000-f000-000000000003', RES3,  '301','Tanvir Ahmed',   'Cash',      22000, T, today_str, 22000),
  -- RES4: Nadia - card + discount
  ('d3m0cafe-feed-4000-f000-000000000004', RES4,  '302','Nadia Islam',    'Card',      27500, T, today_str, 30000),
  -- RES5: James - partial card
  ('d3m0cafe-feed-4000-f000-000000000005', RES5,  '305','James McKinley', 'Card',      14000, T, today_str, 27500),
  -- RES6: Fatema - full cash
  ('d3m0cafe-feed-4000-f000-000000000006', RES6,  '401','Fatema Begum',   'Cash',      37500, T, today_str, 37500),
  -- RES7: Rajib - partial bKash
  ('d3m0cafe-feed-4000-f000-000000000007', RES7,  '402','Rajib Kumar Das','bKash',     15000, T, today_str, 30000),
  -- RES8: Mohammad - card (corporate, VIP)
  ('d3m0cafe-feed-4000-f000-000000000008', RES8,  '501','Mohammad Karim', 'Card',      70000, T, today_str, 77000),
  -- RES9: Chen Wei - partial card advance
  ('d3m0cafe-feed-4000-f000-000000000009', RES9,  '503','Chen Wei',       'Card',      50000, T, today_str, 98000),
  -- RES10: Arif - checked out, fully settled
  ('d3m0cafe-feed-4000-f000-000000000010', RES10, '202','Arif Hossain',   'Cash',      10500, T, TO_CHAR(NOW()-INTERVAL'5 days' AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD'), 10500),
  -- RES11: Priya - bKash settled
  ('d3m0cafe-feed-4000-f000-000000000011', RES11, '304','Priya Sharma',   'bKash',     16500, T, TO_CHAR(NOW()-INTERVAL'3 days' AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD'), 16500),
  -- RES12: Nadia - card settled
  ('d3m0cafe-feed-4000-f000-000000000012', RES12, '504','Nadia Islam',    'Card',      42000, T, TO_CHAR(NOW()-INTERVAL'7 days' AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD'), 42000),
  -- RES13: Tanvir - advance deposit for upcoming
  ('d3m0cafe-feed-4000-f000-000000000013', RES13, '303','Tanvir Ahmed',   'bKash',     5000,  T, today_str, 16500),
  -- RES14: James - no payment yet (advance booking)
  -- (intentionally no transaction row — shows ৳0 paid, ৳37,500 due in ledger)
  -- Mini-bar charge example on R501
  ('d3m0cafe-feed-4000-f000-000000000014', RES8, '501','Mohammad Karim',  'Mini Bar',  3500,  T, today_str, 77000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. CORPORATE LEADS — 6 records in various pipeline stages
-- ============================================================
INSERT INTO corporate_leads (
  id, tenant_id, company_name, contact_name, contact_title, contact_email,
  industry, priority, status, deal_score, notes, last_contacted_at
)
VALUES
  ('d3m0cafe-feed-4000-a001-000000000001', T,
   'Robi Axiata PLC', 'Nowsheen Tabassum', 'Associate Manager, HR',
   'nowsheen.tabassum@robi.com.bd', 'Telecom', 'high', 'contacted', 72,
   'Responded positively to intro email. Interested in monthly corporate rate for 5–8 room-nights.',
   NOW()-INTERVAL'2 days'),

  ('d3m0cafe-feed-4000-a001-000000000002', T,
   'BRAC Bank PLC', 'Saifur Rahman', 'Head of Compensation and Rewards',
   'saifur.rahman@bracbank.com', 'Banking / Finance', 'high', 'replied', 85,
   'Requested rate card + invoice template. Potential 15–20 room-nights/month for training cohorts.',
   NOW()-INTERVAL'1 day'),

  ('d3m0cafe-feed-4000-a001-000000000003', T,
   'Summit Communications', 'Md. Asif Hossain', 'Chief Human Resources Officer',
   'asif.hossain@summitcommunications.net', 'Telecom', 'high', 'pending', NULL,
   'Source: LinkedIn auto-prospecting. OutreachBot to send intro email.',
   NULL),

  ('d3m0cafe-feed-4000-a001-000000000004', T,
   'Bashundhara Group', 'Md. Sheikh Sadi', 'HR Manager',
   'md.ckpis@bashundharagroup.com', 'Conglomerate / Manufacturing', 'high', 'closed_won', 95,
   'Signed corporate rate agreement: ৳4,800/night Standard, ৳7,000/night Deluxe. 10 guaranteed room-nights/month.',
   NOW()-INTERVAL'5 days'),

  ('d3m0cafe-feed-4000-a001-000000000005', T,
   'Team Group', 'Khandker M Imam', 'Head of HR',
   'khandker.imam@team.com.bd', 'RMG / Garment', 'med', 'pending', NULL,
   'Source: LinkedIn auto-prospecting.',
   NULL),

  ('d3m0cafe-feed-4000-a001-000000000006', T,
   'Apex Footwear Ltd.', 'Mehnaz Alim', 'Deputy Manager, Talent Management',
   'mehnaz.alim@apexfootwearltd.com', 'Manufacturing / Retail', 'med', 'new_lead', 45,
   'CEO Auditor flagged: high deal score based on industry + company size.',
   NOW()-INTERVAL'3 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. HOTEL SETTINGS
-- ============================================================
INSERT INTO hotel_settings (key, value, tenant_id)
VALUES
  ('hotel_name',       'Grand Palace Hotel',          T),
  ('hotel_address',    '45 Gulshan Avenue, Dhaka 1212',T),
  ('hotel_phone',      '+880 2-9861234',               T),
  ('hotel_email',      'info@grandpalacedhaka.com',    T),
  ('vat_rate',         '0.15',                         T),
  ('tax_rate',         '0.01',                         T),
  ('check_in_time',    '14:00',                        T),
  ('check_out_time',   '12:00',                        T),
  ('currency_symbol',  '৳',                            T),
  ('rooms_total',      '20',                           T)
ON CONFLICT (key, tenant_id) DO NOTHING;

RAISE NOTICE '✅ Demo seed complete for tenant: %', T;
RAISE NOTICE '   Rooms: 20 | Guests: 10 | Reservations: 14 | Leads: 6';
RAISE NOTICE '   Login → demo@lumea.io / PIN: 1234';

END $$;
