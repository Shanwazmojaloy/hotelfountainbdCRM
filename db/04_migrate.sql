-- ═══ PHASE 4/5: Migrate staged data into public schema with dedup + remap ═══
BEGIN;

-- Room UUID remap: bgqs.rooms.id → mynw.rooms.id
CREATE TEMP TABLE room_map AS
SELECT b.id AS bgqs_id, m.id AS mynw_id, b.room_number
FROM bgqs_raw.rooms b
JOIN public.rooms m ON m.room_number = b.room_number;

DO $$ BEGIN
  IF (SELECT COUNT(*) FROM bgqs_raw.rooms) <> (SELECT COUNT(*) FROM room_map) THEN
    RAISE EXCEPTION 'Room map incomplete';
  END IF;
END $$;

-- Guest dedup: match on lower(trim(name)) + id_number (or id_card fallback)
CREATE TEMP TABLE guest_map AS
SELECT b.id AS bgqs_id, m.id AS mynw_id
FROM bgqs_raw.guests b
LEFT JOIN public.guests m
  ON LOWER(TRIM(m.name)) = LOWER(TRIM(b.name))
 AND COALESCE(m.id_number, m.id_card) = COALESCE(b.id_number, b.id_card)
 AND COALESCE(m.id_number, m.id_card, '') <> '';

-- Import unique guests only
INSERT INTO public.guests (
  id, name, email, phone, id_type, id_number, address, city, country,
  preferences, outstanding_balance, id_card, tenant_id, total_spent, total_stays
)
SELECT
  b.id, b.name, b.email, b.phone, b.id_type, b.id_number, b.address, b.city, b.country,
  b.preferences, COALESCE(b.outstanding_balance, 0)::numeric, b.id_card,
  '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  COALESCE(b.total_spend, 0)::numeric, COALESCE(b.total_stays, 0)
FROM bgqs_raw.guests b
LEFT JOIN guest_map gm ON gm.bgqs_id = b.id
WHERE gm.mynw_id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Import reservations with room_ids[] remap + guest_ids[] dedup-redirect
INSERT INTO public.reservations (
  id, room_ids, guest_ids, check_in, check_out, status, stay_type,
  laundry, mini_bar, discount, extra_charges, paid_amount, payment_method,
  on_duty_officer, special_requests, notes, total_amount, guest_name,
  tenant_id, room_details, discount_amount
)
SELECT
  r.id,
  ARRAY(SELECT COALESCE(rm.mynw_id::text, rid)
        FROM unnest(r.room_ids) AS rid
        LEFT JOIN room_map rm ON rm.bgqs_id::text = rid),
  ARRAY(SELECT COALESCE(gm.mynw_id::text, gid)
        FROM unnest(r.guest_ids) AS gid
        LEFT JOIN guest_map gm ON gm.bgqs_id::text = gid),
  r.check_in, r.check_out, r.status, r.stay_type,
  r.laundry::numeric, r.mini_bar::numeric, r.discount::numeric, r.extra_charges::numeric,
  r.paid_amount::numeric, r.payment_method, r.on_duty_officer, r.special_requests, r.notes,
  r.total_amount::numeric, r.guest_name,
  '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid, r.room_details,
  COALESCE(r.discount, 0)::numeric
FROM bgqs_raw.reservations r
ON CONFLICT (id) DO NOTHING;

-- Import transactions
INSERT INTO public.transactions (
  id, "timestamp", room_number, guest_name, type, amount,
  tenant_id, fiscal_day, reservation_id
)
SELECT
  t.id, t.ts, t.room_number, t.guest_name, t.type,
  COALESCE(t.amount, 0)::numeric,
  '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  to_char(t.fiscal_day, 'YYYY-MM-DD'),
  t.reservation_id
FROM bgqs_raw.transactions t
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Validation summary
SELECT 'guests'        AS tbl, COUNT(*)::text FROM public.guests
UNION ALL SELECT 'reservations', COUNT(*)::text FROM public.reservations
UNION ALL SELECT 'transactions', COUNT(*)::text FROM public.transactions;
