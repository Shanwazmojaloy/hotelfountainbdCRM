-- ═══ PHASE 1/5: Setup staging schema + load rooms (28 rows) ═══
BEGIN;

DROP TABLE IF EXISTS bgqs_raw.transactions CASCADE;
DROP TABLE IF EXISTS bgqs_raw.reservations CASCADE;
DROP TABLE IF EXISTS bgqs_raw.guests CASCADE;
DROP TABLE IF EXISTS bgqs_raw.rooms CASCADE;
CREATE SCHEMA IF NOT EXISTS bgqs_raw;

CREATE TABLE bgqs_raw.rooms (id uuid PRIMARY KEY, room_number text, category text, price int, status text, tenant_id uuid);
CREATE TABLE bgqs_raw.guests (id uuid PRIMARY KEY, name text, email text, phone text, id_type text, id_number text, address text, city text, country text, preferences text, outstanding_balance int, id_card text, tenant_id uuid, last_stay_date date, total_stays int, total_spend numeric, guest_status text);
CREATE TABLE bgqs_raw.reservations (id uuid PRIMARY KEY, room_ids text[], guest_ids text[], check_in timestamptz, check_out timestamptz, status text, stay_type text, laundry int, mini_bar int, discount int, extra_charges int, paid_amount int, payment_method text, on_duty_officer text, special_requests text, notes text, total_amount int, guest_name text, tenant_id uuid, room_details jsonb);
CREATE TABLE bgqs_raw.transactions (id uuid PRIMARY KEY, ts timestamptz, room_number text, guest_name text, type text, amount int, fiscal_day date, payment_method text, tenant_id uuid, reservation_id uuid);

INSERT INTO bgqs_raw.rooms (id, room_number, category, price, status, tenant_id) VALUES
('7e0413c5-562f-47e6-9150-b9de812f785d','301','Fountain Deluxe',4000,'DIRTY',NULL),
('ac508154-908b-48c2-8d3e-5d6c939d0084','302','Superior Deluxe',5000,'AVAILABLE',NULL),
('34fd0fe5-29c3-4871-bf96-b3d191bad8b7','303','Royal Suite',9000,'AVAILABLE',NULL),
('ea85b039-b60c-4cda-9816-b5b30ba39016','304','Fountain Deluxe',4000,'AVAILABLE',NULL),
('6e627b9a-2c17-4941-ad75-c1126200acd1','305','Fountain Deluxe',4000,'AVAILABLE',NULL),
('6aa6c818-957c-47fb-a336-2671ad766892','306','Premium Deluxe',4500,'AVAILABLE',NULL),
('655535e1-7e1e-478d-8320-31cdc656e8ff','307','Premium Deluxe',4500,'OCCUPIED',NULL),
('1416a513-e788-49ac-a581-6d7cb69492e2','308','Premium Deluxe',4500,'AVAILABLE',NULL),
('73d9e74e-05f5-4168-bef5-3ea9731544b4','401','Fountain Deluxe',4000,'OUT_OF_ORDER',NULL),
('dd5b202f-866f-41ce-b590-fdf058592d83','402','Premium Deluxe',4500,'AVAILABLE',NULL),
('948342bd-f84b-412f-ad8c-e8538cdf7eaa','403','Premium Deluxe',4500,'OUT_OF_ORDER',NULL),
('87de8016-a96d-43eb-bf02-f60e5d59aa6b','404','Premium Deluxe',4500,'OUT_OF_ORDER',NULL),
('acfb2eec-8b85-402e-bae5-d82e586210be','405','Fountain Deluxe',4000,'OUT_OF_ORDER',NULL),
('ba968867-6a31-488d-8a13-39b53421375e','406','Fountain Deluxe',4000,'DIRTY',NULL),
('bbd4b86e-49d3-4d9a-adab-44a9c91cf413','407','Premium Deluxe',4500,'OUT_OF_ORDER',NULL),
('e760838e-1609-4590-b68a-902a93f31b5a','408','Premium Deluxe',4500,'OUT_OF_ORDER',NULL),
('089b9f53-2929-4ebb-ab27-f02860f47e52','409','Premium Deluxe',4500,'AVAILABLE',NULL),
('5818efec-3280-49fb-be9b-38b8fe54d12d','410','Fountain Deluxe',4000,'AVAILABLE',NULL),
('4ccaa368-413d-43d2-aafb-8e6990073145','501','Fountain Deluxe',4000,'OUT_OF_ORDER',NULL),
('9481fa33-14f1-4d26-a618-f9ff98eb62f9','502','Twin Deluxe',6000,'AVAILABLE',NULL),
('64043c34-0b1d-4910-b8f3-19fc705cc22c','503','Twin Deluxe',6000,'AVAILABLE',NULL),
('aef913a0-ab7c-4615-a9df-c25b0c4e9f22','504','Twin Deluxe',6000,'OUT_OF_ORDER',NULL),
('9f3614b0-e25c-45b2-a2a5-07197eee3491','505','Fountain Deluxe',4000,'OCCUPIED',NULL),
('63007d3e-1ced-4435-acbd-b840b845e3ca','506','Fountain Deluxe',4000,'OUT_OF_ORDER',NULL),
('b3149c49-0ad5-4a71-8a78-d325d1a07582','507','Twin Deluxe',6000,'AVAILABLE',NULL),
('b69c9b0b-c3b0-4b8c-b231-e20642d5d6c3','508','Twin Deluxe',6000,'AVAILABLE',NULL),
('8884fa67-a1a0-41b5-8dbb-b31f64285520','509','Premium Deluxe',4500,'OCCUPIED',NULL),
('bc440bb4-8627-48de-b854-9361de90ed2f','510','Fountain Deluxe',4000,'OCCUPIED',NULL);

COMMIT;

-- ✓ EXPECT: rooms staging table populated with 28 rows
SELECT COUNT(*) AS rooms_staged FROM bgqs_raw.rooms;
