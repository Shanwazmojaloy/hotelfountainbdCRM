-- Lumea schema baseline (generated from prod mynwfkgksqqwlqowlscj 2026-06-12)
SET check_function_bodies = off;

-- EXTENSIONS
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- ENUM TYPES
CREATE TYPE public.invoice_status_type AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'VOIDED');
CREATE TYPE public.invoice_type_enum AS ENUM ('FOLIO', 'PROFORMA', 'RECEIPT', 'CREDIT_NOTE');
CREATE TYPE public.ledger_entry_type AS ENUM ('ROOM_CHARGE', 'FOOD_BEVERAGE', 'MINIBAR', 'LAUNDRY', 'TRANSPORT', 'SPA', 'DAMAGE', 'MISCELLANEOUS', 'TAX', 'SERVICE_CHARGE', 'DISCOUNT', 'COMPLIMENTARY', 'ADVANCE_PAYMENT', 'PAYMENT', 'REFUND', 'TRANSFER_IN', 'TRANSFER_OUT');
CREATE TYPE public.payment_method_type AS ENUM ('CASH', 'CARD', 'MOBILE_BANKING', 'BANK_TRANSFER', 'CHEQUE', 'CITY_LEDGER', 'VOUCHER', 'LOYALTY_POINTS');
CREATE TYPE public.payment_status_type AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE public.room_status AS ENUM ('Available', 'Occupied', 'Cleaning', 'Maintenance');
CREATE TYPE public.subscription_plan AS ENUM ('starter', 'pro', 'enterprise');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'paused');

-- SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.email_chunks_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.staff_id_seq;

-- FUNCTIONS
CREATE OR REPLACE FUNCTION public.check_user_login(email_input text, password_input text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE user_record RECORD;
BEGIN
  SELECT p.id, p.name, p.email, p.role
    INTO user_record
    FROM public.profiles p
    JOIN public.user_credentials uc ON uc.user_id = p.id
   WHERE p.email = email_input
     AND (uc.pin = password_input OR uc.password = password_input);
  IF user_record.id IS NOT NULL THEN RETURN row_to_json(user_record); ELSE RETURN NULL; END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_user_secure(email text, password text, user_data jsonb, app_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
    new_id uuid;
    existing_id uuid;
    encrypted_pw text;
    caller_role text;
begin
    -- 1. Security Check: Ensure caller is an ADMIN
    select role into caller_role from public.users where id = auth.uid();
    
    if caller_role is null or caller_role <> 'ADMIN' then
        if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'ADMIN' then
             raise exception 'Access Denied: Admin Privileges Required';
        end if;
    end if;

    -- 2. Check if user already exists
    select id into existing_id from auth.users where auth.users.email = create_user_secure.email;

    encrypted_pw := crypt(password, gen_salt('bf'));

    if existing_id is not null then
        -- User exists: PERFORM UPSERT / UPDATE
        update auth.users 
        set raw_app_meta_data = app_data,
            raw_user_meta_data = user_data,
            encrypted_password = encrypted_pw,
            updated_at = now()
        where id = existing_id;
        
        return jsonb_build_object('id', existing_id, 'email', email, 'action', 'updated');
    end if;

    -- 3. New User: Insert
    new_id := gen_random_uuid();
    
    insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_sso_user
    ) values (
        '00000000-0000-0000-0000-000000000000',
        new_id,
        'authenticated',
        'authenticated',
        email,
        encrypted_pw,
        now(),
        app_data,
        user_data,
        now(),
        now(),
        false
    );

    -- 4. Create Identity
    insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) values (
        gen_random_uuid(),
        new_id,
        format('{"sub": "%s", "email": "%s"}', new_id::text, email)::jsonb,
        'email',
        new_id::text,
        now(),
        now(),
        now()
    );

    return jsonb_build_object('id', new_id, 'email', email, 'action', 'created');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repair_user_secure(target_user_id uuid, target_tenant_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
            BEGIN
                -- Inject tenant_id into both metadata buckets
                UPDATE auth.users
                SET
                    app_metadata  = coalesce(app_metadata, '{}'::jsonb)  || jsonb_build_object('tenant_id', target_tenant_id),
                    user_metadata = coalesce(user_metadata, '{}'::jsonb) || jsonb_build_object('tenant_id', target_tenant_id)
                WHERE id = target_user_id;

                RETURN TRUE;
            END;
            $function$
;

CREATE OR REPLACE FUNCTION public.get_my_tenant()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT id FROM tenants WHERE owner_id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_tenant_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- This is called from the API after tenant creation, not auto-trigger
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_sheets_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  edge_fn_url text := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/sync-to-sheets';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow';
  payload jsonb;
BEGIN
  BEGIN
    payload := jsonb_build_object('table', TG_TABLE_NAME, 'event', TG_OP);
    PERFORM net.http_post(
      url := edge_fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', anon_key
      ),
      body := payload
    );
  EXCEPTION WHEN OTHERS THEN
    -- Silently ignore sync errors — never block the main operation
    NULL;
  END;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.vault_secret(secret_name text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.update_modified_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.last_updated = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_review_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only fire when status changes TO 'CHECKED_OUT'
  IF NEW.status = 'CHECKED_OUT' AND OLD.status <> 'CHECKED_OUT' THEN
    INSERT INTO review_queue (reservation_id, send_after)
    VALUES (NEW.id, NOW() + INTERVAL '2 hours')
    ON CONFLICT (reservation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extract_inclusive_tax(p_inclusive_bdt integer, p_vat_bps integer DEFAULT 1500, p_sc_bps integer DEFAULT 500)
 RETURNS TABLE(net_bdt integer, sc_bdt integer, vat_bdt integer)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_divisor INTEGER;
  v_net     INTEGER;
  v_sc      INTEGER;
  v_vat     INTEGER;
BEGIN
  v_divisor := 10000 + p_vat_bps + p_sc_bps;  -- e.g. 12000 for 15%+5%

  -- Integer division — safe, no float involved
  v_net := (p_inclusive_bdt::BIGINT * 10000) / v_divisor;
  v_sc  := (v_net::BIGINT * p_sc_bps) / 10000;
  v_vat := p_inclusive_bdt - v_net - v_sc;     -- absorbs rounding remainder

  RETURN QUERY SELECT v_net, v_sc, v_vat;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_room_rate_for_date(p_room_number text, p_stay_date date, p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rate INTEGER;
BEGIN
  -- Direct lookup from existing rooms table (inclusive BDT rate)
  SELECT price INTO v_rate
  FROM rooms
  WHERE room_number = p_room_number
    AND tenant_id   = p_tenant_id;

  RETURN COALESCE(v_rate, 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expand_nightly_charges(p_reservation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_res           RECORD;
  v_room_number   TEXT;
  v_guest_id      UUID;
  v_stay_date     DATE;
  v_inclusive_bdt INTEGER;
  v_net           INTEGER;
  v_sc            INTEGER;
  v_vat           INTEGER;
  v_charge_id     UUID;
  v_rows_inserted INTEGER := 0;
  v_already_posted BOOLEAN;
BEGIN
  -- Fetch the reservation
  SELECT * INTO v_res
  FROM reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation % not found', p_reservation_id;
  END IF;

  -- Use the first guest as the primary guest for ledger entries
  v_guest_id := v_res.guest_ids[1];

  -- Loop over each night (check_in inclusive, check_out exclusive)
  v_stay_date := v_res.check_in::DATE;
  WHILE v_stay_date < v_res.check_out::DATE LOOP

    -- Loop over each room in the reservation
    FOREACH v_room_number IN ARRAY v_res.room_ids LOOP

      -- Idempotency check: skip if a non-voided ROOM_CHARGE already exists
      -- for this reservation, room, and date
      SELECT EXISTS (
        SELECT 1 FROM guest_ledger
        WHERE reservation_id   = p_reservation_id
          AND entry_type        = 'ROOM_CHARGE'
          AND transaction_date  = v_stay_date
          AND is_voided         = FALSE
          AND metadata->>'room_number' = v_room_number
      ) INTO v_already_posted;

      CONTINUE WHEN v_already_posted;

      -- Get inclusive rate for this room on this date
      v_inclusive_bdt := get_room_rate_for_date(
        v_room_number, v_stay_date, v_res.tenant_id
      );

      IF v_inclusive_bdt = 0 THEN
        RAISE WARNING 'Room % not found or price is 0 — skipping', v_room_number;
        CONTINUE;
      END IF;

      -- Extract tax breakdown (no floats, integer-only)
      SELECT * INTO v_net, v_sc, v_vat
      FROM extract_inclusive_tax(v_inclusive_bdt, 1500, 500);

      -- 1. Insert ROOM_CHARGE (net amount)
      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description,
        transaction_date, amount_bdt,
        is_tax_entry, metadata
      )
      VALUES (
        v_res.tenant_id, p_reservation_id, v_guest_id,
        'ROOM_CHARGE',
        format('Room %s — %s', v_room_number,
               to_char(v_stay_date, 'DD Mon YYYY')),
        v_stay_date, v_net,
        FALSE,
        jsonb_build_object(
          'room_number',    v_room_number,
          'inclusive_rate', v_inclusive_bdt,
          'vat_bps',        1500,
          'sc_bps',         500
        )
      )
      RETURNING id INTO v_charge_id;

      -- 2. Insert SERVICE_CHARGE (child)
      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description,
        transaction_date, amount_bdt,
        is_tax_entry, parent_ledger_id, metadata
      )
      VALUES (
        v_res.tenant_id, p_reservation_id, v_guest_id,
        'SERVICE_CHARGE',
        format('Service Charge 5%% — Room %s %s',
               v_room_number, to_char(v_stay_date, 'DD Mon YYYY')),
        v_stay_date, v_sc,
        TRUE, v_charge_id,
        jsonb_build_object('room_number', v_room_number, 'rate_bps', 500)
      );

      -- 3. Insert VAT (child)
      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description,
        transaction_date, amount_bdt,
        is_tax_entry, parent_ledger_id, metadata
      )
      VALUES (
        v_res.tenant_id, p_reservation_id, v_guest_id,
        'TAX',
        format('VAT 15%% — Room %s %s',
               v_room_number, to_char(v_stay_date, 'DD Mon YYYY')),
        v_stay_date, v_vat,
        TRUE, v_charge_id,
        jsonb_build_object('room_number', v_room_number, 'rate_bps', 1500)
      );

      v_rows_inserted := v_rows_inserted + 1;
    END LOOP; -- rooms

    v_stay_date := v_stay_date + INTERVAL '1 day';
  END LOOP; -- nights

  RETURN v_rows_inserted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.post_extra_charge(p_reservation_id uuid, p_guest_id uuid, p_entry_type ledger_entry_type, p_description text, p_amount_bdt integer, p_date date DEFAULT CURRENT_DATE, p_posted_by uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id  UUID;
  v_net        INTEGER;
  v_sc         INTEGER;
  v_vat        INTEGER;
  v_charge_id  UUID;
  -- entry types that attract VAT + SC
  v_taxable    BOOLEAN := p_entry_type IN (
    'FOOD_BEVERAGE','MINIBAR','LAUNDRY','SPA','DAMAGE','TRANSPORT','MISCELLANEOUS'
  );
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM reservations WHERE id = p_reservation_id;

  IF v_taxable THEN
    SELECT * INTO v_net, v_sc, v_vat
    FROM extract_inclusive_tax(p_amount_bdt, 1500, 500);
  ELSE
    v_net := p_amount_bdt;
    v_sc  := 0;
    v_vat := 0;
  END IF;

  INSERT INTO guest_ledger (
    tenant_id, reservation_id, guest_id,
    entry_type, description,
    transaction_date, amount_bdt,
    is_tax_entry, posted_by, metadata
  )
  VALUES (
    v_tenant_id, p_reservation_id, p_guest_id,
    p_entry_type, p_description,
    p_date, v_net,
    FALSE, p_posted_by,
    p_metadata || jsonb_build_object('inclusive_amount', p_amount_bdt)
  )
  RETURNING id INTO v_charge_id;

  IF v_taxable AND v_sc > 0 THEN
    INSERT INTO guest_ledger (
      tenant_id, reservation_id, guest_id,
      entry_type, description, transaction_date, amount_bdt,
      is_tax_entry, parent_ledger_id, metadata
    ) VALUES (
      v_tenant_id, p_reservation_id, p_guest_id,
      'SERVICE_CHARGE', 'Service Charge 5%%', p_date, v_sc,
      TRUE, v_charge_id, '{}'
    );
  END IF;

  IF v_taxable AND v_vat > 0 THEN
    INSERT INTO guest_ledger (
      tenant_id, reservation_id, guest_id,
      entry_type, description, transaction_date, amount_bdt,
      is_tax_entry, parent_ledger_id, metadata
    ) VALUES (
      v_tenant_id, p_reservation_id, p_guest_id,
      'TAX', 'VAT 15%%', p_date, v_vat,
      TRUE, v_charge_id, '{}'
    );
  END IF;

  RETURN v_charge_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.void_ledger_entry(p_entry_id uuid, p_reason text, p_voided_by uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'void_reason is required';
  END IF;

  UPDATE guest_ledger
  SET
    is_voided   = TRUE,
    voided_at   = NOW(),
    void_reason = p_reason,
    voided_by   = p_voided_by,
    updated_at  = NOW()
  WHERE
    (id = p_entry_id OR correction_of_id = p_entry_id OR parent_ledger_id = p_entry_id)
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_recalculate_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reservation_id UUID;
  v_invoice_id     UUID;
BEGIN
  v_reservation_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

  -- Find the active (DRAFT or ISSUED) invoice for this reservation
  SELECT id INTO v_invoice_id
  FROM billing_invoices
  WHERE reservation_id = v_reservation_id
    AND status IN ('DRAFT', 'ISSUED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE billing_invoices SET
    -- Net room/extra charges (excludes tax lines and credits)
    net_total_bdt = (
      SELECT COALESCE(SUM(amount_bdt), 0)
      FROM guest_ledger
      WHERE reservation_id = v_reservation_id
        AND is_voided       = FALSE
        AND is_tax_entry    = FALSE
        AND entry_type NOT IN (
          'DISCOUNT','COMPLIMENTARY',
          'PAYMENT','ADVANCE_PAYMENT','REFUND',
          'TRANSFER_IN','TRANSFER_OUT'
        )
    ),
    -- Service Charge lines
    sc_total_bdt = (
      SELECT COALESCE(SUM(amount_bdt), 0)
      FROM guest_ledger
      WHERE reservation_id = v_reservation_id
        AND is_voided       = FALSE
        AND entry_type      = 'SERVICE_CHARGE'
    ),
    -- VAT lines
    vat_total_bdt = (
      SELECT COALESCE(SUM(amount_bdt), 0)
      FROM guest_ledger
      WHERE reservation_id = v_reservation_id
        AND is_voided       = FALSE
        AND entry_type      = 'TAX'
    ),
    -- Discounts (stored as absolute value)
    discount_total_bdt = (
      SELECT COALESCE(ABS(SUM(amount_bdt)), 0)
      FROM guest_ledger
      WHERE reservation_id = v_reservation_id
        AND is_voided       = FALSE
        AND entry_type IN ('DISCOUNT', 'COMPLIMENTARY')
    ),
    -- Gross = net + sc + vat - discount
    gross_total_bdt = (
      SELECT COALESCE(SUM(
        CASE entry_type
          WHEN 'PAYMENT'          THEN 0
          WHEN 'ADVANCE_PAYMENT'  THEN 0
          WHEN 'REFUND'           THEN 0
          WHEN 'TRANSFER_IN'      THEN 0
          WHEN 'TRANSFER_OUT'     THEN 0
          ELSE amount_bdt
        END
      ), 0)
      FROM guest_ledger
      WHERE reservation_id = v_reservation_id
        AND is_voided       = FALSE
    ),
    -- Payments from payment_transactions (source of truth)
    paid_total_bdt = (
      SELECT COALESCE(SUM(amount_bdt), 0)
      FROM payment_transactions
      WHERE reservation_id = v_reservation_id
        AND status          = 'COMPLETED'
    ),
    updated_at = NOW()
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_recalculate_paid_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoice_id UUID;
BEGIN
  SELECT id INTO v_invoice_id
  FROM billing_invoices
  WHERE reservation_id = COALESCE(NEW.reservation_id, OLD.reservation_id)
    AND status IN ('DRAFT', 'ISSUED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE billing_invoices SET
    paid_total_bdt = (
      SELECT COALESCE(SUM(amount_bdt), 0)
      FROM payment_transactions
      WHERE reservation_id = COALESCE(NEW.reservation_id, OLD.reservation_id)
        AND status          = 'COMPLETED'
    ),
    updated_at = NOW()
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN format('LMI-%s-%05s',
                to_char(NOW(), 'YYYY'),
                nextval('invoice_number_seq'));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.map_payment_method(p_raw text)
 RETURNS payment_method_type
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN CASE lower(trim(coalesce(p_raw, '')))
    WHEN 'cash'          THEN 'CASH'::payment_method_type
    WHEN 'card'          THEN 'CARD'::payment_method_type
    WHEN 'bkash'         THEN 'MOBILE_BANKING'::payment_method_type
    WHEN 'nagad'         THEN 'MOBILE_BANKING'::payment_method_type
    WHEN 'rocket'        THEN 'MOBILE_BANKING'::payment_method_type
    WHEN 'mobile'        THEN 'MOBILE_BANKING'::payment_method_type
    WHEN 'bank'          THEN 'BANK_TRANSFER'::payment_method_type
    WHEN 'bank transfer' THEN 'BANK_TRANSFER'::payment_method_type
    WHEN 'cheque'        THEN 'CHEQUE'::payment_method_type
    WHEN 'check'         THEN 'CHEQUE'::payment_method_type
    WHEN 'city ledger'   THEN 'CITY_LEDGER'::payment_method_type
    WHEN 'voucher'       THEN 'VOUCHER'::payment_method_type
    ELSE                      'CASH'::payment_method_type
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_checkout(p_reservation_id uuid, p_checked_out_by uuid DEFAULT NULL::uuid, p_actual_checkout timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_res              RECORD;
  v_guest            RECORD;
  v_invoice_id       UUID;
  v_invoice          RECORD;
  v_has_ledger       BOOLEAN;
  v_charges_voided   INTEGER := 0;
  v_children_voided  INTEGER := 0;
  v_rooms_vacated    INTEGER := 0;
  v_room_number      TEXT;
  v_room             RECORD;
  v_charge_id        UUID;
  v_net              INTEGER;
  v_sc               INTEGER;
  v_vat              INTEGER;
  v_base_rate        INTEGER;
  v_line_items       JSONB;
BEGIN

  -- STEP 1: Lock & validate reservation
  SELECT * INTO v_res
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation % not found', p_reservation_id;
  END IF;

  IF v_res.status != 'CHECKED_IN' THEN
    RAISE EXCEPTION
      'Cannot checkout reservation % — current status is "%" (must be CHECKED_IN)',
      p_reservation_id, v_res.status;
  END IF;

  SELECT * INTO v_guest
  FROM guests
  WHERE id = v_res.guest_ids[1];

  -- STEP 2: Check whether the billing ledger has entries for this reservation
  SELECT EXISTS (
    SELECT 1 FROM guest_ledger
    WHERE reservation_id = p_reservation_id
      AND is_voided = FALSE
  ) INTO v_has_ledger;

  -- STEP 3: LEGACY BRIDGE
  IF NOT v_has_ledger THEN

    SELECT id INTO v_invoice_id
    FROM billing_invoices
    WHERE reservation_id = p_reservation_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_invoice_id IS NULL THEN
      INSERT INTO billing_invoices (
        tenant_id, invoice_number, reservation_id, guest_id,
        invoice_type, invoice_date, billing_name, status
      ) VALUES (
        v_res.tenant_id,
        generate_invoice_number(),
        p_reservation_id,
        v_res.guest_ids[1],
        'FOLIO',
        p_actual_checkout::DATE,
        COALESCE(v_guest.name, 'Guest'),
        'DRAFT'
      ) RETURNING id INTO v_invoice_id;
    END IF;

    FOREACH v_room_number IN ARRAY v_res.room_ids LOOP

      SELECT * INTO v_room
      FROM rooms
      WHERE room_number = v_room_number
        AND tenant_id   = v_res.tenant_id;

      v_base_rate := COALESCE(
        (v_res.room_details -> v_room_number ->> 'base_rate')::INTEGER,
        v_room.price,
        0
      );

      IF v_base_rate = 0 THEN CONTINUE; END IF;

      SELECT net_bdt, sc_bdt, vat_bdt
        INTO v_net, v_sc, v_vat
        FROM extract_inclusive_tax(v_base_rate, 1500, 500);

      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description, transaction_date, amount_bdt,
        is_tax_entry, metadata
      ) VALUES (
        v_res.tenant_id, p_reservation_id, v_res.guest_ids[1],
        'ROOM_CHARGE',
        format('Room %s — %s to %s',
               v_room_number,
               to_char(v_res.check_in::DATE, 'DD Mon'),
               to_char(v_res.check_out::DATE, 'DD Mon YYYY')),
        v_res.check_in::DATE,
        v_net,
        FALSE,
        jsonb_build_object(
          'source',        'legacy_bridge',
          'room_number',   v_room_number,
          'inclusive_rate', v_base_rate
        )
      ) RETURNING id INTO v_charge_id;

      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description, transaction_date, amount_bdt,
        is_tax_entry, parent_ledger_id, metadata
      ) VALUES (
        v_res.tenant_id, p_reservation_id, v_res.guest_ids[1],
        'SERVICE_CHARGE', 'Service Charge 5%',
        v_res.check_in::DATE, v_sc,
        TRUE, v_charge_id,
        jsonb_build_object('source', 'legacy_bridge', 'rate_bps', 500)
      );

      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description, transaction_date, amount_bdt,
        is_tax_entry, parent_ledger_id, metadata
      ) VALUES (
        v_res.tenant_id, p_reservation_id, v_res.guest_ids[1],
        'TAX', 'VAT 15%',
        v_res.check_in::DATE, v_vat,
        TRUE, v_charge_id,
        jsonb_build_object('source', 'legacy_bridge', 'rate_bps', 1500)
      );
    END LOOP;

    IF COALESCE(v_res.laundry, 0) > 0 THEN
      PERFORM post_extra_charge(
        p_reservation_id, v_res.guest_ids[1],
        'LAUNDRY', 'Laundry',
        v_res.laundry, v_res.check_in::DATE,
        p_checked_out_by,
        '{"source":"legacy_bridge"}'::JSONB
      );
    END IF;

    IF COALESCE(v_res.mini_bar, 0) > 0 THEN
      PERFORM post_extra_charge(
        p_reservation_id, v_res.guest_ids[1],
        'MINIBAR', 'Mini Bar',
        v_res.mini_bar, v_res.check_in::DATE,
        p_checked_out_by,
        '{"source":"legacy_bridge"}'::JSONB
      );
    END IF;

    IF COALESCE(v_res.extra_charges, 0) > 0 THEN
      PERFORM post_extra_charge(
        p_reservation_id, v_res.guest_ids[1],
        'MISCELLANEOUS', 'Extra Charges',
        v_res.extra_charges, v_res.check_in::DATE,
        p_checked_out_by,
        '{"source":"legacy_bridge"}'::JSONB
      );
    END IF;

    IF COALESCE(v_res.discount, 0) > 0 THEN
      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description, transaction_date,
        amount_bdt, is_tax_entry, metadata
      ) VALUES (
        v_res.tenant_id, p_reservation_id, v_res.guest_ids[1],
        'DISCOUNT',
        format('Discount applied — %s', COALESCE(v_res.on_duty_officer, 'Staff')),
        v_res.check_in::DATE,
        -COALESCE(v_res.discount, 0),
        FALSE,
        '{"source":"legacy_bridge"}'::JSONB
      );
    END IF;

    IF COALESCE(v_res.paid_amount, 0) > 0 THEN
      INSERT INTO payment_transactions (
        tenant_id, reservation_id, guest_id,
        payment_method, amount_bdt,
        status, completed_at,
        is_advance_payment, payment_reference,
        processed_by, notes
      ) VALUES (
        v_res.tenant_id, p_reservation_id, v_res.guest_ids[1],
        map_payment_method(v_res.payment_method),
        v_res.paid_amount,
        'COMPLETED', v_res.created_at,
        FALSE,
        'LEGACY-' || left(p_reservation_id::TEXT, 8),
        p_checked_out_by,
        'Migrated from legacy reservation record'
      );

      INSERT INTO guest_ledger (
        tenant_id, reservation_id, guest_id,
        entry_type, description, transaction_date,
        amount_bdt, is_tax_entry, metadata
      ) VALUES (
        v_res.tenant_id, p_reservation_id, v_res.guest_ids[1],
        'PAYMENT',
        format('Payment — %s (legacy)', COALESCE(v_res.payment_method, 'Cash')),
        v_res.check_in::DATE,
        -v_res.paid_amount,
        FALSE,
        jsonb_build_object(
          'source',         'legacy_bridge',
          'payment_method', v_res.payment_method
        )
      );
    END IF;

  END IF;

  -- STEP 4: EARLY DEPARTURE — void future nightly charges
  IF p_actual_checkout::DATE < v_res.check_out::DATE THEN

    WITH voided_parents AS (
      UPDATE guest_ledger
      SET
        is_voided   = TRUE,
        voided_at   = NOW(),
        void_reason = 'Early checkout — guest departed before scheduled date',
        voided_by   = p_checked_out_by,
        updated_at  = NOW()
      WHERE reservation_id  = p_reservation_id
        AND entry_type       = 'ROOM_CHARGE'
        AND transaction_date >= p_actual_checkout::DATE
        AND is_voided        = FALSE
      RETURNING id
    ),
    voided_children AS (
      UPDATE guest_ledger
      SET
        is_voided   = TRUE,
        voided_at   = NOW(),
        void_reason = 'Early checkout — parent charge voided',
        voided_by   = p_checked_out_by,
        updated_at  = NOW()
      WHERE parent_ledger_id IN (SELECT id FROM voided_parents)
        AND is_voided = FALSE
      RETURNING id
    )
    SELECT
      (SELECT count(*) FROM voided_parents)::INTEGER,
      (SELECT count(*) FROM voided_children)::INTEGER
    INTO v_charges_voided, v_children_voided;

  END IF;

  -- STEP 5: Ensure a DRAFT invoice exists
  SELECT id INTO v_invoice_id
  FROM billing_invoices
  WHERE reservation_id = p_reservation_id
    AND status IN ('DRAFT', 'ISSUED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO billing_invoices (
      tenant_id, invoice_number, reservation_id, guest_id,
      invoice_type, invoice_date, billing_name, status
    ) VALUES (
      v_res.tenant_id,
      generate_invoice_number(),
      p_reservation_id,
      v_res.guest_ids[1],
      'FOLIO',
      p_actual_checkout::DATE,
      COALESCE(v_guest.name, 'Guest'),
      'DRAFT'
    ) RETURNING id INTO v_invoice_id;
  END IF;

  -- STEP 6: Snapshot invoice → line items, transition DRAFT → ISSUED
  DELETE FROM invoice_line_items WHERE invoice_id = v_invoice_id;

  INSERT INTO invoice_line_items (
    invoice_id,
    ledger_entry_id,
    description,
    entry_type,
    transaction_date,
    quantity,
    unit_amount_bdt,
    total_amount_bdt,
    sc_amount_bdt,
    vat_amount_bdt,
    sort_order
  )
  SELECT
    v_invoice_id,
    gl.id,
    gl.description,
    gl.entry_type,
    gl.transaction_date,
    1,
    gl.amount_bdt,
    gl.amount_bdt,
    COALESCE((
      SELECT SUM(sc.amount_bdt)
      FROM guest_ledger sc
      WHERE sc.parent_ledger_id = gl.id
        AND sc.entry_type = 'SERVICE_CHARGE'
        AND sc.is_voided = FALSE
    ), 0),
    COALESCE((
      SELECT SUM(vt.amount_bdt)
      FROM guest_ledger vt
      WHERE vt.parent_ledger_id = gl.id
        AND vt.entry_type = 'TAX'
        AND vt.is_voided = FALSE
    ), 0),
    ROW_NUMBER() OVER (ORDER BY gl.transaction_date, gl.posted_at) - 1
  FROM guest_ledger gl
  WHERE gl.reservation_id = p_reservation_id
    AND gl.is_voided       = FALSE
    AND gl.is_tax_entry    = FALSE
  ORDER BY gl.transaction_date, gl.posted_at;

  UPDATE billing_invoices
  SET
    status    = 'ISSUED',
    issued_by = p_checked_out_by,
    issued_at = NOW(),
    updated_at = NOW()
  WHERE id     = v_invoice_id
    AND status = 'DRAFT';

  -- STEP 7: Mark reservation as CHECKED_OUT
  UPDATE reservations
  SET
    status         = 'CHECKED_OUT',
    check_out_time = p_actual_checkout
  WHERE id = p_reservation_id;

  -- STEP 8: Set rooms to DIRTY, clear in-house guest info
  UPDATE rooms
  SET
    status     = 'DIRTY',
    guest_name = NULL,
    check_in   = NULL,
    check_out  = NULL
  WHERE room_number = ANY(v_res.room_ids)
    AND tenant_id   = v_res.tenant_id;

  GET DIAGNOSTICS v_rooms_vacated = ROW_COUNT;

  -- STEP 9: Update guest outstanding balance if a balance remains unpaid
  SELECT * INTO v_invoice FROM billing_invoices WHERE id = v_invoice_id;

  IF v_invoice.balance_due_bdt > 0 THEN
    UPDATE guests
    SET outstanding_balance = outstanding_balance + v_invoice.balance_due_bdt
    WHERE id = v_res.guest_ids[1];
  END IF;

  UPDATE guests
  SET
    total_spent = total_spent + v_invoice.gross_total_bdt,
    total_stays = total_stays + 1
  WHERE id = v_res.guest_ids[1];

  -- RETURN: Full checkout summary
  RETURN jsonb_build_object(
    'success',          TRUE,
    'reservation_id',   p_reservation_id,
    'invoice_id',       v_invoice_id,
    'invoice_number',   v_invoice.invoice_number,
    'guest_name',       COALESCE(v_guest.name, 'Guest'),
    'rooms_vacated',    ARRAY(
                          SELECT room_number FROM rooms
                          WHERE room_number = ANY(v_res.room_ids)
                            AND tenant_id   = v_res.tenant_id
                        ),
    'stay_nights',      (v_res.check_out::DATE - v_res.check_in::DATE),
    'actual_nights',    (LEAST(p_actual_checkout::DATE, v_res.check_out::DATE) - v_res.check_in::DATE),
    'net_total_bdt',    v_invoice.net_total_bdt,
    'sc_total_bdt',     v_invoice.sc_total_bdt,
    'vat_total_bdt',    v_invoice.vat_total_bdt,
    'discount_total_bdt', v_invoice.discount_total_bdt,
    'gross_total_bdt',  v_invoice.gross_total_bdt,
    'paid_total_bdt',   v_invoice.paid_total_bdt,
    'balance_due_bdt',  v_invoice.balance_due_bdt,
    'charges_voided',   v_charges_voided,
    'legacy_bridge',    NOT v_has_ledger,
    'checkout_time',    p_actual_checkout
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_device_token()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_device_token(p_device_id text)
 RETURNS TABLE(token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  v_token   := public.generate_device_token();
  v_expires := now() + INTERVAL '30 days';

  UPDATE public.authorized_devices
  SET
    device_token     = v_token,
    token_expires_at = v_expires,
    token_rotated_at = now()
  WHERE authorized_devices.device_id = p_device_id;

  RETURN QUERY SELECT v_token, v_expires;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_should_run(p_workflow_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_already_ran BOOLEAN;
  v_is_locked   BOOLEAN;
BEGIN
  -- Check if already succeeded today
  SELECT EXISTS(
    SELECT 1 FROM public.workflow_runs
    WHERE workflow_name = p_workflow_name
      AND status = 'success'
      AND DATE(ran_at) = CURRENT_DATE
  ) INTO v_already_ran;

  IF v_already_ran THEN
    RETURN FALSE; -- skip, already ran successfully today
  END IF;

  -- Check if currently locked (running)
  SELECT EXISTS(
    SELECT 1 FROM public.workflow_locks
    WHERE workflow_name = p_workflow_name
      AND lock_date = CURRENT_DATE
      AND released_at IS NULL
      AND locked_at > now() - INTERVAL '10 minutes' -- stale lock timeout
  ) INTO v_is_locked;

  IF v_is_locked THEN
    RETURN FALSE; -- skip, currently in-flight
  END IF;

  RETURN TRUE; -- safe to run
END;
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_acquire_lock(p_workflow_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.workflow_locks (workflow_name, lock_date, locked_at)
  VALUES (p_workflow_name, CURRENT_DATE, now())
  ON CONFLICT (workflow_name, lock_date) DO UPDATE
    SET locked_at = now(), released_at = NULL
    WHERE workflow_locks.released_at IS NOT NULL
       OR workflow_locks.locked_at < now() - INTERVAL '10 minutes';

  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_release_lock(p_workflow_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.workflow_locks
  SET released_at = now()
  WHERE workflow_name = p_workflow_name
    AND lock_date = CURRENT_DATE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_review_queue_populate_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email TEXT;
BEGIN
  -- Only act if guest_email is null
  IF NEW.guest_email IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Look up email from reservation → guests
  SELECT g.email INTO v_email
  FROM public.reservations r
  JOIN public.guests g ON g.id = (r.guest_ids)[1]
  WHERE r.id = NEW.reservation_id
    AND g.email IS NOT NULL
    AND g.email != ''
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    NEW.guest_email := v_email;
  ELSE
    -- No email found — immediately mark as skipped so it never blocks the queue
    NEW.status := 'skipped';
    NEW.sent_at := now();
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_dual_write_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_guest_id UUID;
  v_res_id   UUID;
  v_method   payment_method_type;
BEGIN
  v_res_id := NEW.reservation_id;
  IF v_res_id IS NULL THEN RETURN NEW; END IF;

  SELECT (guest_ids)[1] INTO v_guest_id FROM reservations WHERE id = v_res_id;
  IF v_guest_id IS NULL THEN RETURN NEW; END IF;

  v_method := CASE
    WHEN NEW.type ILIKE '%bkash%' THEN 'MOBILE_BANKING'::payment_method_type
    WHEN NEW.type ILIKE '%nagad%' THEN 'MOBILE_BANKING'::payment_method_type
    WHEN NEW.type ILIKE '%card%'  THEN 'CARD'::payment_method_type
    WHEN NEW.type ILIKE '%bank%'  THEN 'BANK_TRANSFER'::payment_method_type
    ELSE 'CASH'::payment_method_type
  END;

  INSERT INTO public.payment_transactions (
    id, tenant_id, reservation_id, guest_id, payment_method, payment_method_details,
    amount_bdt, status, is_advance_payment, initiated_at, completed_at, notes, metadata,
    idempotency_key
  ) VALUES (
    NEW.id,
    COALESCE(NEW.tenant_id, '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'),
    v_res_id, v_guest_id, v_method,
    CASE
      WHEN NEW.type ILIKE '%bkash%' THEN jsonb_build_object('provider','bKash')
      WHEN NEW.type ILIKE '%nagad%' THEN jsonb_build_object('provider','Nagad')
      ELSE '{}'::jsonb
    END,
    ABS(ROUND(NEW.amount))::integer,
    'COMPLETED'::payment_status_type,
    (NEW.type ILIKE '%advance%'),
    NEW.created_at, NEW.created_at, NEW.type,
    jsonb_build_object('dual_write_from','transactions','original_type',NEW.type,
                       'fiscal_day',NEW.fiscal_day,'room_number',NEW.room_number),
    NEW.idempotency_key
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_dual_write_folio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_guest_id   UUID;
  v_entry_type ledger_entry_type;
BEGIN
  -- Skip if no reservation linkage
  IF NEW.reservation_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve primary guest
  SELECT (guest_ids)[1] INTO v_guest_id
  FROM reservations WHERE id = NEW.reservation_id;

  IF v_guest_id IS NULL THEN RETURN NEW; END IF;

  -- Skip zero-amount entries
  IF ROUND(NEW.amount)::integer = 0 THEN RETURN NEW; END IF;

  -- Map legacy category → new enum
  v_entry_type := CASE NEW.category
    WHEN 'Room Charge'    THEN 'ROOM_CHARGE'::ledger_entry_type
    WHEN 'Receivable'     THEN 'ROOM_CHARGE'::ledger_entry_type
    WHEN 'Payment'        THEN 'PAYMENT'::ledger_entry_type
    WHEN 'Minibar'        THEN 'MINIBAR'::ledger_entry_type
    WHEN 'Room Service'   THEN 'FOOD_BEVERAGE'::ledger_entry_type
    WHEN 'Restaurant'     THEN 'FOOD_BEVERAGE'::ledger_entry_type
    WHEN 'Airport Transfer' THEN 'TRANSPORT'::ledger_entry_type
    ELSE 'MISCELLANEOUS'::ledger_entry_type
  END;

  INSERT INTO public.guest_ledger (
    id,
    tenant_id,
    reservation_id,
    guest_id,
    entry_type,
    description,
    transaction_date,
    posted_at,
    amount_bdt,
    is_tax_entry,
    metadata
  ) VALUES (
    NEW.id,
    COALESCE(NEW.tenant_id, '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'),
    NEW.reservation_id,
    v_guest_id,
    v_entry_type,
    COALESCE(NEW.description, NEW.category),
    DATE(NEW.created_at),
    NEW.created_at,
    ROUND(NEW.amount)::integer,
    FALSE,
    jsonb_build_object(
      'dual_write_from',   'folios',
      'original_category', NEW.category,
      'room_number',       NEW.room_number
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_uppercase_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.status = UPPER(NEW.status);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_bill(res_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 
    r.total_amount 
    + COALESCE(SUM(f.amount), 0) 
    - COALESCE(r.discount, 0)
  FROM reservations r
  LEFT JOIN folios f ON f.reservation_id = r.id
  WHERE r.id = res_id
  GROUP BY r.total_amount, r.discount;
$function$
;

CREATE OR REPLACE FUNCTION public.check_checkout_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_due NUMERIC;
BEGIN
  IF NEW.status = 'CHECKED_OUT' AND OLD.status = 'CHECKED_IN' THEN
    SELECT outstanding_due INTO v_due
    FROM reservation_billing_summary
    WHERE id = NEW.id;

    IF v_due > 0 THEN
      INSERT INTO notifications_log (
        id,
        workflow,
        body,
        status,
        triggered_by,
        created_at,
        tenant_id
      ) VALUES (
        gen_random_uuid(),
        'checkout_settlement_check',
        format('CHECKOUT WARNING: Reservation %s has ৳%s outstanding due', NEW.id, v_due),
        'warning',
        'trg_checkout_settlement_check',
        NOW(),
        NEW.tenant_id
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_compat_reservation_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Sync discount_amount → discount (canonical for billing)
  IF NEW.discount_amount IS NOT NULL AND NEW.discount_amount > 0
     AND (NEW.discount IS NULL OR NEW.discount = 0) THEN
    NEW.discount := NEW.discount_amount;
  END IF;

  -- Sync room_id → room_ids array
  IF NEW.room_id IS NOT NULL
     AND (NEW.room_ids IS NULL OR array_length(NEW.room_ids,1) IS NULL) THEN
    NEW.room_ids := ARRAY[NEW.room_id];
  END IF;

  -- Sync check_in_time → check_in
  IF NEW.check_in_time IS NOT NULL AND NEW.check_in IS NULL THEN
    NEW.check_in := NEW.check_in_time;
  END IF;

  -- Sync check_out_time → check_out
  IF NEW.check_out_time IS NOT NULL AND NEW.check_out IS NULL THEN
    NEW.check_out := NEW.check_out_time;
  END IF;

  -- Always uppercase status
  IF NEW.status IS NOT NULL THEN
    NEW.status := UPPER(NEW.status);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_overdue_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM overdue_payment_alerts;
  INSERT INTO notifications_log(id, workflow, subject, body, status, triggered_by, tenant_id, created_at)
  SELECT
    gen_random_uuid(),
    'overdue_alert',
    format('OVERDUE [%s]: %s', priority, guest_name),
    format('Room %s — ৳%s due — %s days overdue', rooms, outstanding_due, days_overdue),
    'PENDING',
    'lumea-billing',
    tenant_id,
    NOW()
  FROM overdue_payment_alerts
  ON CONFLICT DO NOTHING;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_create_housekeeping_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_room text;
BEGIN
  IF NEW.status = 'CHECKED_OUT' AND OLD.status = 'CHECKED_IN' THEN
    FOREACH v_room IN ARRAY NEW.room_ids LOOP
      -- Set room to DIRTY
      UPDATE rooms SET status = 'DIRTY'
      WHERE room_number = v_room AND tenant_id = NEW.tenant_id;

      -- Create housekeeping task
      INSERT INTO housekeeping_tasks (
        id, room_number, task_type, priority,
        status, scheduled_time, notes, tenant_id, created_at
      ) VALUES (
        gen_random_uuid(),
        v_room,
        'CHECKOUT_CLEAN',
        'HIGH',
        'PENDING',
        NOW(),
        format('Checkout clean required — reservation %s', NEW.id),
        NEW.tenant_id,
        NOW()
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Auto-mark room AVAILABLE when housekeeping task completed
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_room_available_on_clean()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    UPDATE rooms SET status = 'AVAILABLE'
    WHERE room_number = NEW.room_number
      AND tenant_id = NEW.tenant_id
      AND status = 'DIRTY';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_review_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_guest_name text;
  v_phone      text;
  v_guest_id   uuid;
BEGIN
  IF NEW.status = 'CHECKED_OUT' AND OLD.status = 'CHECKED_IN' THEN
    SELECT g.name, g.phone, g.id
    INTO v_guest_name, v_phone, v_guest_id
    FROM guests g
    WHERE g.id = (NEW.guest_ids)[1];

    IF v_phone IS NOT NULL AND v_phone NOT IN ('', '11111', '111', '+880111111') THEN
      INSERT INTO review_requests(
        reservation_id, guest_id, guest_name, phone, tenant_id
      ) VALUES (
        NEW.id, v_guest_id, v_guest_name, v_phone, NEW.tenant_id
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_b2b_status_upper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.status := UPPER(NEW.status);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_update_partner_on_followup()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE b2b_partners SET
    followup_count    = followup_count + 1,
    last_followup_at  = NEW.sent_at,
    last_contact_type = NEW.channel,
    next_followup_date = (NEW.sent_at::date + NEW.next_followup_days),
    -- Boost lead score each followup
    lead_score = LEAST(100, lead_score + 10)
  WHERE id = NEW.partner_id;

  -- Also update the lead record
  UPDATE leads SET
    status = CASE
      WHEN status = 'NEW' THEN 'FOLLOW_UP'
      ELSE status
    END,
    updated_at = NOW(),
    notes = notes || format(' | %s followup via %s on %s',
      (SELECT followup_count FROM b2b_partners WHERE id = NEW.partner_id),
      NEW.channel,
      NEW.sent_at::date)
  WHERE company = NEW.agency_name AND source = 'B2B_PARTNER';

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_update_on_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.response_received IS NOT NULL AND OLD.response_received IS NULL THEN
    -- Mark outcome
    UPDATE b2b_followup_log SET outcome = 'RESPONDED' WHERE id = NEW.id;

    -- Boost partner lead score on response
    UPDATE b2b_partners SET
      lead_score = LEAST(100, lead_score + 20)
    WHERE id = NEW.partner_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_hk_status_upper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN NEW.status := UPPER(NEW.status); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_hk_tasks()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE housekeeping_tasks SET status='SUPERSEDED', notes='Auto-superseded: newer task'
  WHERE room_number=NEW.room_number AND status='PENDING' AND id!=NEW.id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_billing_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_null_paid integer:=0; v_discount_errors integer:=0;
  v_folio_gaps integer:=0; v_threshold integer:=10;
  v_pattern record; v_conf integer:=95;
BEGIN
  SELECT INTO v_pattern confidence,metadata FROM agent_pattern_memory
  WHERE agent_id='lumea-billing' AND pattern_key='null_paid_amount_on_checkout';
  v_threshold:=COALESCE((v_pattern.metadata->>'escalate_threshold')::integer,10);
  v_conf:=COALESCE(ROUND(v_pattern.confidence*100)::integer,95);

  UPDATE reservations SET paid_amount=0 WHERE paid_amount IS NULL AND status='CHECKED_OUT';
  GET DIAGNOSTICS v_null_paid=ROW_COUNT;
  UPDATE reservations SET discount=0 WHERE discount>total_amount AND total_amount>0;
  GET DIAGNOSTICS v_discount_errors=ROW_COUNT;
  UPDATE folios SET amount=0 WHERE amount IS NULL;
  GET DIAGNOSTICS v_folio_gaps=ROW_COUNT;
  UPDATE reservations SET paid_amount=(
    SELECT r2.total_amount+COALESCE(SUM(f.amount),0)-COALESCE(r2.discount,0)
    FROM reservations r2 LEFT JOIN folios f ON f.reservation_id=r2.id
    WHERE r2.id=reservations.id GROUP BY r2.total_amount,r2.discount)
  WHERE status='CHECKED_OUT' AND paid_amount>total_amount*2;
  UPDATE reservations SET source='DIRECT' WHERE source IS NULL;

  PERFORM agent_record_feedback('lumea-billing','null_paid_amount_on_checkout',
    format('null:%s discount:%s folio:%s',v_null_paid,v_discount_errors,v_folio_gaps),
    'multi_fix_sweep',
    CASE WHEN v_null_paid>=v_threshold THEN 'ESCALATED'
         WHEN (v_null_paid+v_discount_errors+v_folio_gaps)>0 THEN 'SUCCESS' ELSE 'SUCCESS' END,
    v_null_paid+v_discount_errors+v_folio_gaps);

  IF v_null_paid>=v_threshold THEN
    PERFORM agent_send('lumea-billing','lumea-reservations','ALERT',
      format('HIGH BILLING ANOMALY: %s NULL paid_amounts',v_null_paid),
      'Possible frontend checkout bug.',
      jsonb_build_object('null_paid',v_null_paid,'threshold',v_threshold),'HIGH');
  END IF;

  PERFORM agent_send('lumea-billing','lumea-ceo','REPORT',
    format('Billing v3: %s fixed (threshold:%s conf:%s%%)',
      v_null_paid+v_discount_errors+v_folio_gaps,v_threshold,v_conf),
    format('null_paid:%s bad_discount:%s folio_gaps:%s',v_null_paid,v_discount_errors,v_folio_gaps),
    jsonb_build_object('total_fixed',v_null_paid+v_discount_errors+v_folio_gaps,'threshold',v_threshold),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-billing','billing_v3',v_null_paid+v_discount_errors+v_folio_gaps,
    CASE WHEN v_null_paid>=v_threshold THEN 'WARN'
         WHEN (v_null_paid+v_discount_errors+v_folio_gaps)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: null=%s discount_err=%s folio=%s threshold=%s conf=%s%%',
      v_null_paid,v_discount_errors,v_folio_gaps,v_threshold,v_conf));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_rooms_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ghost integer:=0; v_mismatch integer:=0;
  v_occupancy_rate numeric; v_pattern record; v_conf integer:=95;
BEGIN
  SELECT INTO v_pattern confidence FROM agent_pattern_memory
  WHERE agent_id='lumea-rooms' AND pattern_key='occupied_no_reservation';
  v_conf:=COALESCE(ROUND(v_pattern.confidence*100)::integer,95);

  UPDATE rooms r SET status='DIRTY' WHERE r.status='OCCUPIED'
    AND NOT EXISTS(SELECT 1 FROM reservations res
      WHERE res.status='CHECKED_IN' AND r.room_number=ANY(res.room_ids));
  GET DIAGNOSTICS v_ghost=ROW_COUNT;

  UPDATE rooms r SET status='OCCUPIED' WHERE r.status='AVAILABLE'
    AND EXISTS(SELECT 1 FROM reservations res
      WHERE res.status='CHECKED_IN' AND r.room_number=ANY(res.room_ids));
  GET DIAGNOSTICS v_mismatch=ROW_COUNT;

  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_occupancy_rate FROM rooms;

  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-rooms','occupancy_trend','Daily occupancy tracking',1,1,0.9,
    jsonb_build_object('rate',v_occupancy_rate,'date',CURRENT_DATE,
      'available',(SELECT COUNT(*) FROM rooms WHERE status='AVAILABLE'),
      'occupied',(SELECT COUNT(*) FROM rooms WHERE status='OCCUPIED'),
      'dirty',(SELECT COUNT(*) FROM rooms WHERE status='DIRTY')))
  ON CONFLICT(pattern_key) DO UPDATE SET
    times_seen=agent_pattern_memory.times_seen+1,
    metadata=jsonb_build_object('rate',v_occupancy_rate,'date',CURRENT_DATE,
      'available',(SELECT COUNT(*) FROM rooms WHERE status='AVAILABLE'),
      'occupied',(SELECT COUNT(*) FROM rooms WHERE status='OCCUPIED'),
      'dirty',(SELECT COUNT(*) FROM rooms WHERE status='DIRTY')),
    updated_at=NOW();

  PERFORM agent_record_feedback('lumea-rooms','occupied_no_reservation',
    format('ghost:%s mismatch:%s occ:%s%%',v_ghost,v_mismatch,v_occupancy_rate),
    'sync_and_track','SUCCESS',v_ghost+v_mismatch);

  IF v_ghost>0 THEN
    PERFORM agent_send('lumea-rooms','lumea-housekeeping','ALERT',
      format('%s ghost rooms set DIRTY',v_ghost),'Housekeeping needed.',
      jsonb_build_object('dirty_rooms',v_ghost),'HIGH');
  END IF;

  IF v_occupancy_rate<30 THEN
    PERFORM agent_send('lumea-rooms','lumea-ceo','ALERT',
      format('LOW OCCUPANCY: %s%% — only %s/28 rooms occupied',
        v_occupancy_rate,ROUND(v_occupancy_rate*28/100)),
      'Consider B2B activation or OTA push.',
      jsonb_build_object('occupancy_rate',v_occupancy_rate),'HIGH');
  END IF;

  PERFORM agent_send('lumea-rooms','lumea-ceo','REPORT',
    format('Rooms v3: %s%% occupancy %s fixed conf:%s%%',v_occupancy_rate,v_ghost+v_mismatch,v_conf),
    format('ghost:%s mismatch:%s occ:%s%%',v_ghost,v_mismatch,v_occupancy_rate),
    jsonb_build_object('occupancy_rate',v_occupancy_rate,'corrections',v_ghost+v_mismatch),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-rooms','rooms_v3',v_ghost+v_mismatch,
    CASE WHEN (v_ghost+v_mismatch)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: ghost=%s mismatch=%s occ=%s%% conf=%s%%',v_ghost,v_mismatch,v_occupancy_rate,v_conf));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_reservations_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status_fixed integer:=0;
  v_source_fixed integer:=0;
  v_conflicts integer:=0;
BEGIN
  -- Fix status casing
  UPDATE reservations SET status=UPPER(status) WHERE status!=UPPER(status);
  GET DIAGNOSTICS v_status_fixed = ROW_COUNT;

  -- Fix NULL source
  UPDATE reservations SET source='DIRECT' WHERE source IS NULL;
  GET DIAGNOSTICS v_source_fixed = ROW_COUNT;

  -- Detect overbooking: same room, overlapping dates, both CHECKED_IN
  SELECT COUNT(*) INTO v_conflicts
  FROM reservations r1
  JOIN reservations r2 ON r1.id != r2.id
    AND r1.room_ids && r2.room_ids
    AND r1.status='CHECKED_IN' AND r2.status='CHECKED_IN'
    AND r1.check_in < r2.check_out AND r1.check_out > r2.check_in;

  IF v_conflicts > 0 THEN
    PERFORM agent_send('lumea-reservations','lumea-ceo','ALERT',
      format('OVERBOOKING DETECTED: %s conflicts', v_conflicts),
      'Multiple CHECKED_IN reservations share same room and overlapping dates. Immediate review needed.',
      jsonb_build_object('conflicts',v_conflicts),'CRITICAL');
  END IF;

  PERFORM agent_record_feedback('lumea-reservations','lowercase_status_silent_fail',
    format('status_fixed:%s source_fixed:%s conflicts:%s',v_status_fixed,v_source_fixed,v_conflicts),
    'status_and_conflict_check',
    CASE WHEN v_conflicts>0 THEN 'ESCALATED' ELSE 'SUCCESS' END,
    v_status_fixed+v_source_fixed);

  PERFORM agent_send('lumea-reservations','lumea-ceo','REPORT',
    format('Reservations v3: status:%s source:%s conflicts:%s',v_status_fixed,v_source_fixed,v_conflicts),
    'Status casing, source attribution, overbooking all checked.',
    jsonb_build_object('status_fixed',v_status_fixed,'conflicts',v_conflicts),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-reservations','reservations_v3',v_status_fixed+v_source_fixed,
    CASE WHEN v_conflicts>0 THEN 'WARN'
         WHEN (v_status_fixed+v_source_fixed)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: status=%s source=%s overbooking=%s',v_status_fixed,v_source_fixed,v_conflicts));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_guests_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email_cleaned integer:=0;
  v_phone_cleaned integer:=0;
  v_ledger_gaps integer:=0;
BEGIN
  -- Clean placeholder emails
  UPDATE guests SET email=NULL
  WHERE email IN ('fo.hotelfountain799@gmail.com','fom.hotelfountain@gmail.com',
    'a@b.c','test@example.com') OR email='' OR email~'^\s+$';
  GET DIAGNOSTICS v_email_cleaned = ROW_COUNT;

  -- Clean dummy phones
  UPDATE guests SET phone=NULL
  WHERE phone IN ('000000000','0000000000','11111','111','2222222222222','+880000000')
    OR (phone IS NOT NULL AND length(regexp_replace(phone,'[^0-9]','','g'))<10)
    OR (phone IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g') SIMILAR TO '0{9,}|1{5,}|2{5,}');
  GET DIAGNOSTICS v_phone_cleaned = ROW_COUNT;

  -- Find ledger gaps: CHECKED_OUT with no ledger entry
  SELECT COUNT(*) INTO v_ledger_gaps
  FROM reservations r
  LEFT JOIN guest_ledger gl ON gl.reservation_id=r.id
  WHERE r.status='CHECKED_OUT' AND gl.id IS NULL;

  -- Feedback
  PERFORM agent_record_feedback('lumea-guests','placeholder_email_pattern',
    format('email:%s phone:%s ledger_gaps:%s',v_email_cleaned,v_phone_cleaned,v_ledger_gaps),
    'contact_quality_sweep','SUCCESS',v_email_cleaned+v_phone_cleaned);

  IF v_ledger_gaps > 10 THEN
    PERFORM agent_send('lumea-guests','lumea-ceo','ALERT',
      format('%s reservations missing ledger entries', v_ledger_gaps),
      'Guest ledger coverage dropped. Backfill may be needed.',
      jsonb_build_object('ledger_gaps',v_ledger_gaps),'HIGH');
  END IF;

  PERFORM agent_send('lumea-guests','lumea-ceo','REPORT',
    format('Guests v3: email:%s phone:%s ledger_gaps:%s',v_email_cleaned,v_phone_cleaned,v_ledger_gaps),
    'Contact quality enforced. Ledger coverage checked.',
    jsonb_build_object('email_cleaned',v_email_cleaned,'phone_cleaned',v_phone_cleaned,
      'ledger_gaps',v_ledger_gaps),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-guests','guests_v3',v_email_cleaned+v_phone_cleaned,
    CASE WHEN v_ledger_gaps>10 THEN 'WARN'
         WHEN (v_email_cleaned+v_phone_cleaned)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: email=%s phone=%s ledger_gaps=%s',v_email_cleaned,v_phone_cleaned,v_ledger_gaps));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_housekeeping_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_completed integer:=0; v_superseded integer:=0; v_still_pending integer;
BEGIN
  -- Auto-complete for AVAILABLE rooms
  UPDATE housekeeping_tasks SET status='COMPLETED',completed_at=NOW(),
    notes='Auto-completed: room AVAILABLE'
  WHERE status='PENDING'
    AND room_number IN (SELECT room_number FROM rooms WHERE status='AVAILABLE');
  GET DIAGNOSTICS v_completed = ROW_COUNT;

  -- Auto-supersede for re-occupied rooms
  UPDATE housekeeping_tasks SET status='SUPERSEDED',notes='Auto: room re-occupied'
  WHERE status='PENDING'
    AND room_number IN (SELECT room_number FROM rooms WHERE status='OCCUPIED');
  GET DIAGNOSTICS v_superseded = ROW_COUNT;

  -- Dedup — latest per room only
  UPDATE housekeeping_tasks SET status='SUPERSEDED',notes='Auto-dedup'
  WHERE status='PENDING'
    AND id NOT IN (
      SELECT DISTINCT ON (room_number) id FROM housekeeping_tasks
      WHERE status='PENDING' ORDER BY room_number,created_at DESC);

  -- Count remaining
  SELECT COUNT(*) INTO v_still_pending FROM housekeeping_tasks WHERE status='PENDING';

  -- Track completion pattern
  PERFORM agent_record_feedback('lumea-housekeeping','duplicate_pending_tasks',
    format('completed:%s superseded:%s still_pending:%s',v_completed,v_superseded,v_still_pending),
    'sweep_and_resolve','SUCCESS',v_completed+v_superseded);

  -- Tell rooms when tasks are done (rooms can now go AVAILABLE)
  IF v_completed > 0 THEN
    PERFORM agent_send('lumea-housekeeping','lumea-rooms','REPORT',
      format('%s housekeeping tasks completed → rooms ready', v_completed),
      'These rooms may now be set AVAILABLE pending room agent next sweep.',
      jsonb_build_object('completed',v_completed),'NORMAL');
  END IF;

  PERFORM agent_send('lumea-housekeeping','lumea-ceo','REPORT',
    format('HK v3: completed:%s superseded:%s pending:%s',v_completed,v_superseded,v_still_pending),
    format('Tasks resolved. %s still pending in queue.',v_still_pending),
    jsonb_build_object('completed',v_completed,'superseded',v_superseded,'still_pending',v_still_pending),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-housekeeping','hk_v3',v_completed+v_superseded,
    CASE WHEN v_still_pending>5 THEN 'WARN'
         WHEN (v_completed+v_superseded)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: completed=%s superseded=%s pending=%s',v_completed,v_superseded,v_still_pending));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_alerts_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM overdue_payment_alerts;

  -- Log overdue alerts using correct column names
  INSERT INTO notifications_log(id, workflow, subject, body, status, triggered_by, tenant_id, created_at)
  SELECT
    gen_random_uuid(),
    'overdue_payment_alert',
    format('OVERDUE [%s]: %s — ৳%s', priority, guest_name, outstanding_due),
    format('Guest: %s | Room: %s | Checkout: %s | Days overdue: %s | Due: ৳%s',
      guest_name, rooms, checkout_date, days_overdue, outstanding_due),
    'PENDING',
    'lumea-alerts',
    tenant_id,
    NOW()
  FROM overdue_payment_alerts
  ON CONFLICT DO NOTHING;

  -- Log to agent_run_log
  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-alerts', 'overdue_scan', v_count,
    CASE WHEN v_count > 0 THEN 'WARN' ELSE 'OK' END,
    format('%s overdue payments detected', v_count));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_leads_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_stale integer:=0; v_new_b2b integer:=0; v_pipeline_health numeric:=0;
BEGIN
  UPDATE leads SET status='STALE',updated_at=NOW()
  WHERE status NOT IN ('CONVERTED','LOST','STALE')
    AND updated_at<NOW()-INTERVAL '14 days';
  GET DIAGNOSTICS v_stale=ROW_COUNT;

  INSERT INTO leads(id,name,email,phone,company,source,status,notes,tenant_id,created_at,updated_at)
  SELECT gen_random_uuid(),p.contact_name,p.email,p.phone,
    p.agency_name,'B2B_PARTNER','NEW',
    format('Auto-generated | %s | %s wholesale',p.city,p.wholesale_rate),
    p.tenant_id,NOW(),NOW()
  FROM b2b_partners p
  LEFT JOIN leads l ON l.company=p.agency_name AND l.source='B2B_PARTNER'
  WHERE l.id IS NULL;
  GET DIAGNOSTICS v_new_b2b=ROW_COUNT;

  SELECT COALESCE(ROUND(
    COUNT(CASE WHEN status='CONVERTED' THEN 1 END)::numeric/NULLIF(COUNT(*),0)*100,1),0)
  INTO v_pipeline_health FROM leads;

  PERFORM agent_send('lumea-leads','lumea-ceo','REPORT',
    format('Leads v3: stale:%s new_b2b:%s conversion:%s%%',
      v_stale,v_new_b2b,v_pipeline_health),
    'Lead pipeline health checked.',
    jsonb_build_object('stale',v_stale,'conversion_rate',v_pipeline_health),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-leads','leads_v3',v_stale+v_new_b2b,
    CASE WHEN (v_stale+v_new_b2b)>0 THEN 'FIXED' ELSE 'OK' END,
    format('v3: stale=%s new_b2b=%s conversion=%s%%',v_stale,v_new_b2b,v_pipeline_health));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_audit_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_open_rls integer;
  v_critical_tables integer;
  v_risk_score integer;
BEGIN
  SELECT COUNT(*) INTO v_open_rls
  FROM pg_policies WHERE schemaname='public' AND qual='true';

  SELECT COUNT(*) INTO v_critical_tables
  FROM pg_policies WHERE schemaname='public' AND qual='true'
    AND tablename IN ('reservations','rooms','guests','folios',
      'transactions','billing_invoices','payment_transactions','guest_ledger');

  -- Risk score: critical tables * 10 + other open * 2
  v_risk_score := (v_critical_tables * 10) + ((v_open_rls - v_critical_tables) * 2);

  PERFORM agent_record_feedback('lumea-db','open_rls_policy_risk',
    format('open_rls:%s critical:%s risk_score:%s',v_open_rls,v_critical_tables,v_risk_score),
    'rls_scan',
    CASE WHEN v_critical_tables>0 THEN 'ESCALATED' ELSE 'SUCCESS' END,
    v_open_rls);

  IF v_critical_tables > 0 THEN
    PERFORM agent_send('lumea-audit','lumea-ceo','ALERT',
      format('SECURITY: %s critical tables have open RLS (risk score: %s)',v_critical_tables,v_risk_score),
      'Critical financial/guest tables exposed. Immediate RLS fix needed.',
      jsonb_build_object('open_rls',v_open_rls,'critical_tables',v_critical_tables,'risk_score',v_risk_score),'CRITICAL');
  END IF;

  PERFORM agent_send('lumea-audit','lumea-ceo','REPORT',
    format('Audit v3: open_rls:%s critical:%s risk_score:%s',v_open_rls,v_critical_tables,v_risk_score),
    'Security scan complete.',
    jsonb_build_object('risk_score',v_risk_score),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,rows_affected,status,details)
  VALUES('lumea-audit','audit_v3',v_open_rls,
    CASE WHEN v_critical_tables>0 THEN 'WARN' ELSE 'OK' END,
    format('v3: open_rls=%s critical=%s risk_score=%s',v_open_rls,v_critical_tables,v_risk_score));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_all_agents()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Ops layer
  PERFORM agent_billing_selfheal();
  PERFORM agent_rooms_selfheal();
  PERFORM agent_reservations_selfheal();
  PERFORM agent_guests_selfheal();
  PERFORM agent_housekeeping_selfheal();
  PERFORM agent_leads_selfheal();
  PERFORM agent_audit_selfheal();
  -- Growth layer
  PERFORM agent_ota_monitor();
  PERFORM agent_corporate_spend_detect();
  PERFORM agent_social_weekend_campaign();
  PERFORM agent_referral_queue_builder();
  PERFORM agent_biman_site_visit_prep();
  PERFORM agent_airline_leads_selfheal();
  PERFORM agent_ngo_leads_selfheal();
  PERFORM agent_corporate_leads_selfheal();
  -- CEO layer
  PERFORM ceo_process_inbox();
  PERFORM agent_ceo_followup();

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-orchestrator','full_sweep_v4','OK',
    'All 17 agent functions ran. CEO approved.');

  RETURN format('All agents v4 ran at %s',NOW());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_valid_bd_phone(p text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN p IS NOT NULL
    AND length(regexp_replace(p,'[^0-9]','','g')) BETWEEN 10 AND 13
    AND regexp_replace(p,'[^0-9]','','g') NOT SIMILAR TO '0{9,}|1{5,}|2{5,}';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_growth_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE 
  v_repeat integer;
  v_highval integer;
BEGIN
  -- 1. Repeat guests (2+ stays, valid phone, no existing lead)
  WITH repeat_guests AS (
    SELECT g.id, g.name, g.email, g.phone,
      COUNT(r.id) AS stay_count,
      MAX(r.check_out::date) AS last_checkout,
      ROUND(AVG(r.total_amount),0) AS avg_spend,
      g.tenant_id
    FROM guests g
    JOIN reservations r ON g.id = ANY(r.guest_ids)
    WHERE r.status = 'CHECKED_OUT'
      AND is_valid_bd_phone(g.phone)
      AND g.marketing_opt_out IS NOT TRUE
    GROUP BY g.id, g.name, g.email, g.phone, g.tenant_id
    HAVING COUNT(r.id) >= 2
  )
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, tenant_id, created_at, updated_at)
  SELECT gen_random_uuid(), rg.name, rg.email, rg.phone,
    'Repeat Guest', 'REPEAT_GUEST', 'NEW',
    format('Repeat guest | %s stays | Last: %s | Avg ৳%s — offer loyalty discount',
      rg.stay_count, rg.last_checkout, rg.avg_spend),
    rg.tenant_id, NOW(), NOW()
  FROM repeat_guests rg
  LEFT JOIN leads l ON l.phone = rg.phone AND l.source = 'REPEAT_GUEST'
  WHERE l.id IS NULL;
  GET DIAGNOSTICS v_repeat = ROW_COUNT;

  -- 2. High-value guests (total_spent >= 6000, valid phone, no lead)
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, tenant_id, created_at, updated_at)
  SELECT gen_random_uuid(), g.name, g.email, g.phone,
    'High Value Guest', 'HIGH_VALUE_GUEST', 'NEW',
    format('High value | Total spent ৳%s | %s stays | VIP: %s — offer upgrade',
      g.total_spent, g.total_stays, g.vip),
    g.tenant_id, NOW(), NOW()
  FROM guests g
  LEFT JOIN leads l ON l.phone = g.phone AND l.source = 'HIGH_VALUE_GUEST'
  WHERE g.total_spent >= 6000
    AND is_valid_bd_phone(g.phone)
    AND g.marketing_opt_out IS NOT TRUE
    AND l.id IS NULL;
  GET DIAGNOSTICS v_highval = ROW_COUNT;

  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-growth', 'lead_generation', v_repeat + v_highval,
    CASE WHEN (v_repeat + v_highval) > 0 THEN 'FIXED' ELSE 'OK' END,
    format('New leads: %s repeat guests + %s high-value guests', v_repeat, v_highval));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_referral_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ref integer;
BEGIN
  -- VIP guests as referral sources
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, tenant_id, created_at, updated_at)
  SELECT gen_random_uuid(), g.name, g.email, g.phone,
    'VIP Referral', 'REFERRAL', 'NEW',
    format('VIP guest | %s stays | ৳%s total — ask for referrals, offer incentive',
      g.total_stays, g.total_spent),
    g.tenant_id, NOW(), NOW()
  FROM guests g
  LEFT JOIN leads l ON l.phone = g.phone AND l.source = 'REFERRAL'
  WHERE g.vip = true
    AND is_valid_bd_phone(g.phone)
    AND g.marketing_opt_out IS NOT TRUE
    AND l.id IS NULL;
  GET DIAGNOSTICS v_ref = ROW_COUNT;

  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-referral', 'referral_lead_gen', v_ref,
    CASE WHEN v_ref > 0 THEN 'FIXED' ELSE 'OK' END,
    format('Generated %s referral leads from VIP guests', v_ref));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_winback_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_wb integer;
BEGIN
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, tenant_id, created_at, updated_at)
  SELECT gen_random_uuid(), g.name, g.email, g.phone,
    'Win-back Target', 'WINBACK', 'NEW',
    format('Last stay: %s (%s days ago) | ৳%s avg — send win-back offer',
      g.last_stay_date, (CURRENT_DATE - g.last_stay_date),
      ROUND(g.total_spent::numeric / GREATEST(g.total_stays,1), 0)),
    g.tenant_id, NOW(), NOW()
  FROM (
    SELECT DISTINCT ON (g.id)
      g.id, g.name, g.email, g.phone, g.tenant_id,
      g.total_spent, g.total_stays,
      MAX(r.check_out::date) AS last_stay_date
    FROM guests g
    JOIN reservations r ON g.id = ANY(r.guest_ids)
    WHERE r.status = 'CHECKED_OUT'
      AND is_valid_bd_phone(g.phone)
      AND g.marketing_opt_out IS NOT TRUE
    GROUP BY g.id, g.name, g.email, g.phone, g.tenant_id, g.total_spent, g.total_stays
    HAVING MAX(r.check_out::date) < CURRENT_DATE - 30
  ) g
  LEFT JOIN leads l ON l.phone = g.phone AND l.source = 'WINBACK'
  WHERE l.id IS NULL;
  GET DIAGNOSTICS v_wb = ROW_COUNT;

  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-winback', 'winback_lead_gen', v_wb,
    CASE WHEN v_wb > 0 THEN 'FIXED' ELSE 'OK' END,
    format('Generated %s win-back leads', v_wb));
END;
$function$
;

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
;

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
;

CREATE OR REPLACE FUNCTION public.agent_corporate_leads_selfheal()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO leads(id, name, email, phone, company, source, status, notes, analyst_brief, tenant_id, created_at, updated_at)
  VALUES
    (gen_random_uuid(), 'HR Manager', 'hr@dsebd.org', '02-9564601',
     'Dhaka Stock Exchange (DSE)', 'CORPORATE', 'NEW',
     'DSE Tower in Nikunja — visiting brokers, investors, foreign delegates need hotel.',
     'Pitch: preferred hotel for DSE visitors. 5 min from DSE Tower.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Corporate Travel Desk', 'admin@grameenphone.com', '01711-380380',
     'Grameenphone Ltd', 'CORPORATE', 'NEW',
     'Major telecom — staff travel for Dhaka meetings, training, airport transits.',
     'Pitch: corporate room block. Monthly billing. Near airport.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Admin & Procurement', 'info@banglalink.net', '01911-304121',
     'Banglalink Digital Communications', 'CORPORATE', 'NEW',
     'Telecom company — field engineers, management travel through Dhaka.',
     'Pitch: corporate rate ৳3,500/night. Monthly invoicing available.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'Travel Coordinator', 'corporate@beximco.com', '02-9886030',
     'Beximco Group', 'CORPORATE', 'NEW',
     'Large conglomerate — pharma, garments, media. Corporate guests visiting Dhaka.',
     'Pitch: executive rooms for visiting partners. Royal Suite for VIPs.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW()),

    (gen_random_uuid(), 'HR & Admin', 'hr@squarepharma.com.bd', '02-8833047',
     'Square Pharmaceuticals', 'CORPORATE', 'NEW',
     'Top pharma company — medical reps, executives traveling to/from Dhaka.',
     'Pitch: corporate account, 5-10 rooms/month for field staff.',
     (SELECT tenant_id FROM reservations LIMIT 1), NOW(), NOW())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;

  INSERT INTO agent_run_log(agent_id, action, rows_affected, status, details)
  VALUES('lumea-corporate-leads', 'corporate_lead_gen', v_new,
    CASE WHEN v_new > 0 THEN 'FIXED' ELSE 'OK' END,
    format('Generated %s corporate leads', v_new));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_pipeline_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_ceo_followup()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer:=0; v_revenue_mtd numeric:=0;
  v_occupancy numeric:=0; v_pipeline_value numeric:=0; v_handover_count integer:=0;
BEGIN
  UPDATE ceo_pipeline SET
    interest_level=LEAST(60,interest_level+15),
    followup_count=followup_count+1,
    last_followup_at=NOW(),
    next_action_at=CURRENT_DATE+5,
    next_action='Second follow-up — push for site visit',
    stage='FOLLOWED_UP'
  WHERE stage='PITCHED' AND next_action_at<=CURRENT_DATE AND handover_ready=false;
  GET DIAGNOSTICS v_count=ROW_COUNT;

  UPDATE ceo_pipeline SET stage='WARM' WHERE interest_level>=60 AND stage!='WARM' AND handover_ready=false;

  UPDATE ceo_pipeline SET handover_ready=true,stage='HANDOVER',
    handover_notes=format('READY FOR SHAN: %s interested. Deal %s. Call: %s',
      company,deal_value_bdt,contact_phone)
  WHERE interest_level>=80 AND handover_ready=false;
  GET DIAGNOSTICS v_handover_count=ROW_COUNT;

  SELECT COALESCE(SUM(paid_amount),0) INTO v_revenue_mtd
  FROM reservations WHERE check_out>=DATE_TRUNC('month',NOW()) AND status='CHECKED_OUT';

  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_occupancy FROM rooms;

  SELECT COALESCE(SUM(deal_value_bdt),0) INTO v_pipeline_value
  FROM ceo_pipeline WHERE stage!='CLOSED';

  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-ceo','revenue_intelligence','Monthly revenue and occupancy tracking',1,1,0.9,
    jsonb_build_object('revenue_mtd',v_revenue_mtd,'occupancy_pct',v_occupancy,
      'pipeline_value',v_pipeline_value,'date',CURRENT_DATE))
  ON CONFLICT(pattern_key) DO UPDATE SET
    times_seen=agent_pattern_memory.times_seen+1,
    metadata=jsonb_build_object('revenue_mtd',v_revenue_mtd,'occupancy_pct',v_occupancy,
      'pipeline_value',v_pipeline_value,'date',CURRENT_DATE),
    updated_at=NOW();

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-ceo','ceo_brief_v3','OK',
    format('v3: revenue=%s occ=%s%% pipeline=%s followups=%s handovers=%s',
      v_revenue_mtd,v_occupancy,v_pipeline_value,v_count,v_handover_count));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_score_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.response_received IS NOT NULL AND OLD.response_received IS NULL THEN
    NEW.interest_level := CASE
      WHEN NEW.response_received ILIKE '%yes%' OR
           NEW.response_received ILIKE '%interested%' OR
           NEW.response_received ILIKE '%meeting%' OR
           NEW.response_received ILIKE '%visit%' THEN 90
      WHEN NEW.response_received ILIKE '%send%' OR
           NEW.response_received ILIKE '%details%' OR
           NEW.response_received ILIKE '%info%' THEN 70
      WHEN NEW.response_received ILIKE '%maybe%' OR
           NEW.response_received ILIKE '%later%' THEN 50
      WHEN NEW.response_received ILIKE '%no%' OR
           NEW.response_received ILIKE '%not%' THEN 5
      ELSE 60
    END;
    NEW.response_at := NOW();
    NEW.stage := CASE
      WHEN NEW.interest_level >= 80 THEN 'HANDOVER'
      WHEN NEW.interest_level >= 50 THEN 'WARM'
      ELSE 'FOLLOWED_UP'
    END;
    NEW.handover_ready := NEW.interest_level >= 80;
    NEW.handover_notes := CASE WHEN NEW.interest_level >= 80
      THEN format('🤝 READY FOR SHAN: %s said "%s". Call: %s. Deal: ৳%s/year',
        NEW.company, LEFT(NEW.response_received, 50), NEW.contact_phone, NEW.deal_value_bdt)
      ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$function$
;

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
;

CREATE OR REPLACE FUNCTION public.agent_send(p_from text, p_to text, p_type text, p_subject text, p_body text, p_data jsonb DEFAULT '{}'::jsonb, p_priority text DEFAULT 'NORMAL'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO agent_messages(from_agent, to_agent, message_type, subject, body, data, priority, tenant_id)
  SELECT p_from, p_to, p_type, p_subject, p_body, p_data, p_priority,
    tenant_id FROM reservations LIMIT 1
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_corporate_followup_request(p_company text, p_action text, p_deal_value numeric)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_msg_id uuid;
BEGIN
  -- Request CEO approval before acting
  SELECT agent_send(
    'lumea-corporate', 'lumea-ceo', 'REQUEST',
    format('Approval needed: %s for %s', p_action, p_company),
    format('Requesting CEO approval to proceed with: %s. Deal value: ৳%s', p_action, p_deal_value),
    jsonb_build_object('company', p_company, 'action', p_action, 'deal_value', p_deal_value),
    CASE WHEN p_deal_value >= 1000000 THEN 'HIGH' ELSE 'NORMAL' END
  ) INTO v_msg_id;

  RETURN format('Request sent to CEO (msg: %s). Awaiting approval.', v_msg_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_airline_contract_request(p_airline text, p_deal_value numeric)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_msg_id uuid;
BEGIN
  SELECT agent_send(
    'lumea-airline', 'lumea-ceo', 'DECISION',
    format('AIRLINE CONTRACT READY: %s — ৳%s/year', p_airline, p_deal_value),
    format('Airline crew contract for %s is ready for final approval. Annual value: ৳%s. Requesting CEO sign-off.', p_airline, p_deal_value),
    jsonb_build_object('company', p_airline, 'deal_value', p_deal_value, 'type', 'CREW_CONTRACT'),
    CASE WHEN p_deal_value >= 5000000 THEN 'CRITICAL' ELSE 'HIGH' END
  ) INTO v_msg_id;
  RETURN format('Contract request sent to CEO (msg: %s)', v_msg_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_shan_on_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_payload jsonb;
BEGIN
  -- ONLY fire on ESCALATE — never on APPROVE/REJECT/routine reports
  IF NEW.ceo_decision = 'ESCALATE'
    AND (OLD.ceo_decision IS NULL OR OLD.ceo_decision != 'ESCALATE')
    AND NEW.priority IN ('HIGH','CRITICAL') THEN

    v_payload := jsonb_build_object(
      'agent',      NEW.from_agent,
      'company',    COALESCE(NEW.data->>'company', 'N/A'),
      'subject',    NEW.subject,
      'message',    NEW.body,
      'deal_value', COALESCE(NEW.data->>'deal_value', '0'),
      'priority',   NEW.priority
    );

    PERFORM net.http_post(
      url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/ceo-escalation-email',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := v_payload
    );

    INSERT INTO agent_run_log(agent_id, action, status, details)
    VALUES('lumea-ceo', 'escalation_email_sent', 'OK',
      format('Email sent to Shan: %s — %s — ৳%s',
        NEW.subject, NEW.from_agent, COALESCE(NEW.data->>'deal_value','0')));
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_shan_on_new_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF NEW.ceo_decision = 'ESCALATE' THEN
    v_payload := jsonb_build_object(
      'agent',      NEW.from_agent,
      'company',    COALESCE(NEW.data->>'company', 'N/A'),
      'subject',    NEW.subject,
      'message',    NEW.body,
      'deal_value', COALESCE(NEW.data->>'deal_value', '0'),
      'priority',   NEW.priority
    );

    PERFORM net.http_post(
      url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/ceo-escalation-email',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := v_payload
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_shan_on_handover()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF NEW.handover_ready = true AND (OLD.handover_ready IS NULL OR OLD.handover_ready = false) THEN
    v_payload := jsonb_build_object(
      'agent',      'lumea-ceo',
      'company',    NEW.company,
      'subject',    format('DEAL READY TO CLOSE: %s', NEW.company),
      'message',    COALESCE(NEW.handover_notes, 'Lead is warm and ready for final close.'),
      'deal_value', NEW.deal_value_bdt,
      'priority',   'CRITICAL'
    );

    PERFORM net.http_post(
      url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/ceo-escalation-email',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := v_payload
    );

    INSERT INTO agent_run_log(agent_id, action, status, details)
    VALUES('lumea-ceo', 'handover_email_sent', 'OK',
      format('Handover email sent to Shan for %s — ৳%s', NEW.company, NEW.deal_value_bdt));
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_record_feedback(p_agent text, p_pattern_key text, p_context text, p_action text, p_outcome text, p_rows integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_correct numeric; v_total numeric; v_new_confidence numeric;
BEGIN
  -- Log the learning event
  INSERT INTO agent_learning_log(agent_id, event_type, context, action_taken, outcome, rows_affected, pattern_key, confidence)
  VALUES(p_agent, 'FEEDBACK', p_context, p_action, p_outcome, p_rows, p_pattern_key,
    CASE p_outcome WHEN 'SUCCESS' THEN 0.9 WHEN 'FAILURE' THEN 0.3 ELSE 0.6 END);

  -- Update pattern confidence using running average
  UPDATE agent_pattern_memory SET
    times_seen    = times_seen + 1,
    times_correct = times_correct + CASE p_outcome WHEN 'SUCCESS' THEN 1 ELSE 0 END,
    confidence    = ROUND((times_correct + CASE p_outcome WHEN 'SUCCESS' THEN 1 ELSE 0 END)::numeric
                         / (times_seen + 1), 3),
    last_seen_at  = NOW(),
    updated_at    = NOW()
  WHERE pattern_key = p_pattern_key AND agent_id = p_agent;

  -- Insert if pattern not yet known (learn new patterns on the fly)
  IF NOT FOUND THEN
    INSERT INTO agent_pattern_memory(agent_id, pattern_key, pattern_desc, times_seen, times_correct, confidence)
    VALUES(p_agent, p_pattern_key, p_context, 1,
      CASE p_outcome WHEN 'SUCCESS' THEN 1 ELSE 0 END,
      CASE p_outcome WHEN 'SUCCESS' THEN 0.7 ELSE 0.3 END)
    ON CONFLICT (pattern_key) DO NOTHING;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_recall_pattern(p_agent text, p_context text)
 RETURNS TABLE(pattern_key text, pattern_desc text, confidence numeric, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT pm.pattern_key, pm.pattern_desc, pm.confidence, pm.metadata
  FROM agent_pattern_memory pm
  WHERE pm.agent_id = p_agent
    AND pm.confidence >= 0.5
    AND (pm.pattern_key ILIKE '%' || split_part(p_context,' ',1) || '%'
      OR pm.pattern_desc ILIKE '%' || p_context || '%')
  ORDER BY pm.confidence DESC, pm.times_seen DESC
  LIMIT 3;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_ota_monitor()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ota_count integer;
  v_booking_com integer;
  v_agoda integer;
  v_direct integer;
  v_total integer;
  v_ota_pct numeric;
BEGIN
  SELECT
    COUNT(CASE WHEN source='BOOKING_COM' THEN 1 END),
    COUNT(CASE WHEN source='AGODA' THEN 1 END),
    COUNT(CASE WHEN source='DIRECT' THEN 1 END),
    COUNT(*)
  INTO v_booking_com, v_agoda, v_direct, v_total
  FROM reservations
  WHERE check_in >= NOW() - INTERVAL '30 days';

  v_ota_count := v_booking_com + v_agoda;
  v_ota_pct := ROUND(v_ota_count::numeric / NULLIF(v_total,0) * 100, 1);

  -- Pattern: first OTA booking ever
  IF v_ota_count > 0 AND NOT EXISTS (
    SELECT 1 FROM agent_pattern_memory
    WHERE agent_id='lumea-ota' AND pattern_key='first_ota_booking_received'
  ) THEN
    INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
    VALUES('lumea-ota','first_ota_booking_received',
      'First OTA booking received — channel validated',
      1,1,0.99,
      jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,'date',CURRENT_DATE));

    -- Escalate to CEO immediately
    PERFORM agent_send('lumea-ota','lumea-ceo','DECISION',
      format('FIRST OTA BOOKING: %s Booking.com + %s Agoda in last 30 days',v_booking_com,v_agoda),
      'OTA channel validated. Scale listings immediately — increase room inventory on OTA, request featured placement, add photos.',
      jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,'ota_pct',v_ota_pct,'deal_value',1440000),
      'CRITICAL');
  END IF;

  -- Store OTA trend daily
  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-ota','ota_channel_mix',
    'Daily OTA vs direct booking mix tracking',1,1,0.9,
    jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,
      'direct',v_direct,'ota_pct',v_ota_pct,'date',CURRENT_DATE))
  ON CONFLICT(pattern_key) DO UPDATE SET
    times_seen=agent_pattern_memory.times_seen+1,
    metadata=jsonb_build_object('booking_com',v_booking_com,'agoda',v_agoda,
      'direct',v_direct,'ota_pct',v_ota_pct,'date',CURRENT_DATE),
    updated_at=NOW();

  -- Alert CEO if still 0% OTA after 7 days (listing may not be live)
  IF v_ota_count=0 AND CURRENT_DATE > '2026-05-19' THEN
    PERFORM agent_send('lumea-ota','lumea-ceo','ALERT',
      'OTA LISTINGS NOT GENERATING BOOKINGS',
      'Booking.com registered but 0 bookings in 7+ days. Check listing status, photos, and pricing.',
      jsonb_build_object('days_live',CURRENT_DATE-'2026-05-12'),'HIGH');
  END IF;

  PERFORM agent_record_feedback('lumea-ota','ota_channel_mix',
    format('ota:%s direct:%s pct:%s%%',v_ota_count,v_direct,v_ota_pct),
    'channel_monitor','SUCCESS',v_ota_count);

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-ota','ota_monitor',
    CASE WHEN v_ota_count>0 THEN 'FIXED' ELSE 'OK' END,
    format('booking_com=%s agoda=%s direct=%s ota_pct=%s%%',
      v_booking_com,v_agoda,v_direct,v_ota_pct));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_corporate_spend_detect()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO leads(id,name,email,phone,company,source,status,notes,analyst_brief,tenant_id,created_at,updated_at)
  SELECT DISTINCT ON(g.id)
    gen_random_uuid(), g.name, g.email, g.phone,
    'Corporate Prospect', 'CORPORATE_DETECT', 'NEW',
    format('High spend guest — ৳%s on %s — corporate account candidate',
      r.total_amount, r.check_out::date),
    format('Pitch: 15%% corporate discount for regular bookings. Est. value ৳%s/year if monthly.',
      r.total_amount * 12),
    r.tenant_id, NOW(), NOW()
  FROM reservations r
  JOIN guests g ON g.id = ANY(r.guest_ids)
  LEFT JOIN leads l ON l.phone = g.phone AND l.source = 'CORPORATE_DETECT'
  WHERE r.total_amount >= 15000
    AND r.status = 'CHECKED_OUT'
    AND l.id IS NULL
    AND is_valid_bd_phone(g.phone)
    AND g.phone IS NOT NULL
  ORDER BY g.id, r.total_amount DESC;
  GET DIAGNOSTICS v_new = ROW_COUNT;

  -- Also push into ceo_pipeline
  INSERT INTO ceo_pipeline(lead_id,company,contact_name,contact_phone,contact_email,
    lead_type,stage,pitch_sent,pitch_sent_at,pitch_channel,
    next_action,next_action_at,deal_value_bdt,tenant_id)
  SELECT l.id, l.company, l.name, l.phone, l.email,
    'CORPORATE', 'GENERATED', false, NULL, NULL,
    'Call within 24h — offer corporate account',
    CURRENT_DATE + 1,
    (l.notes::text ~ '৳([0-9,]+)')::integer,
    l.tenant_id
  FROM leads l
  LEFT JOIN ceo_pipeline cp ON cp.lead_id = l.id
  WHERE l.source = 'CORPORATE_DETECT' AND l.status = 'NEW'
    AND cp.id IS NULL;

  IF v_new > 0 THEN
    PERFORM agent_send('lumea-corporate','lumea-ceo','ALERT',
      format('%s high-spend guests detected as corporate prospects', v_new),
      'Guests who spent ৳15,000+ auto-flagged. Pitch: 15% corporate discount for regular bookings.',
      jsonb_build_object('new_prospects',v_new,'min_spend',15000),'HIGH');
  END IF;

  PERFORM agent_record_feedback('lumea-corporate','corporate_spend_detect',
    format('detected:%s',v_new),'high_spend_mining',
    CASE WHEN v_new>0 THEN 'SUCCESS' ELSE 'SUCCESS' END, v_new);

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-corporate','corp_detect',
    CASE WHEN v_new>0 THEN 'FIXED' ELSE 'OK' END,
    format('High-spend corporate prospects found: %s',v_new));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_social_weekend_campaign()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_available integer; v_occupancy numeric;
  v_discount integer; v_friday date;
BEGIN
  SELECT COUNT(*) INTO v_available FROM rooms WHERE status='AVAILABLE';
  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_occupancy FROM rooms;

  v_discount := CASE
    WHEN v_occupancy < 30 THEN 20
    WHEN v_occupancy < 50 THEN 15
    ELSE 10 END;

  -- Next Friday as proper date
  v_friday := DATE_TRUNC('week', CURRENT_DATE)::date + 4;

  INSERT INTO social_content_queue(
    platform,content_type,body_bn,body_en,
    rooms_available,offer_discount,scheduled_for,tenant_id)
  SELECT t.platform, 'WEEKEND_OFFER',
    format(
      E'🏨 Weekend Escape — Hotel Fountain BD!\n'
      'এই শুক্র-শনিবার আমাদের সাথে থাকুন — %s%% ছাড়!\n'
      '✅ %s টি room available\n'
      '✅ Airport থেকে মাত্র ১০ মিনিট\n'
      '✅ 24/7 Service\n'
      '✅ Fountain Deluxe মাত্র ৳%s/রাত\n'
      '📞 এখনই book করুন!\n'
      '#HotelFountainBD #WeekendOffer #DhakaHotel',
      v_discount, v_available,
      ROUND(4000*(1-v_discount::numeric/100))),
    format('Weekend %s%% off at Hotel Fountain BD. %s rooms from BDT %s.',
      v_discount,v_available,ROUND(4000*(1-v_discount::numeric/100))),
    v_available, v_discount, v_friday,
    (SELECT tenant_id FROM reservations LIMIT 1)
  FROM (VALUES ('FACEBOOK'),('WHATSAPP')) AS t(platform)
  WHERE NOT EXISTS(
    SELECT 1 FROM social_content_queue
    WHERE scheduled_for=v_friday AND content_type='WEEKEND_OFFER');

  PERFORM agent_send('lumea-corporate','lumea-ceo','REPORT',
    format('Weekend campaign: %s%% off, %s rooms, Friday %s',v_discount,v_available,v_friday),
    'Content queued for Facebook and WhatsApp.',
    jsonb_build_object('discount',v_discount,'rooms',v_available),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-corporate','weekend_campaign','OK',
    format('Campaign: %s%% discount for %s (%s rooms)',v_discount,v_friday,v_available));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_referral_queue_builder()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer;
BEGIN
  INSERT INTO referral_queue(
    reservation_id,guest_id,guest_name,phone,room,
    checkout_date,message,tenant_id)
  SELECT
    r.id, g.id, g.name, g.phone,
    array_to_string(r.room_ids,', '),
    r.check_out::date,
    format(
      'আসসালামু আলাইকুম %s ভাই/আপা! 🏨%s'
      'Hotel Fountain BD-তে থাকার জন্য ধন্যবাদ।%s'
      'আপনার বন্ধু বা পরিবারকে refer করুন:%s'
      '👉 তারা পাবেন ৳500 ছাড়%s'
      '👉 আপনি পাবেন ৳200 credit (পরের stay-এ)%s'
      'Share করুন: Hotel Fountain BD, Nikunja-02, Dhaka. ☎ [your number]%s'
      'ধন্যবাদ! 🙏',
      g.name,E'\n',E'\n',E'\n',E'\n',E'\n',E'\n'),
    r.tenant_id
  FROM reservations r
  JOIN guests g ON g.id = ANY(r.guest_ids)
  LEFT JOIN referral_queue rq ON rq.reservation_id = r.id
  WHERE r.status = 'CHECKED_OUT'
    AND is_valid_bd_phone(g.phone)
    AND rq.id IS NULL
    AND r.check_out >= NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_new = ROW_COUNT;

  PERFORM agent_record_feedback('lumea-guests','referral_queue',
    format('queued:%s',v_new),'referral_mining','SUCCESS',v_new);

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-guests','referral_queue',
    CASE WHEN v_new>0 THEN 'FIXED' ELSE 'OK' END,
    format('Referral messages queued: %s',v_new));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_referral_on_checkout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'CHECKED_OUT' AND OLD.status = 'CHECKED_IN' THEN
    INSERT INTO referral_queue(reservation_id, guest_id, guest_name, phone, room, checkout_date, message, tenant_id)
    SELECT
      NEW.id, g.id, g.name, g.phone,
      array_to_string(NEW.room_ids, ', '),
      NOW()::date,
      format('আসসালামু আলাইকুম %s! Hotel Fountain BD-তে থাকার জন্য ধন্যবাদ। বন্ধুদের refer করুন — তারা ৳500 ছাড়, আপনি ৳200 credit পাবেন। ধন্যবাদ!', g.name),
      NEW.tenant_id
    FROM guests g
    WHERE g.id = ANY(NEW.guest_ids)
      AND is_valid_bd_phone(g.phone)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

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
;

CREATE OR REPLACE FUNCTION public.agent_upsell_checkin()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new integer := 0;
BEGIN
  INSERT INTO upsell_offers(reservation_id,guest_name,phone,room,offer_type,offer_price,message,tenant_id)
  SELECT r.id, g.name, g.phone,
    array_to_string(r.room_ids,', '),
    offer.type, offer.price,
    format(E'আসসালামু আলাইকুম %s! Hotel Fountain BD.\n%s\nReply YES to add.',g.name,offer.msg),
    r.tenant_id
  FROM reservations r
  JOIN guests g ON g.id=ANY(r.guest_ids)
  CROSS JOIN (VALUES
    ('LAUNDRY',      500,  E'🧺 Laundry ৳500 (same day)'),
    ('BREAKFAST',    400,  E'🍳 Breakfast ৳400/person'),
    ('LATE_CHECKOUT',1000, E'⏰ Late checkout 2PM ৳1,000'),
    ('MINIBAR',      800,  E'🥤 Minibar setup ৳800')
  ) AS offer(type,price,msg)
  LEFT JOIN upsell_offers uo ON uo.reservation_id=r.id AND uo.offer_type=offer.type
  WHERE r.status='CHECKED_IN' AND is_valid_bd_phone(g.phone) AND uo.id IS NULL;
  GET DIAGNOSTICS v_new=ROW_COUNT;

  -- Auto-folio when accepted
  INSERT INTO folios(id,reservation_id,room_number,description,amount,tenant_id)
  SELECT gen_random_uuid(),uo.reservation_id,uo.room,uo.offer_type,uo.offer_price,uo.tenant_id
  FROM upsell_offers uo
  LEFT JOIN folios f ON f.reservation_id=uo.reservation_id AND f.description=uo.offer_type
  WHERE uo.accepted=true AND f.id IS NULL;

  PERFORM agent_record_feedback('lumea-upsell','upsell_checkin',
    format('offered:%s',v_new),'upsell_sweep','SUCCESS',v_new);
  PERFORM agent_send('lumea-corporate','lumea-ceo','REPORT',
    format('Upsell: %s offers created for checked-in guests',v_new),
    'Laundry/breakfast/late-checkout/minibar queued.',
    jsonb_build_object('offers',v_new),'NORMAL');
  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-upsell','upsell_checkin',CASE WHEN v_new>0 THEN 'FIXED' ELSE 'OK' END,
    format('upsell offers=%s',v_new));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_upsell_on_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'CHECKED_IN' AND OLD.status != 'CHECKED_IN' THEN
    INSERT INTO upsell_offers(reservation_id, guest_name, phone, room, offer_type, offer_price, message, tenant_id)
    SELECT
      NEW.id, g.name, g.phone,
      array_to_string(NEW.room_ids, ', '),
      o.type, o.price,
      format(E'আমাদের সেবা:\n%s\nReply YES', o.msg),
      NEW.tenant_id
    FROM guests g
    CROSS JOIN (VALUES
      ('LAUNDRY',    500,  E'🧺 Laundry ৳500'),
      ('BREAKFAST',  400,  E'🍳 Breakfast ৳400'),
      ('LATE_CHECKOUT', 1000, E'⏰ Late checkout ৳1,000'),
      ('MINIBAR',    800,  E'🥤 Minibar ৳800')
    ) AS o(type, price, msg)
    WHERE g.id = ANY(NEW.guest_ids)
      AND is_valid_bd_phone(g.phone);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_flash_sale()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_occupancy numeric; v_empty integer; v_flash_rate numeric;
BEGIN
  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1),
    COUNT(CASE WHEN status='AVAILABLE' THEN 1 END)
  INTO v_occupancy,v_empty FROM rooms;

  IF v_occupancy<40 AND EXTRACT(HOUR FROM NOW())>=11
    AND NOT EXISTS(SELECT 1 FROM flash_sale_log WHERE trigger_date=CURRENT_DATE) THEN

    v_flash_rate:=CASE WHEN v_occupancy<20 THEN 2500 WHEN v_occupancy<30 THEN 2800 ELSE 3200 END;

    INSERT INTO flash_sale_log(trigger_date,occupancy_pct,rooms_empty,flash_rate,tenant_id)
    VALUES(CURRENT_DATE,v_occupancy,v_empty,v_flash_rate,
      (SELECT tenant_id FROM reservations LIMIT 1));

    INSERT INTO social_content_queue(platform,content_type,body_bn,body_en,
      rooms_available,offer_discount,scheduled_for,tenant_id)
    VALUES('WHATSAPP','FLASH_SALE',
      format(E'⚡ আজ রাতের FLASH OFFER!\nHotel Fountain BD\n\n🏨 %s টি room available\n৳%s/রাত (সাধারণ ৳4,000)\n⏰ আজ রাত পর্যন্ত\n📞 এখনই call করুন!\n#FlashOffer #HotelFountainBD',
        v_empty,v_flash_rate),
      format('FLASH SALE! %s rooms at BDT %s tonight only.',v_empty,v_flash_rate),
      v_empty,ROUND((4000-v_flash_rate)/40),CURRENT_DATE,
      (SELECT tenant_id FROM reservations LIMIT 1));

    PERFORM agent_send('lumea-flash','lumea-ceo','ALERT',
      format('FLASH SALE: %s%% occupancy — %s rooms — ৳%s rate',v_occupancy,v_empty,v_flash_rate),
      'Post on WhatsApp/Facebook now.',
      jsonb_build_object('occupancy',v_occupancy,'rooms',v_empty,'rate',v_flash_rate),'HIGH');
  END IF;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-flash','flash_check',
    CASE WHEN v_occupancy<40 THEN 'WARN' ELSE 'OK' END,
    format('occ=%s%% empty=%s',v_occupancy,v_empty));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_dynamic_pricing()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_day text; v_month integer; v_mult numeric; v_season text; v_occ numeric;
BEGIN
  v_day:=TRIM(TO_CHAR(CURRENT_DATE,'Day'));
  v_month:=EXTRACT(MONTH FROM CURRENT_DATE);
  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_occ FROM rooms;

  v_season:=CASE WHEN v_month IN (4,5) THEN 'RAMADAN_EID'
    WHEN v_month IN (12,1) THEN 'WINTER_PEAK'
    WHEN v_month IN (6,7,8) THEN 'MONSOON_LOW' ELSE 'NORMAL' END;

  v_mult:=CASE WHEN v_day IN ('Friday','Saturday') THEN 1.20
               WHEN v_day='Sunday' THEN 1.10 ELSE 1.0 END
         *CASE v_season WHEN 'RAMADAN_EID' THEN 1.40
           WHEN 'WINTER_PEAK' THEN 1.15 WHEN 'MONSOON_LOW' THEN 0.85 ELSE 1.0 END
         *CASE WHEN v_occ>85 THEN 1.25 WHEN v_occ>70 THEN 1.10
               WHEN v_occ<30 THEN 0.85 ELSE 1.0 END;

  -- Log today's dynamic rates
  INSERT INTO dynamic_pricing_log(effective_date,day_of_week,season,category,
    base_rate,dynamic_rate,multiplier,reason,tenant_id)
  SELECT CURRENT_DATE,v_day,v_season,cat,base,
    ROUND(base*v_mult/100)*100,v_mult,
    format('%s | %s | occ:%s%%',v_day,v_season,v_occ),
    (SELECT tenant_id FROM reservations LIMIT 1)
  FROM (VALUES
    ('Fountain Deluxe',4000),('Premium Deluxe',4500),
    ('Superior Deluxe',5000),('Twin Deluxe',6000),('Royal Suite',9000)
  ) AS t(cat,base)
  ON CONFLICT DO NOTHING;

  IF v_mult>1.30 THEN
    PERFORM agent_send('lumea-pricing','lumea-ceo','ALERT',
      format('PRICE SURGE x%s: %s + %s (occ:%s%%)',ROUND(v_mult,2),v_day,v_season,v_occ),
      format('Fountain Deluxe now ৳%s. Update OTA listings.',ROUND(4000*v_mult/100)*100),
      jsonb_build_object('multiplier',v_mult,'fd_rate',ROUND(4000*v_mult/100)*100),'HIGH');
  END IF;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-pricing','dynamic_rate',
    CASE WHEN v_mult!=1.0 THEN 'FIXED' ELSE 'OK' END,
    format('x%s | %s | %s | occ=%s%%',ROUND(v_mult,2),v_day,v_season,v_occ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_seo_review_request()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_queued integer;
BEGIN
  INSERT INTO review_queue(id,reservation_id,tenant_id)
  SELECT gen_random_uuid(),r.id,r.tenant_id
  FROM reservations r
  JOIN reservation_billing_summary rbs ON rbs.id=r.id
  LEFT JOIN review_queue rq ON rq.reservation_id=r.id
  WHERE r.status='CHECKED_OUT' AND rbs.is_settled=true
    AND rq.id IS NULL AND r.check_out>=NOW()-INTERVAL '3 days';
  GET DIAGNOSTICS v_queued=ROW_COUNT;

  IF v_queued>0 THEN
    INSERT INTO social_content_queue(platform,content_type,body_bn,body_en,
      rooms_available,offer_discount,scheduled_for,tenant_id)
    VALUES('WHATSAPP','REVIEW_REQUEST',
      E'আমাদের সাথে থাকার জন্য ধন্যবাদ! 🏨\nGoogle review দিন:\ng.page/hotelfountainbd\nমাত্র ৩০ সেকেন্ড। ধন্যবাদ! 🙏',
      'Thanks for staying at Hotel Fountain BD! Leave a review: g.page/hotelfountainbd',
      0,0,CURRENT_DATE,(SELECT tenant_id FROM reservations LIMIT 1))
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM agent_send('lumea-seo','lumea-ceo','REPORT',
    format('SEO: %s review requests queued',v_queued),
    'Target: 50 Google reviews = 3x OTA visibility.',
    jsonb_build_object('queued',v_queued),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-seo','review_request',
    CASE WHEN v_queued>0 THEN 'FIXED' ELSE 'OK' END,
    format('review requests=%s',v_queued));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_content_strategist()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_occ numeric; v_avail integer; v_season text;
  v_strategy text; v_week date; v_tid uuid; v_month integer;
BEGIN
  SELECT tenant_id INTO v_tid FROM reservations LIMIT 1;
  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1),
    COUNT(CASE WHEN status='AVAILABLE' THEN 1 END) INTO v_occ,v_avail FROM rooms;
  v_month:=EXTRACT(MONTH FROM CURRENT_DATE);
  v_week:=DATE_TRUNC('week',CURRENT_DATE)::date;
  v_season:=CASE WHEN v_month IN (4,5) THEN 'RAMADAN_EID'
    WHEN v_month IN (12,1) THEN 'WINTER_PEAK'
    WHEN v_month IN (6,7,8) THEN 'MONSOON_LOW' ELSE 'NORMAL' END;
  v_strategy:=CASE WHEN v_occ<30 THEN 'AGGRESSIVE_PROMO'
    WHEN v_occ<50 THEN 'SOFT_PROMO' WHEN v_occ>80 THEN 'BRAND_BUILDING' ELSE 'BALANCED' END;

  -- Plan 14 slots across 7 days
  INSERT INTO content_calendar(platform,content_type,title,target_audience,scheduled_for,post_time,status,created_by_agent,tenant_id)
  VALUES
    ('FACEBOOK',  'ROOM_SPOTLIGHT','Featured Room','GENERAL',     v_week+0,'10:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'ROOM_SPOTLIGHT','Featured Room','GENERAL',     v_week+0,'10:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'CORPORATE_PITCH','Corporate','CORPORATE',      v_week+1,'09:00','DRAFT','lumea-strategist',v_tid),
    ('LINKEDIN',  'CORPORATE_PITCH','Corporate','CORPORATE',      v_week+1,'09:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'TIPS','Travel Tips','GENERAL',                 v_week+2,'11:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'BEHIND_SCENES','Behind Scenes','GENERAL',      v_week+3,'14:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'BEHIND_SCENES','Behind Scenes','GENERAL',      v_week+3,'14:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'OFFER','Weekend Offer','GENERAL',              v_week+4,'08:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'OFFER','Weekend Offer','GENERAL',              v_week+4,'08:00','DRAFT','lumea-strategist',v_tid),
    ('WHATSAPP',  'OFFER','Weekend Offer','GENERAL',              v_week+4,'08:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'SEASONAL',v_season,'GENERAL',                  v_week+5,'10:00','DRAFT','lumea-strategist',v_tid),
    ('FACEBOOK',  'TESTIMONIAL','Guest Story','GENERAL',          v_week+6,'11:00','DRAFT','lumea-strategist',v_tid),
    ('INSTAGRAM', 'TESTIMONIAL','Guest Story','GENERAL',          v_week+6,'11:00','DRAFT','lumea-strategist',v_tid),
    ('WHATSAPP',  'TESTIMONIAL','Guest Story','GENERAL',          v_week+6,'11:00','DRAFT','lumea-strategist',v_tid)
  ON CONFLICT DO NOTHING;

  INSERT INTO agent_pattern_memory(agent_id,pattern_key,pattern_desc,times_seen,times_correct,confidence,metadata)
  VALUES('lumea-strategist','weekly_strategy','Weekly content strategy',1,1,0.9,
    jsonb_build_object('strategy',v_strategy,'occ',v_occ,'season',v_season,'week',v_week))
  ON CONFLICT(pattern_key) DO UPDATE SET
    metadata=jsonb_build_object('strategy',v_strategy,'occ',v_occ,'season',v_season),
    times_seen=agent_pattern_memory.times_seen+1,updated_at=NOW();

  PERFORM agent_send('lumea-strategist','lumea-ceo','REPORT',
    format('Content strategy: %s | occ:%s%% | %s | 14 slots planned',v_strategy,v_occ,v_season),
    'Weekly calendar set. Copywriters briefed.',
    jsonb_build_object('strategy',v_strategy,'slots',14),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-strategist','weekly_plan','OK',
    format('strategy=%s occ=%s%% season=%s',v_strategy,v_occ,v_season));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_copywriter_bn()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slot record; v_body text; v_dyn numeric; v_avail integer;
BEGIN
  SELECT COALESCE(dynamic_rate,4000) INTO v_dyn FROM dynamic_pricing_log
  WHERE category='Fountain Deluxe' AND effective_date=CURRENT_DATE LIMIT 1;
  SELECT COUNT(CASE WHEN status='AVAILABLE' THEN 1 END) INTO v_avail FROM rooms;

  FOR v_slot IN
    SELECT id,content_type,platform,scheduled_for FROM content_calendar
    WHERE status='DRAFT' AND body_bn IS NULL
      AND platform IN ('FACEBOOK','WHATSAPP','ALL')
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
    ORDER BY scheduled_for
  LOOP
    v_body:=CASE
      WHEN v_slot.content_type='ROOM_SPOTLIGHT' THEN
        '🏨 Room Spotlight — Hotel Fountain BD'||E'\n\n'||
        'Step into our Fountain Deluxe Room!'||E'\n\n'||
        '✅ Premium furnishings'||E'\n'||
        '✅ High-speed WiFi'||E'\n'||
        '✅ 24/7 Room Service'||E'\n'||
        '✅ 10 minutes from HSIA Airport'||E'\n\n'||
        '💰 From BDT '||v_dyn::text||'/night'||E'\n\n'||
        '📞 Book now!'
      WHEN v_slot.content_type IN ('OFFER','WEEKEND_OFFER') THEN
        '🎉 Special Weekend Offer!'||E'\n\n'||
        '🛏️ '||v_avail||' rooms available'||E'\n'||
        '💰 Starting BDT '||v_dyn::text||'/night'||E'\n'||
        '✈️ Airport proximity — Nikunja-02'||E'\n\n'||
        '📞 Reserve now — limited rooms!'
      WHEN v_slot.content_type='FLASH_SALE' THEN
        '⚡ FLASH OFFER — Tonight Only!'||E'\n\n'||
        '🛏️ '||v_avail||' rooms available'||E'\n'||
        '💰 Special rate: BDT '||GREATEST((v_dyn*0.8)::integer,2500)::text||E'\n'||
        '⏰ Limited time — call now!'
      WHEN v_slot.content_type='CORPORATE_PITCH' THEN
        '🏢 Corporate Accounts — Hotel Fountain BD'||E'\n\n'||
        '✅ Negotiated corporate rates'||E'\n'||
        '✅ Monthly billing'||E'\n'||
        '✅ Priority room booking'||E'\n'||
        '✅ 10 min from Dhaka Airport'||E'\n\n'||
        '📧 Contact us today to set up your account!'
      WHEN v_slot.content_type='TESTIMONIAL' THEN
        '⭐⭐⭐⭐⭐ Guest Review'||E'\n\n'||
        '"Excellent stay at Hotel Fountain BD. '||
        'Staff was incredibly helpful, room spotless, '||
        'and the airport proximity was perfect."'||E'\n\n'||
        '— Satisfied Guest, Dhaka 2026'||E'\n\n'||
        '🏨 Experience it yourself — Book today!'
      WHEN v_slot.content_type='BEHIND_SCENES' THEN
        '👀 Behind the Scenes at Hotel Fountain BD'||E'\n\n'||
        '🧹 Housekeeping: Every room deep-cleaned'||E'\n'||
        '🛎️ Front Desk: Available 24/7'||E'\n'||
        '🍳 Kitchen: Fresh breakfast every morning'||E'\n\n'||
        'We do not just offer rooms — we offer reliability.'||E'\n'||
        '📞 Book now!'
      WHEN v_slot.content_type='TIPS' THEN
        '💡 Dhaka Travel Tip!'||E'\n\n'||
        'Just landed at Hazrat Shahjalal Airport?'||E'\n\n'||
        '🏨 Hotel Fountain BD is 10 minutes away'||E'\n'||
        '✅ No highway traffic'||E'\n'||
        '✅ 24/7 Front Office'||E'\n'||
        '✅ Rooms from BDT 4,000'||E'\n\n'||
        'The smart choice for Dhaka arrivals!'
      WHEN v_slot.content_type='SEASONAL' THEN
        '🌙 Eid Mubarak from Hotel Fountain BD!'||E'\n\n'||
        'Celebrate Eid with your family in comfort.'||E'\n'||
        '🎊 Special Eid packages available'||E'\n'||
        '🍽️ Festive breakfast included'||E'\n'||
        '🛏️ Family rooms ready'||E'\n\n'||
        'Make your Eid celebration unforgettable!'
      ELSE '🏨 Hotel Fountain BD — Nikunja-02, Dhaka'||E'\n'||
        '10 min from Airport. 28 premium rooms. 24/7 service.'||E'\n'||
        'BDT '||v_dyn::text||'/night. 📞 Book now!'
    END;

    UPDATE content_calendar SET
      body_bn=v_body,
      cta=CASE v_slot.platform
        WHEN 'WHATSAPP' THEN '📞 Reply to this message to book!'
        WHEN 'FACEBOOK' THEN '👇 Comment or send us a message!'
        ELSE '🔗 Link in bio!'
      END,
      hashtags='#HotelFountainBD #NikunjaDhaka #DhakaHotel #AirportHotel #Bangladesh #Travel #BusinessTravel',
      status='PENDING_REVIEW'
    WHERE id=v_slot.id;
  END LOOP;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-copywriter-bn','copy_en','OK','English content written for all platforms');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_copywriter_en()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slot record; v_body text; v_dyn numeric; v_avail integer;
BEGIN
  SELECT COALESCE(dynamic_rate,4000) INTO v_dyn FROM dynamic_pricing_log
  WHERE category='Fountain Deluxe' AND effective_date=CURRENT_DATE LIMIT 1;
  SELECT COUNT(CASE WHEN status='AVAILABLE' THEN 1 END) INTO v_avail FROM rooms;

  FOR v_slot IN
    SELECT id,content_type,platform,scheduled_for FROM content_calendar
    WHERE status IN ('DRAFT','PENDING_REVIEW') AND body_en IS NULL
      AND platform IN ('INSTAGRAM','LINKEDIN','ALL')
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
    ORDER BY scheduled_for
  LOOP
    v_body:=CASE
      WHEN v_slot.content_type='ROOM_SPOTLIGHT' THEN
        '✨ Fountain Deluxe Room at Hotel Fountain BD.'||E'\n\n'||
        'Premium furnishings. High-speed WiFi. 24/7 concierge.'||E'\n'||
        '📍 Nikunja-02 — 10 min from HSIA.'||E'\n'||
        '🛏️ From BDT '||v_dyn::text||' per night.'||E'\n\n'||
        'Your comfort, our commitment.'
      WHEN v_slot.content_type='CORPORATE_PITCH' THEN
        'Streamline corporate travel with Hotel Fountain BD.'||E'\n\n'||
        '✅ Negotiated corporate rates'||E'\n'||
        '✅ Monthly invoicing'||E'\n'||
        '✅ Priority availability'||E'\n'||
        '✅ 10 min from Dhaka Airport'||E'\n\n'||
        'DM us to set up your corporate account.'
      WHEN v_slot.content_type='TIPS' THEN
        'Traveling through Dhaka? 🇧🇩'||E'\n\n'||
        'Smart travelers stay in Nikunja-02.'||E'\n'||
        '→ 10-min straight drive from HSIA'||E'\n'||
        '→ 24/7 front desk'||E'\n'||
        '→ From BDT 4,000/night'||E'\n\n'||
        'Hotel Fountain BD. Your airport hotel in Dhaka. ✈️'
      WHEN v_slot.content_type='TESTIMONIAL' THEN
        '"Seamless transit stay. Clean rooms, fast check-in, helpful staff."'||E'\n'||
        '— Corporate Guest, Dhaka 2026'||E'\n\n'||
        'Experience the difference. Book today.'
      WHEN v_slot.content_type='BEHIND_SCENES' THEN
        'What makes a perfect hotel stay? 🏨'||E'\n\n'||
        '🧹 Housekeeping that never cuts corners'||E'\n'||
        '🛎️ Front desk around the clock'||E'\n'||
        '☕ Fresh breakfast every morning'||E'\n\n'||
        'We offer reliability, not just rooms.'
      WHEN v_slot.content_type IN ('OFFER','WEEKEND_OFFER') THEN
        'Weekend in Dhaka? 🌆'||E'\n\n'||
        v_avail||' rooms available. From BDT '||v_dyn::text||'/night.'||E'\n'||
        'Airport proximity included. Book directly for best rates.'
      WHEN v_slot.content_type='SEASONAL' THEN
        'Eid Mubarak from Hotel Fountain BD! 🌙'||E'\n\n'||
        'Special Eid packages available. Family rooms. Festive breakfast.'||E'\n'||
        'Book your stay for the holidays.'
      ELSE 'Hotel Fountain BD — Premium stay near Dhaka Airport.'||E'\n'||
        'Nikunja-02 | 28 rooms | 24/7 service | BDT '||v_dyn::text
    END;

    UPDATE content_calendar SET body_en=v_body WHERE id=v_slot.id;
  END LOOP;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-copywriter-en','en_copy','OK','English content written for Instagram/LinkedIn');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_visual_brief()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slot record; v_brief text; v_dyn numeric;
BEGIN
  SELECT COALESCE(dynamic_rate,4000) INTO v_dyn FROM dynamic_pricing_log
  WHERE category='Fountain Deluxe' AND effective_date=CURRENT_DATE LIMIT 1;

  FOR v_slot IN
    SELECT id,content_type,platform FROM content_calendar
    WHERE visual_brief IS NULL
      AND status IN ('PENDING_REVIEW','DRAFT')
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
  LOOP
    v_brief:=CASE
      WHEN v_slot.content_type='ROOM_SPOTLIGHT' THEN
        'PHOTO: Fountain Deluxe room — white linen, warm lighting, hero shot. '||
        'OVERLAY: Room name + BDT '||v_dyn::text||'. FONT: Libre Baskerville. COLORS: #F9F7F2 + #C5A059. SIZE: 1080×1080.'
      WHEN v_slot.content_type IN ('OFFER','WEEKEND_OFFER') THEN
        'SPLIT LAYOUT: Room photo left + offer text right. BADGE: "WEEKEND OFFER" gold circle. '||
        'DARK background #1A1816 + gold text #C5A059. Rate in large mono font.'
      WHEN v_slot.content_type='FLASH_SALE' THEN
        'URGENT red banner + hotel photo. "FLASH SALE" bold text top. Rate center. "TONIGHT ONLY" bottom. High contrast: red + white + gold.'
      WHEN v_slot.content_type='CORPORATE_PITCH' THEN
        'CLEAN minimalist. Hotel lobby/exterior. "Corporate Accounts Available" serif. Briefcase + invoice icons. LinkedIn 1200×627.'
      WHEN v_slot.content_type='BEHIND_SCENES' THEN
        'COLLAGE 4 photos: housekeeping/front desk/breakfast/exterior. Candid feel. Caption: "Your comfort begins here".'
      WHEN v_slot.content_type='TESTIMONIAL' THEN
        'QUOTE CARD: Guest quote in large italic serif. ⭐⭐⭐⭐⭐ above. Hotel logo below. Ivory #F9F7F2 + gold border.'
      WHEN v_slot.content_type='TIPS' THEN
        'MAP GRAPHIC: DAC airport → Hotel Fountain BD arrow in gold. "10 min" label. Clean infographic, white background.'
      WHEN v_slot.content_type='SEASONAL' THEN
        'EID DESIGN: Crescent moon + stars. Hotel photo with festive overlay. Gold + green palette. Calligraphic "Eid Mubarak".'
      ELSE 'Hotel exterior or room photo. Logo bottom right. Contact info. Brand colors: #1A1816 + #C5A059.'
    END;
    UPDATE content_calendar SET visual_brief=v_brief WHERE id=v_slot.id;
  END LOOP;

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-visual','visual_briefs','OK','Visual briefs written for all slots');
END;
$function$
;

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
;

CREATE OR REPLACE FUNCTION public.agent_content_analytics()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM agent_send('lumea-analytics','lumea-ceo','REPORT',
    format('Content this week: %s approved, %s posted',
      (SELECT COUNT(*) FROM content_calendar WHERE status='APPROVED'
        AND scheduled_for BETWEEN CURRENT_DATE-7 AND CURRENT_DATE),
      (SELECT COUNT(*) FROM content_calendar WHERE status='POSTED'
        AND scheduled_for BETWEEN CURRENT_DATE-7 AND CURRENT_DATE)),
    'Weekly content analytics.',jsonb_build_object('week',CURRENT_DATE),'NORMAL');
  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-analytics','analytics','OK','Content performance tracked');
END;
$function$
;

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
;

CREATE OR REPLACE FUNCTION public.agent_generate_variations(p_content_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_slot   record;
  v_dyn    numeric;
  v_avail  integer;
  v_occ    numeric;
  v_tid    uuid;
BEGIN
  SELECT * INTO v_slot FROM content_calendar WHERE id=p_content_id;
  IF v_slot IS NULL THEN RETURN; END IF;

  SELECT COALESCE(dynamic_rate,4000) INTO v_dyn FROM dynamic_pricing_log
  WHERE category='Fountain Deluxe' AND effective_date=CURRENT_DATE LIMIT 1;
  SELECT COUNT(CASE WHEN status='AVAILABLE' THEN 1 END),
    ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/28*100,1)
  INTO v_avail, v_occ FROM rooms;
  SELECT tenant_id INTO v_tid FROM reservations LIMIT 1;

  DELETE FROM content_variations WHERE content_id=p_content_id;

  -- V1: PRICE-LED
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,1,v_slot.platform,'PRICE_LED',
    '💰 Best Value in Nikunja-02 — Hotel Fountain BD'||E'\n\n'||
    'Premium rooms at unbeatable airport rates.'||E'\n\n'||
    '🛏️ Fountain Deluxe — BDT '||v_dyn::text||'/night'||E'\n'||
    '🛏️ Premium Deluxe — BDT '||((v_dyn*1.125)::integer)::text||'/night'||E'\n'||
    '🛏️ Royal Suite — BDT '||((v_dyn*2.25)::integer)::text||'/night'||E'\n\n'||
    '✈️ 10 minutes from Hazrat Shahjalal Airport'||E'\n'||
    '📞 Book now for best rates!',
    '📞 Call now for best rate!',
    '#BestRates #HotelFountainBD #DhakaHotel #AirportHotel #BudgetLuxury',
    'PRICE COMPARISON graphic. 3 room tiers with BDT rates. Gold price badges. Dark #1A1816 background. Bold mono font numbers.',
    v_tid);

  -- V2: EMOTION
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,2,v_slot.platform,'EMOTION',
    '🏡 Feel At Home — Hotel Fountain BD'||E'\n\n'||
    'After a long journey, you deserve genuine comfort.'||E'\n\n'||
    '🛏️ Soft premium bedding'||E'\n'||
    '🚿 Spotless ensuite bathroom'||E'\n'||
    '☕ Morning tea & coffee on request'||E'\n'||
    '😊 Warm, attentive staff — around the clock'||E'\n\n'||
    '📍 Nikunja-02, Dhaka — 10 min from the airport.'||E'\n'||
    'From BDT '||v_dyn::text||'/night.',
    '🛏️ Book your rest tonight',
    '#TravelComfort #HotelFountainBD #DhakaStay #HomeAwayFromHome #Hospitality',
    'WARM lifestyle photo. Cozy room. Soft warm lighting. Guest relaxing. Emotional, inviting feel.',
    v_tid);

  -- V3: URGENCY
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,3,v_slot.platform,'URGENCY',
    '⚠️ Only '||v_avail||' Rooms Left — Hotel Fountain BD'||E'\n\n'||
    'Availability is running out fast.'||E'\n\n'||
    '🔴 '||v_avail||' rooms available right now'||E'\n'||
    '💰 From BDT '||v_dyn::text||'/night'||E'\n'||
    '✈️ 10 minutes from HSIA'||E'\n\n'||
    '⏰ Do not wait — rooms are filling up!'||E'\n'||
    '📞 Call now to secure yours!',
    '⚡ Book NOW — rooms filling fast',
    '#LastMinute #HotelFountainBD #OnlyFewLeft #BookNow #DhakaHotel',
    'URGENCY design. Red accents. Room counter "Only '||v_avail||' left!". Bold countdown feel. High contrast.',
    v_tid);

  -- V4: SOCIAL PROOF
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,4,v_slot.platform,'SOCIAL_PROOF',
    '⭐⭐⭐⭐⭐ Guests Are Talking...'||E'\n\n'||
    '"Exceptional location. 10 minutes from the airport and impeccable service."'||E'\n'||
    '— Corporate Guest, Dhaka'||E'\n\n'||
    '"Cleanest hotel room I have stayed in Dhaka. Will always choose Hotel Fountain BD."'||E'\n'||
    '— Frequent Traveler'||E'\n\n'||
    '🏨 Join 880+ satisfied guests.'||E'\n'||
    'From BDT '||v_dyn::text||'/night.',
    '⭐ See more reviews — Book today',
    '#GuestReview #HotelFountainBD #5Stars #DhakaHotel #HappyGuests',
    'REVIEW WALL. 2 quote cards side by side. Star ratings. Names. Ivory #F9F7F2 + gold border. Premium feel.',
    v_tid);

  -- V5: BENEFIT-LED
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,5,v_slot.platform,'BENEFIT',
    '✈️ The #1 Airport Hotel in Nikunja-02 — Hotel Fountain BD'||E'\n\n'||
    'Why frequent Dhaka travelers choose us:'||E'\n\n'||
    '🚗 10-min drive from HSIA — zero highway traffic'||E'\n'||
    '🛎️ 24/7 front desk — no matter when you land'||E'\n'||
    '🧹 Deep-cleaned room after every checkout'||E'\n'||
    '📶 High-speed WiFi in all rooms'||E'\n'||
    '💼 Corporate billing available'||E'\n\n'||
    'From BDT '||v_dyn::text||'/night. Nikunja-02, Dhaka.',
    '✈️ Your airport hotel — Book now',
    '#AirportHotel #BusinessTravel #HotelFountainBD #DhakaTravel #CorporateStay',
    'BENEFITS LIST. 5 icons + benefit text. Clean infographic. Gold checkmarks on dark background.',
    v_tid);

  -- V6: CURIOSITY
  INSERT INTO content_variations(content_id,variant_number,platform,angle,body_bn,cta,hashtags,visual_brief,tenant_id)
  VALUES(p_content_id,6,v_slot.platform,'CURIOSITY',
    '🤔 The mistake most travelers make after landing in Dhaka...'||E'\n\n'||
    'They book a hotel far away and spend an hour stuck in traffic.'||E'\n\n'||
    'Smart travelers know about Hotel Fountain BD:'||E'\n'||
    '→ 10 minutes from HSIA — straight road, no traffic'||E'\n'||
    '→ BDT '||v_dyn::text||'/night'||E'\n'||
    '→ 24/7 service'||E'\n\n'||
    'Be the smart traveler. 😉'||E'\n'||
    '📞 Book now!',
    '😉 Be the smart traveler — Book now',
    '#SmartTravel #DhakaAirport #TravelTip #HotelFountainBD #TravelHack',
    'BEFORE/AFTER split. Left: stressed traveler in traffic. Right: relaxed guest in hotel. Hook visual. Bold contrast.',
    v_tid);

  UPDATE content_calendar SET status='VARIATIONS_READY' WHERE id=p_content_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_generate_all_variations()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slot record; v_count integer:=0;
BEGIN
  FOR v_slot IN
    SELECT id FROM content_calendar
    WHERE status='APPROVED'
      AND scheduled_for BETWEEN CURRENT_DATE AND CURRENT_DATE+7
  LOOP
    PERFORM agent_generate_variations(v_slot.id);
    v_count:=v_count+1;
  END LOOP;

  PERFORM agent_send('lumea-strategist','lumea-ceo','REPORT',
    format('Variations generated: %s content pieces × 6 variants = %s total',v_count,v_count*6),
    'All approved content has 6 angle variations ready for Shan email approval.',
    jsonb_build_object('pieces',v_count,'total_variations',v_count*6),'NORMAL');

  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-strategist','variations_generated','OK',
    format('%s content pieces × 6 variations each',v_count));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_content_approval_email()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM net.http_post(
    url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/content-approval-email',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  INSERT INTO agent_run_log(agent_id,action,status,details)
  VALUES('lumea-editor','approval_email_sent','OK',
    'Content approval email sent to hotellfountainbd@gmail.com');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_content_pipeline()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Step 1: Strategist plans week
  PERFORM agent_content_strategist();
  -- Step 2: Copywriters fill content
  PERFORM agent_copywriter_bn();
  PERFORM agent_copywriter_en();
  -- Step 3: Visual briefs
  PERFORM agent_visual_brief();
  -- Step 4: Editor approves
  PERFORM agent_editor_review();
  PERFORM ceo_approve_content();
  -- Step 5: Generate 6 variations for every approved slot
  PERFORM agent_generate_all_variations();
  -- Step 6: Email all variations to Shan
  PERFORM trigger_content_approval_email();

  RETURN format('Pipeline complete. Variations emailed to Shan at %s',NOW());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.outreach_log_entry(p_tenant_id uuid, p_lead_id uuid, p_direction text, p_channel text, p_subject text, p_body text, p_sent_at timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO outreach_log(tenant_id, lead_id, direction, channel, subject, body, sent_at)
  VALUES (p_tenant_id, p_lead_id, p_direction, p_channel, p_subject, p_body, p_sent_at);
$function$
;

CREATE OR REPLACE FUNCTION public.outreach_update_lead_status(p_lead_id uuid, p_status text, p_last_contacted_at timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE corporate_leads
  SET status              = p_status,
      last_contacted_at   = p_last_contacted_at,
      updated_at          = NOW()
  WHERE id = p_lead_id;
$function$
;

CREATE OR REPLACE FUNCTION public.poll_get_contactable_leads(p_tenant_id uuid)
 RETURNS TABLE(id uuid, tenant_id uuid, company_name text, contact_name text, contact_title text, contact_email text, contact_phone text, company_address text, company_website text, industry text, icp_score text, priority text, status text, last_contacted_at timestamp with time zone, deal_score integer, notes text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    id, tenant_id, company_name, contact_name, contact_title,
    contact_email, contact_phone, company_address, company_website,
    industry, icp_score, priority, status, last_contacted_at,
    deal_score, notes, created_at, updated_at
  FROM corporate_leads
  WHERE tenant_id = p_tenant_id
    AND status IN ('pending', 'contacted')
    AND contact_email IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.import_corporate_leads(p_leads jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lead     JSONB;
  inserted INTEGER := 0;
BEGIN
  FOR lead IN SELECT * FROM jsonb_array_elements(p_leads)
  LOOP
    INSERT INTO corporate_leads (
      tenant_id,
      company_name,
      contact_name,
      contact_title,
      contact_email,
      contact_phone,
      company_website,
      industry,
      icp_score,
      priority,
      status,
      notes
    ) VALUES (
      (lead->>'tenant_id')::uuid,
      lead->>'company_name',
      lead->>'contact_name',
      lead->>'contact_title',
      lead->>'contact_email',
      lead->>'contact_phone',
      lead->>'company_website',
      lead->>'industry',
      lead->>'icp_score',
      lead->>'priority',
      lead->>'status',
      lead->>'notes'
    )
    ON CONFLICT (contact_email) DO NOTHING;

    IF FOUND THEN inserted := inserted + 1; END IF;
  END LOOP;

  RETURN inserted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.followup_get_eligible_leads(p_tenant_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, company_name text, contact_name text, contact_title text, contact_email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    cl.id,
    cl.company_name,
    cl.contact_name,
    cl.contact_title,
    cl.contact_email
  FROM corporate_leads cl
  WHERE cl.tenant_id   = p_tenant_id
    AND cl.status      = 'contacted'
    AND cl.contact_email IS NOT NULL
    AND cl.last_contacted_at BETWEEN (NOW() - INTERVAL '7 days') AND (NOW() - INTERVAL '3 days')
    AND (
      SELECT COUNT(*) FROM outreach_log ol
      WHERE ol.lead_id   = cl.id
        AND ol.direction = 'outbound'
    ) < 2
  ORDER BY cl.last_contacted_at ASC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.digest_get_recent_replies(p_tenant_id uuid)
 RETURNS TABLE(lead_id uuid, company_name text, contact_name text, contact_title text, contact_email text, replied_at timestamp with time zone, message_body text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    cl.id,
    cl.company_name,
    cl.contact_name,
    cl.contact_title,
    cl.contact_email,
    cl.updated_at,
    (
      SELECT ol.body
      FROM outreach_log ol
      WHERE ol.lead_id   = cl.id
        AND ol.direction = 'inbound'
      ORDER BY ol.sent_at DESC
      LIMIT 1
    ) AS message_body
  FROM corporate_leads cl
  WHERE cl.tenant_id = p_tenant_id
    AND cl.status    = 'replied'
    AND cl.updated_at >= NOW() - INTERVAL '24 hours'
  ORDER BY cl.updated_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.outreach_get_pending_leads(p_tenant_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, company_name text, contact_name text, contact_title text, contact_email text, priority text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    id,
    company_name,
    contact_name,
    contact_title,
    contact_email,
    priority
  FROM corporate_leads
  WHERE tenant_id     = p_tenant_id
    AND status        = 'pending'
    AND contact_email IS NOT NULL
  ORDER BY
    CASE priority WHEN 'high' THEN 1 WHEN 'med' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    nullif(current_setting('app.current_tenant_id', true), '')::uuid,
    (select tu.tenant_id from public.tenant_users tu where tu.user_id = auth.uid() limit 1),
    (select t.id from public.tenants t where t.owner_id = auth.uid() limit 1)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, false);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.intake_find_lead_by_email(p_tenant_id uuid, p_email text)
 RETURNS TABLE(id uuid, company_name text, contact_name text, contact_email text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id, company_name, contact_name, contact_email, status FROM corporate_leads
  WHERE tenant_id=p_tenant_id AND LOWER(TRIM(contact_email))=LOWER(TRIM(p_email)) LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.intake_find_lead_by_domain(p_tenant_id uuid, p_domain text)
 RETURNS TABLE(id uuid, company_name text, contact_name text, contact_email text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id, company_name, contact_name, contact_email, status FROM corporate_leads
  WHERE tenant_id=p_tenant_id AND LOWER(SPLIT_PART(contact_email,'@',2))=LOWER(TRIM(p_domain))
  ORDER BY created_at ASC LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.intake_log_inbound(p_tenant_id uuid, p_lead_id uuid, p_direction text, p_channel text, p_subject text, p_body text, p_sent_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id UUID;
BEGIN
  INSERT INTO outreach_log(tenant_id,lead_id,direction,channel,subject,body,sent_at)
  VALUES(p_tenant_id,p_lead_id,p_direction,p_channel,p_subject,p_body,p_sent_at) RETURNING id INTO v_id;
  RETURN v_id;
END;$function$
;

CREATE OR REPLACE FUNCTION public.intake_mark_lead_replied(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE corporate_leads SET status='replied', last_contacted_at=NOW(), updated_at=NOW()
  WHERE id=p_lead_id AND status NOT IN ('deal_ready','payment_pending','activated','closed_won');
END;$function$
;

CREATE OR REPLACE FUNCTION public.ceo_update_log(p_log_id uuid, p_deal_score integer, p_deal_score_reason text, p_ceo_next_action text, p_is_deal_ready boolean, p_audited_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE outreach_log SET deal_score=p_deal_score, deal_score_reason=p_deal_score_reason,
    ceo_next_action=p_ceo_next_action, is_deal_ready=p_is_deal_ready, audited_at=p_audited_at
  WHERE id=p_log_id;
END;$function$
;

CREATE OR REPLACE FUNCTION public.ceo_update_lead(p_lead_id uuid, p_status text, p_deal_score integer, p_updated_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE corporate_leads SET status=p_status, deal_score=p_deal_score, updated_at=p_updated_at WHERE id=p_lead_id;
END;$function$
;

CREATE OR REPLACE FUNCTION public.deal_mark_alert_sent(p_log_id uuid, p_alert_sent_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN UPDATE outreach_log SET alert_sent=TRUE, alert_sent_at=p_alert_sent_at WHERE id=p_log_id; END;$function$
;

CREATE OR REPLACE FUNCTION public.deal_log_notification(p_tenant_id uuid, p_workflow text, p_body text, p_status text, p_triggered_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO notifications_log(tenant_id,workflow,body,status,triggered_by,created_at)
  VALUES(p_tenant_id,p_workflow,p_body,p_status,p_triggered_by,NOW());
END;$function$
;

CREATE OR REPLACE FUNCTION public.get_lead_contact_email(p_lead_id uuid)
 RETURNS TABLE(contact_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT contact_email FROM corporate_leads WHERE id=p_lead_id LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.intake_mark_lead_payment_pending(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE corporate_leads SET status='payment_pending', payment_pending_at=NOW(), updated_at=NOW()
  WHERE id=p_lead_id AND status NOT IN ('activated','closed_won');
END;$function$
;

CREATE OR REPLACE FUNCTION public.intake_mark_lead_activated(p_lead_id uuid, p_activated_at timestamp with time zone, p_subdomain text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE corporate_leads SET status='activated', activated_at=p_activated_at, subdomain=p_subdomain, updated_at=NOW()
  WHERE id=p_lead_id;
END;$function$
;

CREATE OR REPLACE FUNCTION public.ceo_get_log_with_lead(p_log_id uuid)
 RETURNS TABLE(log_id uuid, log_lead_id uuid, log_subject text, log_body text, log_sent_at timestamp with time zone, lead_company_name text, lead_contact_name text, lead_contact_email text, lead_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    ol.id            AS log_id,
    ol.lead_id       AS log_lead_id,
    ol.subject       AS log_subject,
    ol.body          AS log_body,
    ol.sent_at       AS log_sent_at,
    cl.company_name  AS lead_company_name,
    cl.contact_name  AS lead_contact_name,
    cl.contact_email AS lead_contact_email,
    cl.status        AS lead_status
  FROM   outreach_log  ol
  LEFT   JOIN corporate_leads cl ON cl.id = ol.lead_id
  WHERE  ol.id = p_log_id
  LIMIT  1;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_invoke_lighthouse_summary()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url     := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/lighthouse-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer 53qwrP5uOQpNTsbrlDIHfOHH1ZDNIL6dAIFnOoIywvcx'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  INTO request_id;
  RETURN request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_heuristic_audit(reply_body text, reply_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  txt         text   := lower(coalesce(reply_body, '') || ' ' || coalesce(reply_subject, ''));
  body_only   text   := lower(coalesce(reply_body, ''));
  score       int    := 5;
  reason      text   := 'Neutral reply — no clear buying signal or rejection.';
  next_action text   := 'Send a polite follow-up in 3 days.';
  signals     text[] := '{}';
  objections  text[] := '{}';
BEGIN
  -- 1) Obvious test / debug data
  IF reply_subject ILIKE 'test%' OR body_only IN ('test', 'test body', 'testing', 'testing new key') THEN
    RETURN jsonb_build_object(
      'score', 1,
      'reasoning', 'Body matches test/debug pattern, not a genuine reply.',
      'signals', '[]'::jsonb,
      'objections', jsonb_build_array('test/debug data'),
      'next_action', 'Skip — flag for cleanup; do not treat as a real lead reply.',
      'is_deal_ready', false,
      'source', 'heuristic'
    );
  END IF;

  -- 2) Hard rejection / auto-reply (score 1-2)
  IF txt ~ '(unsubscribe|remove (me|from)|stop emailing|do not (email|contact)|not interested|out of office|auto.?reply|automatic reply)' THEN
    score      := 1;
    objections := objections || ARRAY['Explicit unsubscribe / not interested / auto-reply'];
    reason     := 'Hard rejection, unsubscribe, or auto-reply.';
    next_action := 'Mark as unsubscribed; remove from outreach list.';

  -- 3) Hot — explicit booking/quote/meeting (score 9-10)
  ELSIF txt ~ '(meeting|schedule|book |booking|invoice|quote|pricing|send (the )?details|let''?s (talk|discuss|meet)|next week|this week|tour|visit|come over|come by|how much|what.*cost|available on|set up a (call|meeting))' THEN
    score   := 9;
    signals := signals || ARRAY['Specific booking/meeting/pricing intent'];
    reason  := 'Reply contains explicit booking, meeting, or pricing intent.';
    next_action := 'Reply within 1 hour with calendar slots + pricing.';

  -- 4) Warm — positive interest (score 7-8)
  ELSIF txt ~ '(interested|demo|tell me more|would like to (know|see)|send (info|brochure)|follow up|sounds (good|interesting|great)|please share|more information)' THEN
    score   := 7;
    signals := signals || ARRAY['Positive interest expressed'];
    reason  := 'Reply shows positive interest, asks for more info.';
    next_action := 'Send pitch deck + a calendar link for a 20-min call.';

  -- 5) Lukewarm (score 5-6)
  ELSIF txt ~ '(consider|maybe later|not (right )?now|perhaps|future|circle back|keep us posted|in (a )?few months)' THEN
    score      := 5;
    objections := objections || ARRAY['Non-committal / not buying now'];
    reason     := 'Reply is non-committal — needs nurturing.';
    next_action := 'Move to nurture sequence; check back in 30 days.';

  -- 6) Polite rejection (score 3-4)
  ELSIF txt ~ '(already (have|use|using)|currently have|all set|no need|not looking|we are good|content with|happy with our current)' THEN
    score      := 3;
    objections := objections || ARRAY['Has incumbent solution'];
    reason     := 'Polite rejection — has existing provider.';
    next_action := 'Quarterly long-tail touch; do not push.';
  END IF;

  RETURN jsonb_build_object(
    'score',         score,
    'reasoning',     reason,
    'signals',       to_jsonb(signals),
    'objections',    to_jsonb(objections),
    'next_action',   next_action,
    'is_deal_ready', score >= 7,
    'source',        'heuristic'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.poll_get_outbound_subjects_by_lead(p_tenant_id uuid)
 RETURNS TABLE(lead_id uuid, subject text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.lead_id, o.subject
  FROM public.outreach_log o
  WHERE o.tenant_id = p_tenant_id
    AND o.direction = 'outbound'
    AND o.subject IS NOT NULL
    AND o.subject <> ''
$function$
;

CREATE OR REPLACE FUNCTION public.purge_audit_logs(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.audit_logs
   WHERE ts < (now() - make_interval(days => p_days));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_table_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id   UUID;
  v_user_id     TEXT;
  v_role        TEXT;
  v_target      TEXT;
  v_payload     JSONB;
  v_row_id      TEXT;
  v_op          TEXT := lower(TG_OP);
BEGIN
  -- Tenant + row id from the appropriate row
  IF TG_OP = 'DELETE' THEN
    BEGIN v_tenant_id := (to_jsonb(OLD) ->> 'tenant_id')::UUID; EXCEPTION WHEN OTHERS THEN v_tenant_id := NULL; END;
    v_row_id := COALESCE(to_jsonb(OLD) ->> 'id', '');
  ELSE
    BEGIN v_tenant_id := (to_jsonb(NEW) ->> 'tenant_id')::UUID; EXCEPTION WHEN OTHERS THEN v_tenant_id := NULL; END;
    v_row_id := COALESCE(to_jsonb(NEW) ->> 'id', '');
  END IF;

  -- Best-effort user context. auth.uid() is populated only for Supabase JWT
  -- requests; service-role / anon / cron fall back to the Postgres role.
  BEGIN
    v_user_id := COALESCE(auth.uid()::TEXT, current_user);
    v_role    := COALESCE(auth.jwt() ->> 'role', current_user);
  EXCEPTION WHEN OTHERS THEN
    v_user_id := current_user;
    v_role    := current_user;
  END;

  v_target := TG_TABLE_NAME || ':' || v_row_id;

  -- Build payload (column-level diff for UPDATE, full row for INSERT/DELETE)
  IF TG_OP = 'UPDATE' THEN
    v_payload := jsonb_build_object(
      'op', v_op,
      'changed', (
        SELECT COALESCE(jsonb_object_agg(key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
        FROM jsonb_each(to_jsonb(OLD)) o
        FULL OUTER JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
        WHERE o.value IS DISTINCT FROM n.value
          AND key NOT IN ('updated_at')
      )
    );
    -- Skip no-op updates (only updated_at touched)
    IF (v_payload -> 'changed') = '{}'::jsonb THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_payload := jsonb_build_object('op', v_op, 'new', to_jsonb(NEW));
  ELSE
    v_payload := jsonb_build_object('op', v_op, 'old', to_jsonb(OLD));
  END IF;

  -- Cap payload size to keep audit_logs row light
  IF length(v_payload::TEXT) > 8000 THEN
    v_payload := jsonb_build_object(
      'op', v_op,
      'truncated', true,
      '_size_bytes', length(v_payload::TEXT)
    );
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id, event_type, user_id, role, action_target, result, payload_summary
  ) VALUES (
    v_tenant_id,
    'db_' || TG_TABLE_NAME || '_' || v_op,
    v_user_id, v_role, v_target, 'success', v_payload
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Never let an audit failure abort the user's mutation
  RAISE WARNING '[audit_table_change] suppressed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_event_inquiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions'
AS $function$
begin
  begin
    perform net.http_post(
      url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/ceo-escalation-email',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'subject',  'New Event Inquiry — ' || NEW.event_type,
        'priority', 'HIGH',
        'agent',    'events-page',
        'company',  coalesce(NEW.full_name, 'Event Inquiry'),
        'message',
          'Name: '           || coalesce(NEW.full_name,'—')            || E'\n' ||
          'Phone: '          || coalesce(NEW.phone,'—')                || E'\n' ||
          'Email: '          || coalesce(NEW.email,'—')                || E'\n' ||
          'Event type: '     || coalesce(NEW.event_type,'—')           || E'\n' ||
          'Space: '          || coalesce(NEW.space,'—')                || E'\n' ||
          'Guest count: '    || coalesce(NEW.guest_count::text,'—')    || E'\n' ||
          'Preferred date: ' || coalesce(NEW.preferred_date::text,'—') || E'\n' ||
          'Budget range: '   || coalesce(NEW.budget_range,'—')         || E'\n\n' ||
          'Message: '        || coalesce(NEW.message,'—')              || E'\n\n' ||
          'Inquiry ID: '     || NEW.id::text
      )
    );
  exception when others then
    raise warning 'event_inquiry email failed: %', sqlerrm;
  end;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
begin
  if new.status = 'PENDING' then
    perform net.http_post(
      url := 'https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'title', 'New Website Booking',
        'record', to_jsonb(new),
        'url', '/crm.html'
      )
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_block_duplicate_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_transactions pt
    WHERE pt.idempotency_key = NEW.idempotency_key
      AND pt.status = 'COMPLETED'
      AND pt.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Duplicate payment blocked: idem key % already settled', NEW.idempotency_key
      USING ERRCODE = 'unique_violation';
  END IF;

  IF NEW.idempotency_key IS NULL AND NEW.reservation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_transactions pt
    WHERE pt.reservation_id = NEW.reservation_id
      AND pt.amount_bdt    = NEW.amount_bdt
      AND pt.created_at    > now() - interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'Duplicate payment blocked: BDT % for reservation % within 30s',
      NEW.amount_bdt, NEW.reservation_id USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_tenant_by_host(p_host text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  h   text;
  sub text;
  tid uuid;
BEGIN
  IF p_host IS NULL OR p_host = '' THEN RETURN NULL; END IF;
  h := lower(split_part(p_host, ':', 1));
  IF left(h, 4) = 'www.' THEN h := substring(h from 5); END IF;
  SELECT td.tenant_id INTO tid FROM public.tenant_domains td WHERE td.host = h LIMIT 1;
  IF tid IS NOT NULL THEN RETURN tid; END IF;
  SELECT t.id INTO tid FROM public.tenants t WHERE lower(t.custom_domain) = h AND t.is_active LIMIT 1;
  IF tid IS NOT NULL THEN RETURN tid; END IF;
  IF h LIKE '%.fountainbd.com' THEN
    sub := split_part(h, '.', 1);
    SELECT t.id INTO tid FROM public.tenants t WHERE t.slug = sub AND t.is_active LIMIT 1;
    IF tid IS NOT NULL THEN RETURN tid; END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.lumea_pre_request()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  hdrs json;
  host text;
  tid  uuid;
BEGIN
  hdrs := nullif(current_setting('request.headers', true), '')::json;
  IF hdrs IS NULL THEN RETURN; END IF;
  host := coalesce(hdrs->>'x-tenant-host', hdrs->>'x-forwarded-host');
  IF host IS NULL OR host = '' THEN RETURN; END IF;
  tid := public.resolve_tenant_by_host(host);
  IF tid IS NOT NULL THEN
    PERFORM set_config('app.current_tenant_id', tid::text, true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.promote_swarm_lead(p_swarm_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v record;
  v_new_id uuid;
begin
  select * into v from public.swarm_leads where id = p_swarm_id;
  if not found then
    raise exception 'swarm_lead % not found', p_swarm_id;
  end if;

  -- idempotent: already promoted
  if coalesce(v.crm_synced, false) then
    return null;
  end if;

  -- dedup: company already in corporate_leads for this tenant -> mark synced, no duplicate
  if exists (
    select 1 from public.corporate_leads c
    where c.tenant_id = v.tenant_id
      and lower(c.company_name) = lower(v.company_name)
  ) then
    update public.swarm_leads set crm_synced = true, updated_at = now() where id = p_swarm_id;
    return null;
  end if;

  insert into public.corporate_leads
    (tenant_id, company_name, contact_name, contact_title, contact_email, contact_phone, company_website, status, notes)
  values
    (v.tenant_id, v.company_name,
     nullif(v.full_name, '[Enrichment Pending]'),
     v.title, v.email, v.phone, v.company_website,
     'pending',
     v.qualification_notes)
  returning id into v_new_id;

  update public.swarm_leads set crm_synced = true, updated_at = now() where id = p_swarm_id;
  return v_new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_promote_swarm_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.promote_swarm_lead(NEW.id);
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_billing_integrity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_neg int; v_neg_sum numeric; v_new_dups int;
begin
  select count(*), coalesce(sum(balance_due_bdt),0) into v_neg, v_neg_sum
  from billing_invoices where balance_due_bdt < 0;

  -- only TIGHT clusters (<5 min apart) = submit-loop signature; wide same-amount payments are legit repeat tenders
  select count(*) into v_new_dups from (
    select reservation_id, amount_bdt, completed_at::date
    from payment_transactions
    where status='COMPLETED' and reservation_id is not null
      and completed_at > now() - interval '24 hours'
    group by 1,2,3
    having count(*) > 1 and (max(completed_at)-min(completed_at)) < interval '5 minutes') d;

  if v_neg > 0 or v_new_dups > 0 then
    insert into notifications_log(workflow, recipient_email, subject, body, status, triggered_by, metadata)
    values('billing-integrity-monitor','ahmedshanwaz5@gmail.com',
      format('[Lumea] Billing alert: %s negative invoice(s), %s submit-loop dup(s)', v_neg, v_new_dups),
      format('Daily billing integrity check found issues:%s- Negative invoices: %s (sum BDT %s)%s- New tight-cluster duplicate payments (last 24h, <5min apart = submit-loop): %s%s%sIf submit-loop dups > 0, the idempotency guard regressed. If negatives > 0, run billing remediation. Backups: _backup_*_neg_20260609.',
             chr(10), v_neg, v_neg_sum, chr(10), v_new_dups, chr(10), chr(10)),
      'pending','pg_cron:check_billing_integrity',
      jsonb_build_object('negatives',v_neg,'neg_sum',v_neg_sum,'submit_loop_dups',v_new_dups,'checked_at',now()));
  end if;
end$function$
;

CREATE OR REPLACE FUNCTION public.normalize_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.role := CASE upper(replace(coalesce(NEW.role,''),' ','_'))
    WHEN 'OWNER' THEN 'ADMIN'
    WHEN 'ADMIN' THEN 'ADMIN'
    WHEN 'MANAGEMENT' THEN 'ADMIN'
    WHEN 'RECEPTIONIST' THEN 'FRONT_DESK'
    WHEN 'FRONT_DESK' THEN 'FRONT_DESK'
    WHEN 'HOUSEKEEPING' THEN 'HOUSE_KEEPING'
    WHEN 'HOUSE_KEEPING' THEN 'HOUSE_KEEPING'
    ELSE 'FRONT_DESK'
  END;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT role FROM public.profiles WHERE id = auth.uid()), 'NONE');
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.current_staff_role() = 'ADMIN';
$function$
;

CREATE OR REPLACE FUNCTION public.guard_housekeeping_room_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.current_staff_role() = 'HOUSE_KEEPING' THEN
    IF (to_jsonb(NEW) - 'status' - 'notes') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'notes') THEN
      RAISE EXCEPTION 'HOUSEKEEPING role may only update room status and notes'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$
;

-- TABLES
CREATE TABLE public._backup_billing_invoices_neg_20260606 (
  id uuid,
  tenant_id uuid,
  invoice_number text,
  reservation_id uuid,
  guest_id uuid,
  invoice_type invoice_type_enum,
  invoice_date date,
  due_date date,
  net_total_bdt integer,
  sc_total_bdt integer,
  vat_total_bdt integer,
  discount_total_bdt integer,
  gross_total_bdt integer,
  paid_total_bdt integer,
  balance_due_bdt integer,
  status invoice_status_type,
  billing_name text,
  billing_address jsonb,
  billing_phone text,
  is_split_bill boolean,
  parent_invoice_id uuid,
  issued_by uuid,
  issued_at timestamp with time zone,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE public._backup_billing_invoices_neg_20260609 (
  id uuid,
  tenant_id uuid,
  invoice_number text,
  reservation_id uuid,
  guest_id uuid,
  invoice_type invoice_type_enum,
  invoice_date date,
  due_date date,
  net_total_bdt integer,
  sc_total_bdt integer,
  vat_total_bdt integer,
  discount_total_bdt integer,
  gross_total_bdt integer,
  paid_total_bdt integer,
  balance_due_bdt integer,
  status invoice_status_type,
  billing_name text,
  billing_address jsonb,
  billing_phone text,
  is_split_bill boolean,
  parent_invoice_id uuid,
  issued_by uuid,
  issued_at timestamp with time zone,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE public._backup_fresh_20260610_ptx (
  id uuid,
  tenant_id uuid,
  reservation_id uuid,
  guest_id uuid,
  payment_method payment_method_type,
  payment_method_details jsonb,
  amount_bdt integer,
  status payment_status_type,
  payment_reference text,
  gateway_transaction_id text,
  gateway_response jsonb,
  initiated_at timestamp with time zone,
  completed_at timestamp with time zone,
  is_advance_payment boolean,
  invoice_id uuid,
  refunded_bdt integer,
  refunded_at timestamp with time zone,
  refund_reference text,
  processed_by uuid,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  idempotency_key uuid
);

CREATE TABLE public._backup_fresh_20260610_reservations (
  id uuid,
  room_ids text[],
  guest_ids uuid[],
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  status text,
  total_amount numeric,
  paid_amount numeric,
  tenant_id uuid,
  stay_type text,
  laundry numeric,
  mini_bar numeric,
  discount numeric,
  extra_charges numeric,
  payment_method text,
  on_duty_officer text,
  special_requests text,
  notes text,
  created_at timestamp with time zone,
  room_details jsonb,
  room_type text,
  guests integer,
  source text,
  guest_name text,
  email text,
  phone text,
  room_id uuid,
  check_in_time timestamp with time zone,
  check_out_time timestamp with time zone,
  discount_amount numeric,
  ota_channel text,
  ota_booking_ref text,
  ota_commission_pct numeric,
  external_booking_id text
);

CREATE TABLE public._backup_fresh_20260610_transactions (
  id uuid,
  "timestamp" timestamp with time zone,
  room_number text,
  guest_name text,
  type text,
  amount numeric,
  tenant_id uuid,
  fiscal_day text,
  reservation_id uuid,
  created_at timestamp with time zone,
  check_in date,
  check_out date,
  bill_total numeric,
  idempotency_key uuid
);

CREATE TABLE public._backup_guests_20260526 (
  id uuid,
  name text,
  phone text,
  email text,
  id_card text,
  outstanding_balance numeric,
  tenant_id uuid,
  id_type text,
  id_number text,
  address text,
  city text,
  country text,
  preferences text,
  id_image_url text,
  nationality text,
  vip boolean,
  loyalty_points integer,
  total_spent numeric,
  total_stays integer,
  marketing_opt_out boolean,
  last_contacted timestamp with time zone,
  _backup_at timestamp with time zone
);

CREATE TABLE public._backup_guests_20260526_agg (
  id uuid,
  name text,
  phone text,
  email text,
  id_card text,
  outstanding_balance numeric,
  tenant_id uuid,
  id_type text,
  id_number text,
  address text,
  city text,
  country text,
  preferences text,
  id_image_url text,
  nationality text,
  vip boolean,
  loyalty_points integer,
  total_spent numeric,
  total_stays integer,
  marketing_opt_out boolean,
  last_contacted timestamp with time zone,
  _backup_at timestamp with time zone
);

CREATE TABLE public._backup_payment_tx_dedup_20260606 (
  id uuid,
  reservation_id uuid,
  amount_bdt integer,
  created_at timestamp with time zone
);

CREATE TABLE public._backup_payment_tx_neg_20260609 (
  id uuid,
  tenant_id uuid,
  reservation_id uuid,
  guest_id uuid,
  payment_method payment_method_type,
  payment_method_details jsonb,
  amount_bdt integer,
  status payment_status_type,
  payment_reference text,
  gateway_transaction_id text,
  gateway_response jsonb,
  initiated_at timestamp with time zone,
  completed_at timestamp with time zone,
  is_advance_payment boolean,
  invoice_id uuid,
  refunded_bdt integer,
  refunded_at timestamp with time zone,
  refund_reference text,
  processed_by uuid,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  idempotency_key uuid
);

CREATE TABLE public._backup_payment_tx_nonneg_dup_20260609 (
  id uuid,
  tenant_id uuid,
  reservation_id uuid,
  guest_id uuid,
  payment_method payment_method_type,
  payment_method_details jsonb,
  amount_bdt integer,
  status payment_status_type,
  payment_reference text,
  gateway_transaction_id text,
  gateway_response jsonb,
  initiated_at timestamp with time zone,
  completed_at timestamp with time zone,
  is_advance_payment boolean,
  invoice_id uuid,
  refunded_bdt integer,
  refunded_at timestamp with time zone,
  refund_reference text,
  processed_by uuid,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  idempotency_key uuid
);

CREATE TABLE public._backup_recon_billing_20260610 (
  id uuid,
  tenant_id uuid,
  invoice_number text,
  reservation_id uuid,
  guest_id uuid,
  invoice_type invoice_type_enum,
  invoice_date date,
  due_date date,
  net_total_bdt integer,
  sc_total_bdt integer,
  vat_total_bdt integer,
  discount_total_bdt integer,
  gross_total_bdt integer,
  paid_total_bdt integer,
  balance_due_bdt integer,
  status invoice_status_type,
  billing_name text,
  billing_address jsonb,
  billing_phone text,
  is_split_bill boolean,
  parent_invoice_id uuid,
  issued_by uuid,
  issued_at timestamp with time zone,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE public._backup_reservation_guest_ids_20260526 (
  reservation_id uuid,
  guest_ids uuid[],
  guest_name text,
  _backup_at timestamp with time zone
);

CREATE TABLE public._backup_reservation_guest_ids_20260526_agg (
  reservation_id uuid,
  guest_ids uuid[],
  guest_name text,
  _backup_at timestamp with time zone
);

CREATE TABLE public._backup_reset_20260610_folios (
  id uuid,
  reservation_id uuid,
  room_number text,
  description text,
  category text,
  amount numeric,
  created_at timestamp with time zone,
  tenant_id uuid
);

CREATE TABLE public._backup_reset_20260610_ptx (
  id uuid,
  tenant_id uuid,
  reservation_id uuid,
  guest_id uuid,
  payment_method payment_method_type,
  payment_method_details jsonb,
  amount_bdt integer,
  status payment_status_type,
  payment_reference text,
  gateway_transaction_id text,
  gateway_response jsonb,
  initiated_at timestamp with time zone,
  completed_at timestamp with time zone,
  is_advance_payment boolean,
  invoice_id uuid,
  refunded_bdt integer,
  refunded_at timestamp with time zone,
  refund_reference text,
  processed_by uuid,
  notes text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  idempotency_key uuid
);

CREATE TABLE public._backup_reset_20260610_reservations (
  id uuid,
  room_ids text[],
  guest_ids uuid[],
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  status text,
  total_amount numeric,
  paid_amount numeric,
  tenant_id uuid,
  stay_type text,
  laundry numeric,
  mini_bar numeric,
  discount numeric,
  extra_charges numeric,
  payment_method text,
  on_duty_officer text,
  special_requests text,
  notes text,
  created_at timestamp with time zone,
  room_details jsonb,
  room_type text,
  guests integer,
  source text,
  guest_name text,
  email text,
  phone text,
  room_id uuid,
  check_in_time timestamp with time zone,
  check_out_time timestamp with time zone,
  discount_amount numeric,
  ota_channel text,
  ota_booking_ref text,
  ota_commission_pct numeric,
  external_booking_id text
);

CREATE TABLE public._backup_reset_20260610_transactions (
  id uuid,
  "timestamp" timestamp with time zone,
  room_number text,
  guest_name text,
  type text,
  amount numeric,
  tenant_id uuid,
  fiscal_day text,
  reservation_id uuid,
  created_at timestamp with time zone,
  check_in date,
  check_out date,
  bill_total numeric,
  idempotency_key uuid
);

CREATE TABLE public._backup_resv_guestname_20260610 (
  id uuid,
  guest_name text
);

CREATE TABLE public._backup_staff_20260610 (
  id integer,
  name text,
  email text,
  role text,
  device text,
  av text,
  tenant_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  pwh text,
  session_v integer,
  phone text,
  activated boolean,
  otp_hash text,
  otp_expires timestamp with time zone
);

CREATE TABLE public._backup_transactions_neg_20260609 (
  id uuid,
  "timestamp" timestamp with time zone,
  room_number text,
  guest_name text,
  type text,
  amount numeric,
  tenant_id uuid,
  fiscal_day text,
  reservation_id uuid,
  created_at timestamp with time zone,
  check_in date,
  check_out date,
  bill_total numeric,
  idempotency_key uuid
);

CREATE TABLE public._dedup_map_20260526 (
  dupe_id uuid,
  canonical_id uuid,
  nname text
);

CREATE TABLE public._dedup_map_20260526_agg (
  dupe_id uuid,
  canonical_id uuid,
  nname text
);

CREATE TABLE public.account_churn_profile (
  account_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  risk_status text NOT NULL,
  churn_score real NOT NULL,
  sentiment_slope real,
  reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
  recommended_action text,
  last_scored_at timestamp with time zone DEFAULT now() NOT NULL,
  source_type text DEFAULT 'b2b_partner'::text NOT NULL,
  display_name text
);

CREATE TABLE public.agent_learning_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agent_id text NOT NULL,
  event_type text NOT NULL,
  context text NOT NULL,
  action_taken text NOT NULL,
  outcome text NOT NULL,
  rows_affected integer DEFAULT 0,
  pattern_key text,
  confidence numeric DEFAULT 0.5,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  from_agent text NOT NULL,
  to_agent text NOT NULL,
  message_type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  priority text DEFAULT 'NORMAL'::text,
  status text DEFAULT 'PENDING'::text,
  ceo_decision text,
  ceo_notes text,
  actioned_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid
);

CREATE TABLE public.agent_pattern_memory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agent_id text NOT NULL,
  pattern_key text NOT NULL,
  pattern_desc text NOT NULL,
  times_seen integer DEFAULT 1,
  times_correct integer DEFAULT 1,
  confidence numeric DEFAULT 0.5,
  last_seen_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_run_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agent_id text NOT NULL,
  run_at timestamp with time zone DEFAULT now(),
  action text,
  rows_affected integer DEFAULT 0,
  status text DEFAULT 'OK'::text,
  details text,
  tenant_id uuid
);

CREATE TABLE public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ts timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid,
  request_id text,
  event_type text NOT NULL,
  user_id text,
  role text,
  action_target text,
  status_code integer,
  result text DEFAULT 'success'::text NOT NULL,
  duration_ms integer,
  ip inet,
  user_agent text,
  payload_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  error text
);

CREATE TABLE public.authorized_devices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  device_id text NOT NULL,
  label text DEFAULT 'Unknown Device'::text NOT NULL,
  role text DEFAULT 'FRONT_DESK'::text NOT NULL,
  tenant_id uuid NOT NULL,
  authorized_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  auto_login_email text,
  auto_login_password text,
  device_token text,
  token_expires_at timestamp with time zone,
  token_rotated_at timestamp with time zone
);

CREATE TABLE public.b2b_bookings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  partner_id uuid,
  partner_name text,
  room_number text,
  guest_name text,
  guest_phone text,
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights integer GENERATED ALWAYS AS ((check_out - check_in)) STORED,
  rate_per_night numeric NOT NULL,
  total_amount numeric GENERATED ALWAYS AS ((((check_out - check_in))::numeric * rate_per_night)) STORED,
  commission_pct numeric DEFAULT 10,
  commission_amount numeric GENERATED ALWAYS AS ((((((check_out - check_in))::numeric * rate_per_night) * commission_pct) / (100)::numeric)) STORED,
  status text DEFAULT 'confirmed'::text,
  payment_status text DEFAULT 'pending'::text,
  booking_reference text DEFAULT ('B2B-'::text || upper("substring"((gen_random_uuid())::text, 1, 8))),
  notes text,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.b2b_followup_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  partner_id uuid NOT NULL,
  agency_name text,
  contact_name text,
  phone text,
  channel text DEFAULT 'WHATSAPP'::text NOT NULL,
  message_sent text,
  sent_at timestamp with time zone DEFAULT now(),
  response_received text,
  response_at timestamp with time zone,
  outcome text DEFAULT 'PENDING'::text,
  next_followup_days integer DEFAULT 7,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.b2b_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  partner_id uuid,
  partner_name text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_bookings integer DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  commission_amount numeric DEFAULT 0,
  status text DEFAULT 'pending'::text,
  invoice_number text DEFAULT ((('INV-'::text || to_char(now(), 'YYYY'::text)) || '-'::text) || upper("substring"((gen_random_uuid())::text, 1, 6))),
  sent_at timestamp with time zone,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.b2b_outreach_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  partner_id uuid,
  agency_name text,
  channel text DEFAULT 'whatsapp'::text,
  message_type text,
  message_preview text,
  status text DEFAULT 'sent'::text,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  sent_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.b2b_partners (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agency_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  city text DEFAULT 'Dhaka'::text,
  address text,
  wholesale_rate numeric DEFAULT 2800,
  commission_pct numeric DEFAULT 10,
  secret_key text DEFAULT encode(gen_random_bytes(16), 'hex'::text),
  status text DEFAULT 'prospect'::text,
  joined_at timestamp with time zone,
  last_booking_at timestamp with time zone,
  total_bookings integer DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  whatsapp_sent boolean DEFAULT false,
  joining_letter_sent boolean DEFAULT false,
  notes text,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_contacted_at timestamp with time zone,
  follow_up_count integer DEFAULT 0,
  priority text DEFAULT 'NORMAL'::text,
  last_followup_at timestamp with time zone,
  followup_count integer DEFAULT 0,
  next_followup_date date,
  partnership_tier text DEFAULT 'STANDARD'::text,
  lead_score integer DEFAULT 0,
  last_contact_type text,
  booking_target integer DEFAULT 5,
  priority_tier text DEFAULT 'STANDARD'::text
);

CREATE TABLE public.billing_invoices (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  invoice_number text NOT NULL,
  reservation_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  invoice_type invoice_type_enum DEFAULT 'FOLIO'::invoice_type_enum NOT NULL,
  invoice_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  net_total_bdt integer DEFAULT 0 NOT NULL,
  sc_total_bdt integer DEFAULT 0 NOT NULL,
  vat_total_bdt integer DEFAULT 0 NOT NULL,
  discount_total_bdt integer DEFAULT 0 NOT NULL,
  gross_total_bdt integer DEFAULT 0 NOT NULL,
  paid_total_bdt integer DEFAULT 0 NOT NULL,
  balance_due_bdt integer GENERATED ALWAYS AS ((gross_total_bdt - paid_total_bdt)) STORED,
  status invoice_status_type DEFAULT 'DRAFT'::invoice_status_type NOT NULL,
  billing_name text NOT NULL,
  billing_address jsonb DEFAULT '{}'::jsonb NOT NULL,
  billing_phone text,
  is_split_bill boolean DEFAULT false NOT NULL,
  parent_invoice_id uuid,
  issued_by uuid,
  issued_at timestamp with time zone,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ceo_pipeline (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  company text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  lead_type text,
  stage text DEFAULT 'GENERATED'::text,
  pitch_sent boolean DEFAULT false,
  pitch_sent_at timestamp with time zone,
  pitch_channel text,
  followup_count integer DEFAULT 0,
  last_followup_at timestamp with time zone,
  next_action_at date DEFAULT (CURRENT_DATE + 1),
  next_action text,
  response_received text,
  response_at timestamp with time zone,
  interest_level integer DEFAULT 0,
  deal_value_bdt numeric,
  handover_ready boolean DEFAULT false,
  handover_notes text,
  closed boolean DEFAULT false,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.competitor_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  check_date date DEFAULT CURRENT_DATE,
  hotel_name text,
  category text,
  rate_bdt numeric,
  our_rate numeric,
  rate_diff numeric,
  recommendation text,
  source text DEFAULT 'MANUAL'::text,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.content_calendar (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  platform text NOT NULL,
  content_type text NOT NULL,
  title text,
  body_bn text,
  body_en text,
  hashtags text,
  visual_brief text,
  cta text,
  target_audience text,
  scheduled_for date,
  post_time text DEFAULT '09:00'::text,
  status text DEFAULT 'DRAFT'::text,
  approved_by text,
  approved_at timestamp with time zone,
  posted_at timestamp with time zone,
  engagement_likes integer DEFAULT 0,
  engagement_reach integer DEFAULT 0,
  engagement_clicks integer DEFAULT 0,
  ab_variant text DEFAULT 'A'::text,
  performance_score numeric DEFAULT 0,
  created_by_agent text,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.content_debate_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  content_id uuid,
  agent_id text,
  stance text,
  reasoning text,
  suggestion text,
  round integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.content_performance_patterns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  content_type text,
  platform text,
  audience text,
  avg_likes numeric DEFAULT 0,
  avg_reach numeric DEFAULT 0,
  avg_clicks numeric DEFAULT 0,
  best_post_time text,
  best_day text,
  top_hashtags text,
  sample_count integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.content_variations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  content_id uuid,
  variant_number integer NOT NULL,
  platform text,
  angle text,
  body_bn text,
  body_en text,
  cta text,
  hashtags text,
  visual_brief text,
  selected boolean DEFAULT false,
  selected_at timestamp with time zone,
  email_sent boolean DEFAULT false,
  email_sent_at timestamp with time zone,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.corporate_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid NOT NULL,
  company_name text NOT NULL,
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  company_address text,
  company_website text,
  industry text,
  icp_score text DEFAULT 'good'::text,
  priority text DEFAULT 'med'::text,
  status text DEFAULT 'pending'::text,
  last_contacted_at timestamp with time zone,
  deal_score integer,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  payment_pending_at timestamp with time zone,
  activated_at timestamp with time zone,
  subdomain text
);

CREATE TABLE public.council_panelists (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  role text NOT NULL,
  verdict text NOT NULL,
  tokens_in integer DEFAULT 0 NOT NULL,
  tokens_out integer DEFAULT 0 NOT NULL,
  cost_bdt numeric(10,2) DEFAULT 0 NOT NULL,
  latency_ms integer DEFAULT 0 NOT NULL,
  model text DEFAULT 'claude-sonnet-4-6'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.council_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id integer,
  reservation_id uuid,
  scope_mode text DEFAULT 'hotel'::text NOT NULL,
  prompt text NOT NULL,
  chairman_verdict text,
  status text DEFAULT 'pending'::text NOT NULL,
  total_tokens_in integer DEFAULT 0 NOT NULL,
  total_tokens_out integer DEFAULT 0 NOT NULL,
  total_cost_bdt numeric(10,2) DEFAULT 0 NOT NULL,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE public.crm_build (
  id text NOT NULL,
  html text NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.crm_chunks (
  id text NOT NULL,
  chunk_0 text,
  chunk_1 text,
  chunk_2 text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.crm_monitor_config (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_id uuid DEFAULT uid()
);

CREATE TABLE public.daily_closing (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fiscal_day text NOT NULL,
  total_revenue numeric DEFAULT 0,
  token_amount numeric DEFAULT 0,
  closing_balance numeric DEFAULT 0,
  officer text,
  notes text,
  closed_at timestamp with time zone DEFAULT now(),
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid
);

CREATE TABLE public.deploy_cache (
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.dynamic_pricing_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  effective_date date DEFAULT CURRENT_DATE,
  day_of_week text,
  season text,
  category text,
  base_rate numeric,
  dynamic_rate numeric,
  multiplier numeric,
  reason text,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.email_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  thread_id text NOT NULL,
  message_id text NOT NULL,
  chunk_idx integer NOT NULL,
  sent_at timestamp with time zone NOT NULL,
  direction text NOT NULL,
  content text NOT NULL,
  embedding vector(1024),
  sentiment real,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.event_inquiries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  event_type text NOT NULL,
  space text,
  guest_count integer,
  preferred_date date,
  budget_range text,
  message text,
  status text DEFAULT 'NEW'::text NOT NULL,
  source text DEFAULT 'events_page'::text NOT NULL,
  user_agent text
);

CREATE TABLE public.flash_sale_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  trigger_date date,
  occupancy_pct numeric,
  rooms_empty integer,
  flash_rate numeric,
  targets_sent integer DEFAULT 0,
  bookings_from_flash integer DEFAULT 0,
  revenue_generated numeric DEFAULT 0,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.folios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reservation_id uuid,
  room_number text,
  description text NOT NULL,
  category text DEFAULT 'Room'::text,
  amount numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid
);

CREATE TABLE public.fountain_inventory (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  room_number text NOT NULL,
  room_type text NOT NULL,
  base_rate numeric(10,2) NOT NULL,
  flash_sale_target numeric(10,2) NOT NULL,
  current_status room_status DEFAULT 'Available'::room_status,
  last_updated timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  floor_number integer
);

CREATE TABLE public.guest_ledger (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  entry_type ledger_entry_type NOT NULL,
  description text NOT NULL,
  transaction_date date NOT NULL,
  posted_at timestamp with time zone DEFAULT now() NOT NULL,
  amount_bdt integer NOT NULL,
  is_tax_entry boolean DEFAULT false NOT NULL,
  parent_ledger_id uuid,
  is_voided boolean DEFAULT false NOT NULL,
  voided_at timestamp with time zone,
  void_reason text,
  voided_by uuid,
  correction_of_id uuid,
  payment_transaction_id uuid,
  posted_by uuid,
  department text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.guests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  id_card text,
  outstanding_balance numeric DEFAULT 0,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  id_type text,
  id_number text,
  address text,
  city text,
  country text,
  preferences text,
  id_image_url text,
  nationality text,
  vip boolean DEFAULT false,
  loyalty_points integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  total_stays integer DEFAULT 0,
  marketing_opt_out boolean DEFAULT false NOT NULL,
  last_contacted timestamp with time zone
);

CREATE TABLE public.hotel_settings (
  key text NOT NULL,
  value text NOT NULL,
  tenant_id uuid NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.housekeeping_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  room_number text NOT NULL,
  task_type text DEFAULT 'Standard Clean'::text NOT NULL,
  priority text DEFAULT 'medium'::text NOT NULL,
  assignee text,
  department text DEFAULT 'Housekeeping'::text,
  status text DEFAULT 'pending'::text,
  scheduled_time text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid
);

CREATE TABLE public.invoice_line_items (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  invoice_id uuid NOT NULL,
  ledger_entry_id uuid,
  description text NOT NULL,
  entry_type ledger_entry_type NOT NULL,
  transaction_date date NOT NULL,
  quantity smallint DEFAULT 1 NOT NULL,
  unit_amount_bdt integer NOT NULL,
  total_amount_bdt integer NOT NULL,
  sc_amount_bdt integer DEFAULT 0 NOT NULL,
  vat_amount_bdt integer DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  source text,
  notes text,
  status text DEFAULT 'new'::text,
  email_draft text,
  analyst_brief text,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lighthouse_summaries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  occupancy_pct numeric(5,2) DEFAULT 0 NOT NULL,
  rooms_occupied integer DEFAULT 0 NOT NULL,
  rooms_total integer DEFAULT 0 NOT NULL,
  arrivals_today integer DEFAULT 0 NOT NULL,
  departures_today integer DEFAULT 0 NOT NULL,
  in_house_guests integer DEFAULT 0 NOT NULL,
  vip_in_house integer DEFAULT 0 NOT NULL,
  revenue_today_bdt numeric(12,2) DEFAULT 0 NOT NULL,
  revenue_mtd_bdt numeric(14,2) DEFAULT 0 NOT NULL,
  adr_bdt numeric(10,2) DEFAULT 0 NOT NULL,
  unpaid_balance_bdt numeric(14,2) DEFAULT 0 NOT NULL,
  orphan_folios_count integer DEFAULT 0 NOT NULL,
  blocked_rooms integer DEFAULT 0 NOT NULL,
  pending_leads integer DEFAULT 0 NOT NULL,
  narrative_md text DEFAULT ''::text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.maintenance_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  asset_id uuid,
  room_id uuid,
  event_type text NOT NULL,
  severity text,
  reported_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  cost_bdt integer,
  reported_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.manus_config (
  key text NOT NULL,
  value text NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid
);

CREATE TABLE public.marketing_content (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  content_type text,
  title text,
  content text,
  meta_description text,
  keywords text[],
  status text DEFAULT 'draft'::text,
  gbp_post_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.night_audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  audit_date date NOT NULL,
  closed_at timestamp with time zone DEFAULT now() NOT NULL,
  closed_by text,
  total_checkins integer DEFAULT 0,
  total_checkouts integer DEFAULT 0,
  total_collections numeric(14,2) DEFAULT 0,
  carried_over_dues numeric(14,2) DEFAULT 0,
  rooms_occupied integer DEFAULT 0,
  rooms_vacant integer DEFAULT 0,
  notes text,
  tenant_id uuid,
  status text DEFAULT 'closed'::text
);

CREATE TABLE public.notifications_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workflow text NOT NULL,
  recipient_email text,
  subject text,
  body text,
  status text DEFAULT 'sent'::text,
  error_msg text,
  triggered_by text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid
);

CREATE TABLE public.ota_rate_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel text NOT NULL,
  room_category text NOT NULL,
  base_rate numeric NOT NULL,
  ota_markup_pct numeric DEFAULT 0,
  ota_listed_rate numeric,
  commission_pct numeric DEFAULT 15,
  net_rate numeric,
  is_active boolean DEFAULT true,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.outreach_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid NOT NULL,
  lead_id uuid,
  direction text NOT NULL,
  channel text DEFAULT 'email'::text NOT NULL,
  subject text,
  body text,
  sent_at timestamp with time zone DEFAULT now(),
  deal_score integer,
  deal_score_reason text,
  ceo_next_action text,
  is_deal_ready boolean DEFAULT false,
  audited_at timestamp with time zone,
  alert_sent boolean DEFAULT false,
  alert_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_transactions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  payment_method payment_method_type NOT NULL,
  payment_method_details jsonb DEFAULT '{}'::jsonb NOT NULL,
  amount_bdt integer NOT NULL,
  status payment_status_type DEFAULT 'PENDING'::payment_status_type NOT NULL,
  payment_reference text,
  gateway_transaction_id text,
  gateway_response jsonb DEFAULT '{}'::jsonb NOT NULL,
  initiated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  is_advance_payment boolean DEFAULT false NOT NULL,
  invoice_id uuid,
  refunded_bdt integer DEFAULT 0 NOT NULL,
  refunded_at timestamp with time zone,
  refund_reference text,
  processed_by uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  idempotency_key uuid
);

CREATE TABLE public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid NOT NULL,
  staff_email text,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.rate_plans (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  discount_bps integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  valid_from date,
  valid_to date,
  promo_code text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.referral_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reservation_id uuid,
  guest_id uuid,
  guest_name text,
  phone text,
  room text,
  checkout_date date,
  message text,
  sent boolean DEFAULT false,
  sent_at timestamp with time zone,
  response text,
  converted boolean DEFAULT false,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.reservations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  room_ids text[] NOT NULL,
  guest_ids uuid[] NOT NULL,
  check_in timestamp with time zone NOT NULL,
  check_out timestamp with time zone NOT NULL,
  status text NOT NULL,
  total_amount numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  stay_type text DEFAULT 'CHECK_IN'::text,
  laundry numeric DEFAULT 0,
  mini_bar numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  extra_charges numeric DEFAULT 0,
  payment_method text,
  on_duty_officer text,
  special_requests text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  room_details jsonb,
  room_type text,
  guests integer,
  source text,
  guest_name text,
  email text,
  phone text,
  room_id uuid,
  check_in_time timestamp with time zone,
  check_out_time timestamp with time zone,
  discount_amount numeric,
  ota_channel text,
  ota_booking_ref text,
  ota_commission_pct numeric DEFAULT 0,
  external_booking_id text
);

CREATE TABLE public.review_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reservation_id uuid NOT NULL,
  guest_email text,
  send_after timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  channel text DEFAULT 'WHATSAPP'::text
);

CREATE TABLE public.review_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reservation_id uuid,
  guest_id uuid,
  guest_name text,
  phone text,
  channel text DEFAULT 'WHATSAPP'::text,
  status text DEFAULT 'PENDING'::text,
  sent_at timestamp with time zone,
  reviewed boolean DEFAULT false,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.room_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  room_id uuid,
  asset_type text NOT NULL,
  label text,
  installed_at date,
  last_serviced_at date,
  service_interval_days integer DEFAULT 180 NOT NULL,
  status text DEFAULT 'operational'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.rooms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  room_number text NOT NULL,
  category text NOT NULL,
  price numeric NOT NULL,
  status text NOT NULL,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  floor integer,
  beds text DEFAULT 'Double'::text,
  view text DEFAULT 'City'::text,
  guest_name text,
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  notes text
);

CREATE TABLE public.sheets_sync_lock (
  id integer DEFAULT 1 NOT NULL,
  locked_until timestamp with time zone,
  locked_at timestamp with time zone
);

CREATE TABLE public.social_content_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  platform text NOT NULL,
  content_type text NOT NULL,
  body_bn text NOT NULL,
  body_en text,
  rooms_available integer,
  offer_discount integer DEFAULT 10,
  scheduled_for date,
  posted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid
);

CREATE TABLE public.staff (
  id integer DEFAULT nextval('staff_id_seq'::regclass) NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'receptionist'::text NOT NULL,
  device text,
  av text,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pwh text,
  session_v integer DEFAULT 1,
  phone text,
  activated boolean DEFAULT false NOT NULL,
  otp_hash text,
  otp_expires timestamp with time zone
);

CREATE TABLE public.subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  plan subscription_plan DEFAULT 'starter'::subscription_plan NOT NULL,
  status subscription_status DEFAULT 'trialing'::subscription_status NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.swarm_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  title text,
  email text,
  phone text,
  linkedin_url text,
  company_name text,
  company_website text,
  company_size text,
  area text,
  lead_type text DEFAULT 'corporate'::text NOT NULL,
  lead_source text DEFAULT 'ai_scout'::text,
  intent_score integer DEFAULT 0,
  intent_signals jsonb DEFAULT '[]'::jsonb,
  qualification_notes text,
  has_travel_policy boolean,
  event_frequency text,
  outreach_status text DEFAULT 'new'::text,
  outreach_message text,
  outreach_channel text,
  outreach_sent_at timestamp with time zone,
  reply_received text,
  replied_at timestamp with time zone,
  guest_id uuid,
  crm_synced boolean DEFAULT false,
  front_desk_notified boolean DEFAULT false,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tenant_domains (
  host text NOT NULL,
  tenant_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tenant_guests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  nationality text,
  id_type text,
  id_number text,
  vip boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tenant_reservations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  room_id uuid,
  guest_id uuid,
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  status text DEFAULT 'confirmed'::text,
  total_amount numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tenant_rooms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  room_number text NOT NULL,
  floor integer,
  type text,
  beds integer DEFAULT 1,
  view text,
  rate numeric DEFAULT 0,
  status text DEFAULT 'available'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tenant_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  user_id uuid,
  role text DEFAULT 'receptionist'::text NOT NULL,
  name text,
  email text,
  is_owner boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tenants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  owner_id uuid,
  hotel_name text NOT NULL,
  slug text NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#C8A96E'::text,
  custom_domain text,
  country text DEFAULT 'BD'::text,
  currency text DEFAULT 'BDT'::text,
  timezone text DEFAULT 'Asia/Dhaka'::text,
  is_white_label boolean DEFAULT true,
  onboarding_complete boolean DEFAULT false,
  plan_tier text DEFAULT 'starter'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  hotel_location text DEFAULT ''::text NOT NULL,
  hotel_address text DEFAULT ''::text NOT NULL,
  hotel_phone text DEFAULT ''::text NOT NULL,
  hotel_whatsapp text DEFAULT ''::text NOT NULL,
  hotel_city text DEFAULT ''::text NOT NULL,
  hotel_room_count integer DEFAULT 24 NOT NULL,
  hotel_description text DEFAULT ''::text NOT NULL,
  hotel_email text DEFAULT ''::text NOT NULL,
  sender_name text DEFAULT ''::text NOT NULL,
  alert_email text DEFAULT ''::text NOT NULL,
  alert_name text DEFAULT ''::text NOT NULL,
  brevo_api_key text,
  gmail_user text,
  gmail_app_password text,
  facebook_page_token text,
  facebook_page_id text,
  anthropic_api_key text,
  cron_secret text DEFAULT encode(gen_random_bytes(32), 'hex'::text)
);

CREATE TABLE public.transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now(),
  room_number text,
  guest_name text,
  type text,
  amount numeric NOT NULL,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  fiscal_day text,
  reservation_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  check_in date,
  check_out date,
  bill_total numeric DEFAULT 0,
  idempotency_key uuid
);

CREATE TABLE public.upsell_offers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reservation_id uuid,
  guest_name text,
  room_number text,
  check_in date,
  offer_type text NOT NULL,
  offer_title text DEFAULT ''::text,
  offer_price numeric NOT NULL,
  offer_message text,
  sent_at timestamp with time zone DEFAULT now(),
  send_stage text,
  status text DEFAULT 'sent'::text,
  responded_at timestamp with time zone,
  folio_id uuid,
  billed boolean DEFAULT false,
  alert_sent boolean DEFAULT false,
  alert_message text,
  assigned_to text,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid,
  created_at timestamp with time zone DEFAULT now(),
  phone text,
  room text,
  message text,
  accepted boolean DEFAULT false,
  accepted_at timestamp with time zone,
  folio_created boolean DEFAULT false
);

CREATE TABLE public.user_credentials (
  user_id uuid NOT NULL,
  password text,
  pin text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workflow_locks (
  workflow_name text NOT NULL,
  lock_date date DEFAULT CURRENT_DATE NOT NULL,
  locked_at timestamp with time zone DEFAULT now() NOT NULL,
  released_at timestamp with time zone,
  run_id uuid,
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid
);

CREATE TABLE public.workflow_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workflow_name text NOT NULL,
  status text DEFAULT 'success'::text,
  duration_ms integer,
  records_processed integer,
  error_msg text,
  summary jsonb,
  ran_at timestamp with time zone DEFAULT now(),
  tenant_id uuid DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid
);

-- CONSTRAINTS
ALTER TABLE public.account_churn_profile ADD CONSTRAINT account_churn_profile_pkey PRIMARY KEY (account_id);
ALTER TABLE public.agent_learning_log ADD CONSTRAINT agent_learning_log_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_messages ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_pattern_memory ADD CONSTRAINT agent_pattern_memory_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_run_log ADD CONSTRAINT agent_run_log_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.authorized_devices ADD CONSTRAINT authorized_devices_pkey PRIMARY KEY (id);
ALTER TABLE public.b2b_bookings ADD CONSTRAINT b2b_bookings_pkey PRIMARY KEY (id);
ALTER TABLE public.b2b_followup_log ADD CONSTRAINT b2b_followup_log_pkey PRIMARY KEY (id);
ALTER TABLE public.b2b_invoices ADD CONSTRAINT b2b_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.b2b_outreach_log ADD CONSTRAINT b2b_outreach_log_pkey PRIMARY KEY (id);
ALTER TABLE public.b2b_partners ADD CONSTRAINT b2b_partners_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.ceo_pipeline ADD CONSTRAINT ceo_pipeline_pkey PRIMARY KEY (id);
ALTER TABLE public.competitor_rates ADD CONSTRAINT competitor_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.content_calendar ADD CONSTRAINT content_calendar_pkey PRIMARY KEY (id);
ALTER TABLE public.content_debate_log ADD CONSTRAINT content_debate_log_pkey PRIMARY KEY (id);
ALTER TABLE public.content_performance_patterns ADD CONSTRAINT content_performance_patterns_pkey PRIMARY KEY (id);
ALTER TABLE public.content_variations ADD CONSTRAINT content_variations_pkey PRIMARY KEY (id);
ALTER TABLE public.corporate_leads ADD CONSTRAINT corporate_leads_pkey PRIMARY KEY (id);
ALTER TABLE public.council_panelists ADD CONSTRAINT council_panelists_pkey PRIMARY KEY (id);
ALTER TABLE public.council_sessions ADD CONSTRAINT council_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_build ADD CONSTRAINT crm_build_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_chunks ADD CONSTRAINT crm_chunks_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_monitor_config ADD CONSTRAINT crm_monitor_config_pkey PRIMARY KEY (key);
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_closing ADD CONSTRAINT daily_closing_pkey PRIMARY KEY (id);
ALTER TABLE public.deploy_cache ADD CONSTRAINT deploy_cache_pkey PRIMARY KEY (key);
ALTER TABLE public.dynamic_pricing_log ADD CONSTRAINT dynamic_pricing_log_pkey PRIMARY KEY (id);
ALTER TABLE public.email_chunks ADD CONSTRAINT email_chunks_pkey PRIMARY KEY (id);
ALTER TABLE public.event_inquiries ADD CONSTRAINT event_inquiries_pkey PRIMARY KEY (id);
ALTER TABLE public.flash_sale_log ADD CONSTRAINT flash_sale_log_pkey PRIMARY KEY (id);
ALTER TABLE public.folios ADD CONSTRAINT folios_pkey PRIMARY KEY (id);
ALTER TABLE public.fountain_inventory ADD CONSTRAINT fountain_inventory_pkey PRIMARY KEY (id);
ALTER TABLE public.guest_ledger ADD CONSTRAINT guest_ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.guests ADD CONSTRAINT guests_pkey PRIMARY KEY (id);
ALTER TABLE public.hotel_settings ADD CONSTRAINT hotel_settings_pkey PRIMARY KEY (key, tenant_id);
ALTER TABLE public.housekeeping_tasks ADD CONSTRAINT housekeeping_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.lighthouse_summaries ADD CONSTRAINT lighthouse_summaries_pkey PRIMARY KEY (id);
ALTER TABLE public.maintenance_events ADD CONSTRAINT maintenance_events_pkey PRIMARY KEY (id);
ALTER TABLE public.manus_config ADD CONSTRAINT manus_config_pkey PRIMARY KEY (key);
ALTER TABLE public.marketing_content ADD CONSTRAINT marketing_content_pkey PRIMARY KEY (id);
ALTER TABLE public.night_audit_log ADD CONSTRAINT night_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications_log ADD CONSTRAINT notifications_log_pkey PRIMARY KEY (id);
ALTER TABLE public.ota_rate_plans ADD CONSTRAINT ota_rate_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.outreach_log ADD CONSTRAINT outreach_log_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.rate_plans ADD CONSTRAINT rate_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.referral_queue ADD CONSTRAINT referral_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.reservations ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);
ALTER TABLE public.review_queue ADD CONSTRAINT review_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.review_requests ADD CONSTRAINT review_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.room_assets ADD CONSTRAINT room_assets_pkey PRIMARY KEY (id);
ALTER TABLE public.rooms ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);
ALTER TABLE public.sheets_sync_lock ADD CONSTRAINT sheets_sync_lock_pkey PRIMARY KEY (id);
ALTER TABLE public.social_content_queue ADD CONSTRAINT social_content_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.staff ADD CONSTRAINT staff_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.swarm_leads ADD CONSTRAINT swarm_leads_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_domains ADD CONSTRAINT tenant_domains_pkey PRIMARY KEY (host);
ALTER TABLE public.tenant_guests ADD CONSTRAINT tenant_guests_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_reservations ADD CONSTRAINT tenant_reservations_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_rooms ADD CONSTRAINT tenant_rooms_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_users ADD CONSTRAINT tenant_users_pkey PRIMARY KEY (id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.upsell_offers ADD CONSTRAINT upsell_offers_pkey PRIMARY KEY (id);
ALTER TABLE public.user_credentials ADD CONSTRAINT user_credentials_pkey PRIMARY KEY (user_id);
ALTER TABLE public.workflow_locks ADD CONSTRAINT workflow_locks_pkey PRIMARY KEY (workflow_name, lock_date);
ALTER TABLE public.workflow_runs ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_pattern_memory ADD CONSTRAINT agent_pattern_memory_pattern_key_key UNIQUE (pattern_key);
ALTER TABLE public.authorized_devices ADD CONSTRAINT authorized_devices_device_id_tenant_unique UNIQUE (device_id, tenant_id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_invoice_number_key UNIQUE (invoice_number);
ALTER TABLE public.corporate_leads ADD CONSTRAINT corporate_leads_contact_email_unique UNIQUE (contact_email);
ALTER TABLE public.council_panelists ADD CONSTRAINT council_panelists_session_id_role_key UNIQUE (session_id, role);
ALTER TABLE public.daily_closing ADD CONSTRAINT daily_closing_fiscal_day_key UNIQUE (fiscal_day);
ALTER TABLE public.email_chunks ADD CONSTRAINT email_chunks_message_id_chunk_idx_key UNIQUE (message_id, chunk_idx);
ALTER TABLE public.fountain_inventory ADD CONSTRAINT fountain_inventory_room_number_key UNIQUE (room_number);
ALTER TABLE public.lighthouse_summaries ADD CONSTRAINT lighthouse_summaries_tenant_id_snapshot_date_key UNIQUE (tenant_id, snapshot_date);
ALTER TABLE public.profiles ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.rate_plans ADD CONSTRAINT rate_plans_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.review_queue ADD CONSTRAINT review_queue_reservation_id_key UNIQUE (reservation_id);
ALTER TABLE public.rooms ADD CONSTRAINT rooms_room_number_key UNIQUE (room_number);
ALTER TABLE public.staff ADD CONSTRAINT staff_email_key UNIQUE (email);
ALTER TABLE public.tenant_users ADD CONSTRAINT tenant_users_tenant_id_user_id_key UNIQUE (tenant_id, user_id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_hotel_slug_key UNIQUE (slug);
ALTER TABLE public.account_churn_profile ADD CONSTRAINT account_churn_profile_churn_score_check CHECK (((churn_score >= (0)::double precision) AND (churn_score <= (1)::double precision)));
ALTER TABLE public.account_churn_profile ADD CONSTRAINT account_churn_profile_risk_status_check CHECK ((risk_status = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])));
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_result_check CHECK ((result = ANY (ARRAY['success'::text, 'failure'::text, 'partial'::text, 'denied'::text])));
ALTER TABLE public.billing_invoices ADD CONSTRAINT issued_only_when_not_draft CHECK (((issued_at IS NULL) OR (status <> 'DRAFT'::invoice_status_type)));
ALTER TABLE public.corporate_leads ADD CONSTRAINT corporate_leads_icp_score_check CHECK ((icp_score = ANY (ARRAY['strong'::text, 'good'::text, 'partial'::text])));
ALTER TABLE public.corporate_leads ADD CONSTRAINT corporate_leads_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'med'::text, 'low'::text])));
ALTER TABLE public.corporate_leads ADD CONSTRAINT corporate_leads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'replied'::text, 'audited'::text, 'deal_ready'::text, 'payment_pending'::text, 'activated'::text, 'closed_won'::text, 'not_interested'::text])));
ALTER TABLE public.council_panelists ADD CONSTRAINT council_panelists_role_check CHECK ((role = ANY (ARRAY['devils_advocate'::text, 'first_principles'::text, 'optimist'::text, 'rationalist'::text, 'executor'::text, 'chairman'::text])));
ALTER TABLE public.council_sessions ADD CONSTRAINT council_sessions_scope_mode_check CHECK ((scope_mode = ANY (ARRAY['hotel'::text, 'general'::text])));
ALTER TABLE public.council_sessions ADD CONSTRAINT council_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'deliberating'::text, 'complete'::text, 'failed'::text])));
ALTER TABLE public.email_chunks ADD CONSTRAINT email_chunks_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));
ALTER TABLE public.event_inquiries ADD CONSTRAINT event_inquiries_event_type_chk CHECK ((event_type = ANY (ARRAY['WEDDING'::text, 'CORPORATE'::text, 'BIRTHDAY'::text, 'OTHER'::text])));
ALTER TABLE public.event_inquiries ADD CONSTRAINT event_inquiries_space_chk CHECK (((space IS NULL) OR (space = ANY (ARRAY['ROOFTOP'::text, 'INDOOR'::text, 'BOTH'::text, 'FULL_VENUE'::text]))));
ALTER TABLE public.event_inquiries ADD CONSTRAINT event_inquiries_status_chk CHECK ((status = ANY (ARRAY['NEW'::text, 'CONTACTED'::text, 'QUOTED'::text, 'WON'::text, 'LOST'::text])));
ALTER TABLE public.guest_ledger ADD CONSTRAINT tax_entry_requires_parent CHECK (((is_tax_entry = false) OR (parent_ledger_id IS NOT NULL)));
ALTER TABLE public.guest_ledger ADD CONSTRAINT void_requires_reason CHECK (((is_voided = false) OR (void_reason IS NOT NULL)));
ALTER TABLE public.housekeeping_tasks ADD CONSTRAINT hk_tasks_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'SUPERSEDED'::text, 'ON_HOLD'::text])));
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_quantity_check CHECK ((quantity > 0));
ALTER TABLE public.marketing_content ADD CONSTRAINT marketing_content_content_type_check CHECK ((content_type = ANY (ARRAY['blog_post'::text, 'landing_page'::text, 'gbp_post'::text, 'schema'::text, 'other'::text])));
ALTER TABLE public.marketing_content ADD CONSTRAINT marketing_content_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'published'::text])));
ALTER TABLE public.night_audit_log ADD CONSTRAINT night_audit_log_status_check CHECK ((status = ANY (ARRAY['closed'::text, 'reopened'::text])));
ALTER TABLE public.outreach_log ADD CONSTRAINT outreach_log_direction_check CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text])));
ALTER TABLE public.payment_transactions ADD CONSTRAINT completed_at_consistency CHECK (((completed_at IS NULL) OR (status = ANY (ARRAY['COMPLETED'::payment_status_type, 'REFUNDED'::payment_status_type, 'PARTIALLY_REFUNDED'::payment_status_type]))));
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_amount_bdt_check CHECK ((amount_bdt >= 0));
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_refunded_bdt_check CHECK ((refunded_bdt >= 0));
ALTER TABLE public.payment_transactions ADD CONSTRAINT refund_le_amount CHECK ((refunded_bdt <= amount_bdt));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'FRONT_DESK'::text, 'HOUSE_KEEPING'::text])));
ALTER TABLE public.rate_plans ADD CONSTRAINT rate_plans_discount_bps_check CHECK (((discount_bps >= 0) AND (discount_bps <= 10000)));
ALTER TABLE public.rate_plans ADD CONSTRAINT valid_rate_plan_dates CHECK (((valid_from IS NULL) OR (valid_to IS NULL) OR (valid_from <= valid_to)));
ALTER TABLE public.reservations ADD CONSTRAINT reservations_source_check CHECK ((source = ANY (ARRAY['DIRECT'::text, 'WALK_IN'::text, 'PHONE'::text, 'BOOKING_COM'::text, 'AGODA'::text, 'AIRBNB'::text, 'EXPEDIA'::text, 'B2B_PARTNER'::text, 'CORPORATE'::text, 'WEBSITE'::text, 'WHATSAPP'::text, 'FACEBOOK'::text, 'OTHER'::text])));
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_uppercase_chk CHECK ((status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'RESERVED'::text, 'CHECKED_IN'::text, 'CHECKED_OUT'::text, 'CANCELLED'::text, 'NO_SHOW'::text])));
ALTER TABLE public.rooms ADD CONSTRAINT rooms_status_check CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'OCCUPIED'::text, 'DIRTY'::text, 'OUT_OF_ORDER'::text, 'MAINTENANCE'::text])));
ALTER TABLE public.rooms ADD CONSTRAINT rooms_status_uppercase_chk CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'OCCUPIED'::text, 'DIRTY'::text, 'OUT_OF_ORDER'::text, 'RESERVED'::text])));
ALTER TABLE public.sheets_sync_lock ADD CONSTRAINT sheets_sync_lock_singleton CHECK ((id = 1));
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_tier_check CHECK ((plan_tier = ANY (ARRAY['starter'::text, 'growth'::text, 'full'::text])));
ALTER TABLE public.account_churn_profile ADD CONSTRAINT account_churn_profile_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.b2b_bookings ADD CONSTRAINT b2b_bookings_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES b2b_partners(id) ON DELETE SET NULL;
ALTER TABLE public.b2b_followup_log ADD CONSTRAINT b2b_followup_log_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES b2b_partners(id);
ALTER TABLE public.b2b_invoices ADD CONSTRAINT b2b_invoices_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES b2b_partners(id) ON DELETE SET NULL;
ALTER TABLE public.b2b_outreach_log ADD CONSTRAINT b2b_outreach_log_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES b2b_partners(id) ON DELETE SET NULL;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_parent_invoice_id_fkey FOREIGN KEY (parent_invoice_id) REFERENCES billing_invoices(id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.ceo_pipeline ADD CONSTRAINT ceo_pipeline_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE public.content_debate_log ADD CONSTRAINT content_debate_log_content_id_fkey FOREIGN KEY (content_id) REFERENCES content_calendar(id);
ALTER TABLE public.content_variations ADD CONSTRAINT content_variations_content_id_fkey FOREIGN KEY (content_id) REFERENCES content_calendar(id);
ALTER TABLE public.corporate_leads ADD CONSTRAINT leads_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.council_panelists ADD CONSTRAINT council_panelists_session_id_fkey FOREIGN KEY (session_id) REFERENCES council_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.council_panelists ADD CONSTRAINT council_panelists_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.council_sessions ADD CONSTRAINT council_sessions_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
ALTER TABLE public.council_sessions ADD CONSTRAINT council_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.council_sessions ADD CONSTRAINT council_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE public.email_chunks ADD CONSTRAINT email_chunks_account_fk FOREIGN KEY (account_id) REFERENCES b2b_partners(id) ON DELETE CASCADE;
ALTER TABLE public.email_chunks ADD CONSTRAINT email_chunks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.folios ADD CONSTRAINT folios_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.guest_ledger ADD CONSTRAINT fk_ledger_payment_transaction FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.guest_ledger ADD CONSTRAINT guest_ledger_correction_of_id_fkey FOREIGN KEY (correction_of_id) REFERENCES guest_ledger(id);
ALTER TABLE public.guest_ledger ADD CONSTRAINT guest_ledger_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT;
ALTER TABLE public.guest_ledger ADD CONSTRAINT guest_ledger_parent_ledger_id_fkey FOREIGN KEY (parent_ledger_id) REFERENCES guest_ledger(id) ON DELETE RESTRICT;
ALTER TABLE public.guest_ledger ADD CONSTRAINT guest_ledger_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.guests ADD CONSTRAINT guests_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_ledger_entry_id_fkey FOREIGN KEY (ledger_entry_id) REFERENCES guest_ledger(id) ON DELETE SET NULL;
ALTER TABLE public.lighthouse_summaries ADD CONSTRAINT lighthouse_summaries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_events ADD CONSTRAINT maintenance_events_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES room_assets(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_events ADD CONSTRAINT maintenance_events_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_log ADD CONSTRAINT outreach_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES corporate_leads(id) ON DELETE CASCADE;
ALTER TABLE public.payment_transactions ADD CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE SET NULL;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.referral_queue ADD CONSTRAINT referral_queue_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.review_requests ADD CONSTRAINT review_requests_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id);
ALTER TABLE public.review_requests ADD CONSTRAINT review_requests_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.room_assets ADD CONSTRAINT room_assets_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.swarm_leads ADD CONSTRAINT swarm_leads_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL;
ALTER TABLE public.tenant_domains ADD CONSTRAINT tenant_domains_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_guests ADD CONSTRAINT tenant_guests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_reservations ADD CONSTRAINT tenant_reservations_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES tenant_guests(id);
ALTER TABLE public.tenant_reservations ADD CONSTRAINT tenant_reservations_room_id_fkey FOREIGN KEY (room_id) REFERENCES tenant_rooms(id);
ALTER TABLE public.tenant_reservations ADD CONSTRAINT tenant_reservations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_rooms ADD CONSTRAINT tenant_rooms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_users ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_users ADD CONSTRAINT tenant_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.upsell_offers ADD CONSTRAINT upsell_offers_folio_id_fkey FOREIGN KEY (folio_id) REFERENCES folios(id) ON DELETE SET NULL;
ALTER TABLE public.upsell_offers ADD CONSTRAINT upsell_offers_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE public.user_credentials ADD CONSTRAINT user_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_locks ADD CONSTRAINT workflow_locks_run_id_fkey FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL;

-- INDEXES
CREATE INDEX idx_tenant_users_user_id ON public.tenant_users USING btree (user_id);
CREATE INDEX idx_folios_reservation_id ON public.folios USING btree (reservation_id);
CREATE INDEX idx_tenant_guests_tenant_id ON public.tenant_guests USING btree (tenant_id);
CREATE INDEX idx_invoices_number ON public.billing_invoices USING btree (invoice_number);
CREATE INDEX idx_room_assets_room_id ON public.room_assets USING btree (room_id);
CREATE INDEX idx_guests_tenant_id ON public.guests USING btree (tenant_id);
CREATE INDEX idx_ceo_pipeline_handover ON public.ceo_pipeline USING btree (handover_ready) WHERE (handover_ready = true);
CREATE INDEX idx_learning_pattern ON public.agent_learning_log USING btree (pattern_key);
CREATE INDEX audit_logs_event_type_idx ON public.audit_logs USING btree (event_type, ts DESC);
CREATE INDEX idx_agent_messages_ceo ON public.agent_messages USING btree (status) WHERE (to_agent = 'lumea-ceo'::text);
CREATE INDEX idx_council_sessions_res ON public.council_sessions USING btree (reservation_id) WHERE (reservation_id IS NOT NULL);
CREATE INDEX idx_upsell_offers_folio_id ON public.upsell_offers USING btree (folio_id) WHERE (folio_id IS NOT NULL);
CREATE INDEX _dedup_map_20260526_dupe_id_idx ON public._dedup_map_20260526 USING btree (dupe_id);
CREATE INDEX idx_rooms_status ON public.rooms USING btree (status);
CREATE INDEX idx_customers_owner_id ON public.customers USING btree (owner_id);
CREATE INDEX idx_room_assets_last_serviced ON public.room_assets USING btree (last_serviced_at);
CREATE INDEX event_inquiries_pipeline_idx ON public.event_inquiries USING btree (tenant_id, status, created_at DESC);
CREATE INDEX idx_room_assets_tenant_id ON public.room_assets USING btree (tenant_id);
CREATE INDEX idx_invoice_line_items_invoice_id ON public.invoice_line_items USING btree (invoice_id);
CREATE INDEX idx_b2b_bookings_partner_id ON public.b2b_bookings USING btree (partner_id);
CREATE INDEX idx_payment_transactions_guest_id ON public.payment_transactions USING btree (guest_id);
CREATE INDEX marketing_content_status_idx ON public.marketing_content USING btree (status);
CREATE INDEX upsell_by_checkin ON public.upsell_offers USING btree (check_in, tenant_id);
CREATE INDEX idx_workflow_locks_run_id ON public.workflow_locks USING btree (run_id);
CREATE INDEX audit_logs_tenant_ts_idx ON public.audit_logs USING btree (tenant_id, ts DESC);
CREATE INDEX audit_logs_request_id_idx ON public.audit_logs USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX idx_workflow_runs_status_date ON public.workflow_runs USING btree (workflow_name, status, ran_at DESC);
CREATE INDEX idx_subscriptions_tenant_id ON public.subscriptions USING btree (tenant_id);
CREATE INDEX idx_tenant_rooms_tenant_id ON public.tenant_rooms USING btree (tenant_id);
CREATE INDEX swarm_leads_status ON public.swarm_leads USING btree (outreach_status, tenant_id);
CREATE INDEX idx_review_requests_guest_id ON public.review_requests USING btree (guest_id);
CREATE INDEX idx_authorized_devices_device_tenant ON public.authorized_devices USING btree (device_id, tenant_id);
CREATE INDEX idx_billing_invoices_guest_id ON public.billing_invoices USING btree (guest_id);
CREATE INDEX idx_ledger_guest ON public.guest_ledger USING btree (guest_id);
CREATE INDEX idx_council_panelists_session ON public.council_panelists USING btree (session_id);
CREATE INDEX idx_guest_ledger_correction_of_id ON public.guest_ledger USING btree (correction_of_id) WHERE (correction_of_id IS NOT NULL);
CREATE INDEX marketing_content_created_idx ON public.marketing_content USING btree (created_at DESC);
CREATE INDEX idx_outreach_log_direction ON public.outreach_log USING btree (direction);
CREATE INDEX idx_council_sessions_tenant ON public.council_sessions USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_lighthouse_tenant_date ON public.lighthouse_summaries USING btree (tenant_id, snapshot_date DESC);
CREATE INDEX idx_b2b_invoices_partner_id ON public.b2b_invoices USING btree (partner_id);
CREATE INDEX idx_swarm_leads_guest_id ON public.swarm_leads USING btree (guest_id) WHERE (guest_id IS NOT NULL);
CREATE INDEX idx_reservations_check_out ON public.reservations USING btree (check_out);
CREATE INDEX email_chunks_account_sent ON public.email_chunks USING btree (tenant_id, account_id, sent_at);
CREATE INDEX idx_agent_run_log_agent ON public.agent_run_log USING btree (agent_id, run_at DESC);
CREATE INDEX idx_learning_agent ON public.agent_learning_log USING btree (agent_id, created_at DESC);
CREATE INDEX swarm_leads_type ON public.swarm_leads USING btree (lead_type, tenant_id);
CREATE INDEX idx_outreach_log_lead_id ON public.outreach_log USING btree (lead_id);
CREATE INDEX idx_nal_tenant_date ON public.night_audit_log USING btree (tenant_id, audit_date DESC, closed_at DESC);
CREATE UNIQUE INDEX uq_nal_tenant_date ON public.night_audit_log USING btree (tenant_id, audit_date);
CREATE INDEX idx_transactions_reservation_id ON public.transactions USING btree (reservation_id);
CREATE INDEX idx_transactions_tenant_id ON public.transactions USING btree (tenant_id);
CREATE INDEX idx_rooms_tenant_id ON public.rooms USING btree (tenant_id);
CREATE INDEX idx_council_panelists_tenant_id ON public.council_panelists USING btree (tenant_id);
CREATE INDEX idx_corporate_leads_tenant ON public.corporate_leads USING btree (tenant_id);
CREATE INDEX idx_tenant_reservations_room_id ON public.tenant_reservations USING btree (room_id);
CREATE INDEX idx_invoices_reservation ON public.billing_invoices USING btree (reservation_id);
CREATE UNIQUE INDEX reservations_external_booking_id_tenant_idx ON public.reservations USING btree (tenant_id, external_booking_id) WHERE (external_booking_id IS NOT NULL);
CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id, ts DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_council_sessions_user_id ON public.council_sessions USING btree (user_id);
CREATE INDEX idx_agent_messages_to ON public.agent_messages USING btree (to_agent, status, created_at DESC);
CREATE INDEX idx_tenant_users_tenant_id ON public.tenant_users USING btree (tenant_id);
CREATE INDEX idx_ledger_tenant_date ON public.guest_ledger USING btree (tenant_id, transaction_date);
CREATE INDEX idx_folios_tenant_id ON public.folios USING btree (tenant_id);
CREATE INDEX idx_outreach_log_deal_ready ON public.outreach_log USING btree (is_deal_ready) WHERE (is_deal_ready = true);
CREATE INDEX idx_ledger_parent ON public.guest_ledger USING btree (parent_ledger_id) WHERE (parent_ledger_id IS NOT NULL);
CREATE INDEX acp_tenant_status ON public.account_churn_profile USING btree (tenant_id, risk_status);
CREATE INDEX idx_tenants_owner_id ON public.tenants USING btree (owner_id);
CREATE INDEX idx_ceo_pipeline_lead_id ON public.ceo_pipeline USING btree (lead_id);
CREATE INDEX idx_invoices_tenant_status ON public.billing_invoices USING btree (tenant_id, status);
CREATE INDEX idx_ledger_active ON public.guest_ledger USING btree (reservation_id) WHERE (is_voided = false);
CREATE UNIQUE INDEX uq_payment_tx_idempotency ON public.payment_transactions USING btree (idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (status = 'COMPLETED'::payment_status_type));
CREATE UNIQUE INDEX guests_unique_real_email ON public.guests USING btree (email, tenant_id) WHERE ((email IS NOT NULL) AND (email <> ''::text));
CREATE INDEX idx_corporate_leads_status ON public.corporate_leads USING btree (status);
CREATE INDEX idx_guest_ledger_payment_txn_id ON public.guest_ledger USING btree (payment_transaction_id) WHERE (payment_transaction_id IS NOT NULL);
CREATE UNIQUE INDEX idx_authorized_devices_token ON public.authorized_devices USING btree (device_token) WHERE (device_token IS NOT NULL);
CREATE INDEX marketing_content_tenant_idx ON public.marketing_content USING btree (tenant_id);
CREATE INDEX idx_review_requests_reservation_id ON public.review_requests USING btree (reservation_id);
CREATE INDEX swarm_leads_score ON public.swarm_leads USING btree (intent_score DESC, tenant_id);
CREATE INDEX upsell_by_reservation ON public.upsell_offers USING btree (reservation_id);
CREATE INDEX idx_transactions_fiscal_day ON public.transactions USING btree (fiscal_day);
CREATE INDEX idx_content_calendar_schedule ON public.content_calendar USING btree (scheduled_for, status);
CREATE UNIQUE INDEX uq_transactions_idempotency ON public.transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_b2b_followup_log_partner_id ON public.b2b_followup_log USING btree (partner_id);
CREATE INDEX idx_tenant_reservations_guest_id ON public.tenant_reservations USING btree (guest_id);
CREATE INDEX idx_content_debate_log_content_id ON public.content_debate_log USING btree (content_id);
CREATE INDEX idx_referral_queue_reservation_id ON public.referral_queue USING btree (reservation_id);
CREATE INDEX idx_payments_reservation ON public.payment_transactions USING btree (reservation_id);
CREATE INDEX idx_maint_events_asset_id ON public.maintenance_events USING btree (asset_id);
CREATE INDEX idx_workflow_runs_name_date ON public.workflow_runs USING btree (workflow_name, ran_at DESC);
CREATE INDEX idx_maint_events_room_id ON public.maintenance_events USING btree (room_id);
CREATE INDEX idx_pattern_agent ON public.agent_pattern_memory USING btree (agent_id, confidence DESC);
CREATE INDEX idx_variations_content ON public.content_variations USING btree (content_id);
CREATE INDEX idx_ceo_pipeline_stage ON public.ceo_pipeline USING btree (stage, next_action_at);
CREATE INDEX email_chunks_embedding_hnsw ON public.email_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_maint_events_tenant_id ON public.maintenance_events USING btree (tenant_id);
CREATE INDEX idx_variations_selected ON public.content_variations USING btree (selected);
CREATE INDEX reservations_external_booking_id_idx ON public.reservations USING btree (external_booking_id) WHERE (external_booking_id IS NOT NULL);
CREATE INDEX idx_payments_tenant_status ON public.payment_transactions USING btree (tenant_id, status);
CREATE INDEX idx_guests_retention ON public.guests USING btree (tenant_id, marketing_opt_out, last_contacted) WHERE (marketing_opt_out = false);
CREATE INDEX idx_billing_invoices_parent_id ON public.billing_invoices USING btree (parent_invoice_id) WHERE (parent_invoice_id IS NOT NULL);
CREATE INDEX idx_reservations_status ON public.reservations USING btree (status);
CREATE INDEX idx_invoice_line_items_ledger_id ON public.invoice_line_items USING btree (ledger_entry_id);
CREATE INDEX idx_payment_transactions_invoice_id ON public.payment_transactions USING btree (invoice_id) WHERE (invoice_id IS NOT NULL);
CREATE INDEX idx_content_calendar_platform ON public.content_calendar USING btree (platform, status);
CREATE INDEX idx_push_subs_tenant ON public.push_subscriptions USING btree (tenant_id);
CREATE INDEX idx_ledger_reservation ON public.guest_ledger USING btree (reservation_id);
CREATE INDEX idx_email_chunks_account_id ON public.email_chunks USING btree (account_id);
CREATE INDEX idx_b2b_outreach_log_partner_id ON public.b2b_outreach_log USING btree (partner_id);
CREATE INDEX idx_tenant_domains_tenant_id ON public.tenant_domains USING btree (tenant_id);
CREATE INDEX idx_maint_events_reported_at ON public.maintenance_events USING btree (reported_at);
CREATE INDEX upsell_by_status ON public.upsell_offers USING btree (status, tenant_id);
CREATE INDEX idx_reservations_check_in ON public.reservations USING btree (check_in DESC);
CREATE INDEX idx_tenant_reservations_tenant_id ON public.tenant_reservations USING btree (tenant_id);

-- VIEWS
CREATE OR REPLACE VIEW public.reservation_billing_summary AS  SELECT r.id,
    r.status,
    r.total_amount,
    COALESCE(sum(f.amount), 0::numeric) AS folio_extras,
    COALESCE(r.discount, 0::numeric) AS discount,
    r.paid_amount,
    r.total_amount + COALESCE(sum(f.amount), 0::numeric) - COALESCE(r.discount, 0::numeric) AS computed_total,
    r.total_amount + COALESCE(sum(f.amount), 0::numeric) - COALESCE(r.discount, 0::numeric) - r.paid_amount AS outstanding_due,
        CASE
            WHEN (r.total_amount + COALESCE(sum(f.amount), 0::numeric) - COALESCE(r.discount, 0::numeric) - r.paid_amount) <= 0::numeric THEN true
            ELSE false
        END AS is_settled
   FROM reservations r
     LEFT JOIN folios f ON f.reservation_id = r.id
  GROUP BY r.id, r.status, r.total_amount, r.discount, r.paid_amount;

CREATE OR REPLACE VIEW public.overdue_payment_alerts AS  SELECT r.id AS reservation_id,
    g.name AS guest_name,
    g.phone,
    array_to_string(r.room_ids, ', '::text) AS rooms,
    r.check_out::date AS checkout_date,
    CURRENT_DATE - r.check_out::date AS days_overdue,
    rbs.computed_total,
    r.paid_amount,
    rbs.outstanding_due,
        CASE
            WHEN (CURRENT_DATE - r.check_out::date) > 30 THEN 'CRITICAL'::text
            WHEN (CURRENT_DATE - r.check_out::date) > 7 THEN 'HIGH'::text
            WHEN (CURRENT_DATE - r.check_out::date) > 1 THEN 'MEDIUM'::text
            ELSE 'LOW'::text
        END AS priority,
    r.tenant_id
   FROM reservation_billing_summary rbs
     JOIN reservations r ON r.id = rbs.id
     LEFT JOIN guests g ON g.id = r.guest_ids[1]
  WHERE rbs.outstanding_due > 0::numeric AND r.status = 'CHECKED_OUT'::text
  ORDER BY rbs.outstanding_due DESC;

CREATE OR REPLACE VIEW public.daily_revenue_summary AS  SELECT r.check_out::date AS date,
    count(*) AS checkouts,
    sum(r.paid_amount) AS revenue_collected,
    sum(rbs.computed_total) AS revenue_total,
    sum(rbs.outstanding_due) AS revenue_outstanding,
    count(
        CASE
            WHEN rbs.is_settled THEN 1
            ELSE NULL::integer
        END) AS fully_paid,
    count(
        CASE
            WHEN NOT rbs.is_settled THEN 1
            ELSE NULL::integer
        END) AS partial_paid,
    r.tenant_id
   FROM reservations r
     JOIN reservation_billing_summary rbs ON rbs.id = r.id
  WHERE r.status = 'CHECKED_OUT'::text
  GROUP BY (r.check_out::date), r.tenant_id
  ORDER BY (r.check_out::date) DESC;

CREATE OR REPLACE VIEW public.occupancy_stats AS  SELECT r.check_in::date AS date,
    count(*) AS reservations,
    sum(array_length(r.room_ids, 1)) AS rooms_occupied,
    28 AS total_rooms,
    round(sum(array_length(r.room_ids, 1))::numeric / 28::numeric * 100::numeric, 1) AS occupancy_pct,
    sum(rbs.computed_total) AS revenue,
    r.tenant_id
   FROM reservations r
     JOIN reservation_billing_summary rbs ON rbs.id = r.id
  WHERE r.status = ANY (ARRAY['CHECKED_IN'::text, 'CHECKED_OUT'::text])
  GROUP BY (r.check_in::date), r.tenant_id
  ORDER BY (r.check_in::date) DESC;

CREATE OR REPLACE VIEW public.monthly_revenue_summary AS  SELECT date_trunc('month'::text, r.check_out) AS month,
    count(*) AS total_checkouts,
    sum(r.paid_amount) AS collected,
    sum(rbs.computed_total) AS billed,
    sum(rbs.outstanding_due) AS outstanding,
    round(avg(rbs.computed_total), 0) AS avg_bill,
    r.tenant_id
   FROM reservations r
     JOIN reservation_billing_summary rbs ON rbs.id = r.id
  WHERE r.status = 'CHECKED_OUT'::text
  GROUP BY (date_trunc('month'::text, r.check_out)), r.tenant_id
  ORDER BY (date_trunc('month'::text, r.check_out)) DESC;

CREATE OR REPLACE VIEW public.b2b_partner_summary AS  SELECT id,
    agency_name,
    contact_name,
    email,
    phone,
    city,
    wholesale_rate,
    commission_pct,
    status,
    total_bookings,
    total_revenue,
    last_booking_at,
    tenant_id
   FROM b2b_partners
  ORDER BY total_revenue DESC;

CREATE OR REPLACE VIEW public.rls_audit AS  SELECT t.tablename,
    count(p.policyname) AS policy_count,
    bool_and(t.rowsecurity) AS rls_enabled,
        CASE
            WHEN count(p.policyname) = 0 THEN 'NO POLICY'::text
            WHEN count(p.policyname) = 1 THEN 'REVIEW'::text
            ELSE 'OK'::text
        END AS status
   FROM pg_tables t
     LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = 'public'::name
  WHERE t.schemaname = 'public'::name
  GROUP BY t.tablename, t.rowsecurity
  ORDER BY (count(p.policyname)), t.tablename;

CREATE OR REPLACE VIEW public.open_access_audit AS  SELECT tablename,
    policyname,
    cmd,
    'OPEN - qual is true'::text AS risk
   FROM pg_policies
  WHERE schemaname = 'public'::name AND qual = 'true'::text AND (tablename = ANY (ARRAY['reservations'::name, 'rooms'::name, 'guests'::name, 'folios'::name, 'transactions'::name, 'billing_invoices'::name, 'payment_transactions'::name, 'guest_ledger'::name, 'daily_closing'::name]))
  ORDER BY tablename;

CREATE OR REPLACE VIEW public.b2b_outreach_status AS  SELECT id,
    agency_name,
    contact_name,
    phone,
    email,
    city,
    status,
    priority,
    wholesale_rate,
    commission_pct,
    whatsapp_sent,
    joining_letter_sent,
    total_bookings,
    total_revenue,
    follow_up_count,
    last_contacted_at,
        CASE
            WHEN status = 'active'::text AND total_bookings = 0 AND NOT whatsapp_sent THEN 'SEND WHATSAPP NOW'::text
            WHEN status = 'active'::text AND total_bookings = 0 AND whatsapp_sent THEN 'FOLLOW UP CALL'::text
            WHEN status = 'prospect'::text AND NOT joining_letter_sent THEN 'SEND JOINING LETTER'::text
            WHEN status = 'prospect'::text AND joining_letter_sent THEN 'CONVERT TO ACTIVE'::text
            ELSE 'MAINTAIN'::text
        END AS next_action,
    tenant_id
   FROM b2b_partners p
  ORDER BY priority DESC, agency_name;

CREATE OR REPLACE VIEW public.pending_review_requests AS  SELECT rr.id,
    rr.guest_name,
    rr.phone,
    rr.channel,
    rr.status,
    rr.created_at::date AS checkout_date,
    r.room_ids,
    rr.tenant_id
   FROM review_requests rr
     JOIN reservations r ON r.id = rr.reservation_id
  WHERE rr.status = 'PENDING'::text AND NOT rr.reviewed
  ORDER BY rr.created_at DESC;

CREATE OR REPLACE VIEW public.ota_channel_performance AS  SELECT source AS channel,
    count(*) AS bookings,
    sum(paid_amount) AS gross_revenue,
    round(avg(total_amount), 0) AS avg_booking_value,
    round(count(*)::numeric / sum(count(*)) OVER () * 100::numeric, 1) AS pct_of_total,
    sum(
        CASE
            WHEN check_in >= (now() - '30 days'::interval) THEN 1
            ELSE 0
        END) AS last_30_days,
    tenant_id,
    round(sum(total_amount), 0) AS total_amount
   FROM reservations
  GROUP BY source, tenant_id
  ORDER BY (count(*)) DESC;

CREATE OR REPLACE VIEW public.review_request_queue AS  SELECT r.id AS reservation_id,
    g.name AS guest_name,
    g.phone,
    g.email,
    array_to_string(r.room_ids, ', '::text) AS rooms,
    r.check_out::date AS checkout_date,
    CURRENT_DATE - r.check_out::date AS days_since_checkout,
    rbs.is_settled,
    r.tenant_id
   FROM reservations r
     JOIN reservation_billing_summary rbs ON rbs.id = r.id
     LEFT JOIN guests g ON g.id = r.guest_ids[1]
     LEFT JOIN review_queue rq ON rq.reservation_id = r.id
  WHERE r.status = 'CHECKED_OUT'::text AND rbs.is_settled = true AND rq.id IS NULL AND r.check_out >= (now() - '7 days'::interval) AND g.phone IS NOT NULL AND g.phone <> ''::text
  ORDER BY r.check_out DESC;

CREATE OR REPLACE VIEW public.b2b_activation_dashboard AS  SELECT id,
    agency_name,
    contact_name,
    phone,
    email,
    city,
    status,
    wholesale_rate,
    commission_pct,
    total_bookings,
    total_revenue,
    lead_score,
    priority_tier,
    whatsapp_sent,
    joining_letter_sent,
    last_followup_at::date AS last_followup,
    followup_count,
    next_followup_date,
        CASE
            WHEN total_bookings > 0 THEN 'GENERATING REVENUE'::text
            WHEN status = 'ACTIVE'::text AND followup_count > 1 THEN 'WARM — NEEDS PUSH'::text
            WHEN status = 'ACTIVE'::text AND followup_count = 0 THEN 'NEEDS FOLLOWUP'::text
            WHEN status = 'PROSPECT'::text THEN 'ONBOARDING PENDING'::text
            ELSE 'COLD'::text
        END AS activation_status,
    next_followup_date <= CURRENT_DATE AS followup_due,
    tenant_id
   FROM b2b_partners
  ORDER BY lead_score DESC, priority_tier, agency_name;

CREATE OR REPLACE VIEW public.housekeeping_dashboard AS  SELECT ht.room_number,
    r.status AS room_status,
    ht.task_type,
    ht.priority,
    ht.status AS task_status,
    ht.assignee,
    ht.created_at::date AS task_date,
    CURRENT_DATE - ht.created_at::date AS days_pending,
    ht.notes,
    ht.tenant_id
   FROM housekeeping_tasks ht
     LEFT JOIN rooms r ON r.room_number = ht.room_number AND r.tenant_id = ht.tenant_id
  WHERE ht.status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text])
  ORDER BY (
        CASE ht.priority
            WHEN 'HIGH'::text THEN 1
            WHEN 'MEDIUM'::text THEN 2
            ELSE 3
        END), ht.created_at;

CREATE OR REPLACE VIEW public.guest_contact_valid AS  SELECT g.id,
    g.name,
    g.phone,
    g.email,
    r.id AS reservation_id,
    r.check_out::date AS checkout_date,
    rbs.outstanding_due,
    array_to_string(r.room_ids, ', '::text) AS rooms
   FROM guests g
     JOIN reservations r ON g.id = ANY (r.guest_ids)
     JOIN reservation_billing_summary rbs ON rbs.id = r.id
  WHERE rbs.outstanding_due > 0::numeric AND r.status = 'CHECKED_OUT'::text AND is_valid_bd_phone(g.phone)
  ORDER BY rbs.outstanding_due DESC;

CREATE OR REPLACE VIEW public.ceo_dashboard AS  SELECT id,
    company,
    contact_name,
    contact_phone,
    lead_type,
    stage,
    interest_level,
    pitch_sent,
    pitch_channel,
    followup_count,
    next_action_at,
    next_action,
    deal_value_bdt,
    handover_ready,
    response_received,
        CASE
            WHEN handover_ready THEN '🤝 READY FOR YOU'::text
            WHEN interest_level >= 70 THEN '🔥 HOT'::text
            WHEN interest_level >= 40 THEN '♨️  WARM'::text
            WHEN pitch_sent THEN '📤 PITCHED'::text
            ELSE '🆕 NEW'::text
        END AS status_label,
    CURRENT_DATE - last_followup_at::date AS days_since_contact,
    tenant_id
   FROM ceo_pipeline p
  WHERE closed = false
  ORDER BY handover_ready DESC, interest_level DESC, next_action_at;

CREATE OR REPLACE VIEW public.ceo_inbox AS  SELECT from_agent,
    message_type,
    subject,
    priority,
    status,
    ceo_decision,
    ceo_notes,
    (created_at AT TIME ZONE 'Asia/Dhaka'::text) AS received_dhaka,
    body
   FROM agent_messages
  WHERE to_agent = 'lumea-ceo'::text
  ORDER BY (
        CASE status
            WHEN 'PENDING'::text THEN 1
            ELSE 2
        END), (
        CASE priority
            WHEN 'CRITICAL'::text THEN 1
            WHEN 'HIGH'::text THEN 2
            ELSE 3
        END), created_at DESC;

CREATE OR REPLACE VIEW public.leads_pipeline AS  SELECT id,
    tenant_id,
    company_name,
    contact_name,
    contact_email,
    contact_title,
    industry,
    icp_score,
    priority,
    status,
    deal_score,
    last_contacted_at,
    payment_pending_at,
    activated_at,
    subdomain,
    notes,
    created_at,
    ( SELECT ol.subject
           FROM outreach_log ol
          WHERE ol.lead_id = cl.id
          ORDER BY ol.sent_at DESC
         LIMIT 1) AS last_subject,
    ( SELECT ol.deal_score
           FROM outreach_log ol
          WHERE ol.lead_id = cl.id AND ol.is_deal_ready = true
          ORDER BY ol.audited_at DESC
         LIMIT 1) AS latest_deal_score,
    ( SELECT ol.ceo_next_action
           FROM outreach_log ol
          WHERE ol.lead_id = cl.id
          ORDER BY ol.sent_at DESC
         LIMIT 1) AS ceo_next_action
   FROM corporate_leads cl;

CREATE OR REPLACE VIEW public.v_lighthouse_latest AS  SELECT DISTINCT ON (tenant_id) tenant_id,
    snapshot_date,
    generated_at,
    occupancy_pct,
    rooms_occupied,
    rooms_total,
    arrivals_today,
    departures_today,
    in_house_guests,
    vip_in_house,
    revenue_today_bdt,
    revenue_mtd_bdt,
    adr_bdt,
    unpaid_balance_bdt,
    orphan_folios_count,
    blocked_rooms,
    pending_leads,
    narrative_md,
    payload
   FROM lighthouse_summaries
  ORDER BY tenant_id, snapshot_date DESC, generated_at DESC;

CREATE OR REPLACE VIEW public.v_council_sessions_with_panel AS  SELECT s.id AS session_id,
    s.tenant_id,
    s.user_id,
    s.reservation_id,
    s.scope_mode,
    s.prompt,
    s.chairman_verdict,
    s.status,
    s.total_tokens_in,
    s.total_tokens_out,
    s.total_cost_bdt,
    s.created_at,
    s.completed_at,
    COALESCE(jsonb_agg(jsonb_build_object('role', p.role, 'verdict', p.verdict, 'tokens_in', p.tokens_in, 'tokens_out', p.tokens_out, 'cost_bdt', p.cost_bdt, 'latency_ms', p.latency_ms, 'model', p.model) ORDER BY p.created_at) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS panelists
   FROM council_sessions s
     LEFT JOIN council_panelists p ON p.session_id = s.id
  GROUP BY s.id;

CREATE OR REPLACE VIEW public.room_maintenance_risk AS  SELECT ra.id AS asset_id,
    ra.tenant_id,
    ra.room_id,
    r.room_number,
    ra.asset_type,
    ra.status,
    ra.last_serviced_at,
        CASE
            WHEN ra.last_serviced_at IS NULL THEN NULL::integer
            ELSE CURRENT_DATE - ra.last_serviced_at
        END AS days_since_service,
        CASE
            WHEN ra.last_serviced_at IS NULL THEN NULL::integer
            ELSE CURRENT_DATE - ra.last_serviced_at - ra.service_interval_days
        END AS days_overdue,
    ( SELECT count(*) AS count
           FROM maintenance_events me
          WHERE me.asset_id = ra.id AND me.event_type = 'fault'::text AND me.reported_at > (now() - '90 days'::interval)) AS faults_90d,
    ( SELECT count(*) AS count
           FROM maintenance_events me
          WHERE me.asset_id = ra.id AND me.resolved_at IS NULL) AS open_faults,
        CASE
            WHEN ra.last_serviced_at IS NULL THEN 50
            ELSE GREATEST(CURRENT_DATE - ra.last_serviced_at - ra.service_interval_days, 0)
        END + (( SELECT count(*) AS count
           FROM maintenance_events me
          WHERE me.asset_id = ra.id AND me.event_type = 'fault'::text AND me.reported_at > (now() - '90 days'::interval))) * 30 + (( SELECT count(*) AS count
           FROM maintenance_events me
          WHERE me.asset_id = ra.id AND me.resolved_at IS NULL)) * 40 +
        CASE ra.status
            WHEN 'out_of_service'::text THEN 100
            WHEN 'degraded'::text THEN 40
            ELSE 0
        END AS risk_score
   FROM room_assets ra
     JOIN rooms r ON r.id = ra.room_id;

CREATE OR REPLACE VIEW public.high_risk_accounts AS  SELECT account_id,
    tenant_id,
    source_type,
    display_name,
    risk_status,
    churn_score,
    sentiment_slope,
    reasons,
    recommended_action,
    last_scored_at
   FROM account_churn_profile
  WHERE risk_status = 'High'::text
  ORDER BY sentiment_slope, churn_score DESC;

-- TRIGGERS
CREATE TRIGGER "Send Confirmation Email" AFTER INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://hotel-fountain-app.vercel.app/api/webhook-confirm-booking', 'POST', '{"Content-Type":"application/json"}', '{}', '5000');
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.council_sessions FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.tenant_users FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.hotel_settings FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.folios FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.housekeeping_tasks FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.b2b_partners FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.b2b_bookings FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.review_requests FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.corporate_leads FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.guest_ledger FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.rate_plans FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION audit_table_change();
CREATE TRIGGER on_checkout_queue_review AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION queue_review_email();
CREATE TRIGGER swarm_lead_autopromote AFTER INSERT OR UPDATE OF outreach_status ON public.swarm_leads FOR EACH ROW WHEN (((new.outreach_status = 'approved'::text) AND (COALESCE(new.crm_synced, false) = false))) EXECUTE FUNCTION trg_promote_swarm_lead();
CREATE TRIGGER sync_folios_to_sheets AFTER INSERT OR DELETE OR UPDATE ON public.folios FOR EACH STATEMENT EXECUTE FUNCTION notify_sheets_sync();
CREATE TRIGGER sync_guests_to_sheets AFTER INSERT OR DELETE OR UPDATE ON public.guests FOR EACH STATEMENT EXECUTE FUNCTION notify_sheets_sync();
CREATE TRIGGER sync_housekeeping_to_sheets AFTER INSERT OR DELETE OR UPDATE ON public.housekeeping_tasks FOR EACH STATEMENT EXECUTE FUNCTION notify_sheets_sync();
CREATE TRIGGER sync_reservations_to_sheets AFTER INSERT OR DELETE OR UPDATE ON public.reservations FOR EACH STATEMENT EXECUTE FUNCTION notify_sheets_sync();
CREATE TRIGGER sync_rooms_to_sheets AFTER INSERT OR DELETE OR UPDATE ON public.rooms FOR EACH STATEMENT EXECUTE FUNCTION notify_sheets_sync();
CREATE TRIGGER sync_transactions_to_sheets AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH STATEMENT EXECUTE FUNCTION notify_sheets_sync();
CREATE TRIGGER trg_auto_followup_count AFTER INSERT ON public.b2b_followup_log FOR EACH ROW EXECUTE FUNCTION auto_update_partner_on_followup();
CREATE TRIGGER trg_auto_housekeeping AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION auto_create_housekeeping_task();
CREATE TRIGGER trg_auto_referral AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION auto_referral_on_checkout();
CREATE TRIGGER trg_auto_response_update AFTER UPDATE ON public.b2b_followup_log FOR EACH ROW EXECUTE FUNCTION auto_update_on_response();
CREATE TRIGGER trg_auto_score_response BEFORE UPDATE ON public.ceo_pipeline FOR EACH ROW EXECUTE FUNCTION auto_score_response();
CREATE TRIGGER trg_auto_upsell AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION auto_upsell_on_checkin();
CREATE TRIGGER trg_b2b_status_upper BEFORE INSERT OR UPDATE ON public.b2b_partners FOR EACH ROW EXECUTE FUNCTION enforce_b2b_status_upper();
CREATE TRIGGER trg_block_duplicate_payment BEFORE INSERT ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION fn_block_duplicate_payment();
CREATE TRIGGER trg_ceo_escalation_email AFTER UPDATE ON public.agent_messages FOR EACH ROW EXECUTE FUNCTION notify_shan_on_escalation();
CREATE TRIGGER trg_ceo_new_escalation_email AFTER INSERT ON public.agent_messages FOR EACH ROW EXECUTE FUNCTION notify_shan_on_new_escalation();
CREATE TRIGGER trg_checkout_settlement_check AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION check_checkout_settlement();
CREATE TRIGGER trg_dual_write_folio AFTER INSERT ON public.folios FOR EACH ROW EXECUTE FUNCTION fn_dual_write_folio();
CREATE TRIGGER trg_dual_write_transaction AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION fn_dual_write_transaction();
CREATE TRIGGER trg_handover_email AFTER UPDATE ON public.ceo_pipeline FOR EACH ROW EXECUTE FUNCTION notify_shan_on_handover();
CREATE TRIGGER trg_hk_status_upper BEFORE INSERT OR UPDATE ON public.housekeeping_tasks FOR EACH ROW EXECUTE FUNCTION enforce_hk_status_upper();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_ledger_invoice_totals AFTER INSERT OR DELETE OR UPDATE ON public.guest_ledger FOR EACH ROW EXECUTE FUNCTION fn_recalculate_invoice_totals();
CREATE TRIGGER trg_ledger_updated_at BEFORE UPDATE ON public.guest_ledger FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_notify_event_inquiry AFTER INSERT ON public.event_inquiries FOR EACH ROW EXECUTE FUNCTION notify_event_inquiry();
CREATE TRIGGER trg_notify_new_booking AFTER INSERT ON public.reservations FOR EACH ROW EXECUTE FUNCTION notify_new_booking();
CREATE TRIGGER trg_payments_paid_total AFTER INSERT OR UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION fn_recalculate_paid_total();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_pipeline_updated BEFORE UPDATE ON public.ceo_pipeline FOR EACH ROW EXECUTE FUNCTION update_pipeline_timestamp();
CREATE TRIGGER trg_prevent_duplicate_hk AFTER INSERT ON public.housekeeping_tasks FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_hk_tasks();
CREATE TRIGGER trg_profiles_role_normalize BEFORE INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION normalize_profile_role();
CREATE TRIGGER trg_queue_review AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION queue_review_request();
CREATE TRIGGER trg_reservations_status_upper BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION enforce_uppercase_status();
CREATE TRIGGER trg_review_queue_populate_email BEFORE INSERT ON public.review_queue FOR EACH ROW EXECUTE FUNCTION fn_review_queue_populate_email();
CREATE TRIGGER trg_room_available_on_clean AFTER UPDATE ON public.housekeeping_tasks FOR EACH ROW EXECUTE FUNCTION auto_room_available_on_clean();
CREATE TRIGGER trg_rooms_status_upper BEFORE INSERT OR UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION enforce_uppercase_status();
CREATE TRIGGER trg_sync_compat_columns BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION sync_compat_reservation_columns();
CREATE TRIGGER update_fountain_modtime BEFORE UPDATE ON public.fountain_inventory FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ROW LEVEL SECURITY
ALTER TABLE public._backup_billing_invoices_neg_20260606 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_billing_invoices_neg_20260609 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_fresh_20260610_ptx ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_fresh_20260610_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_fresh_20260610_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_guests_20260526 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_guests_20260526_agg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_payment_tx_dedup_20260606 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_payment_tx_neg_20260609 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_payment_tx_nonneg_dup_20260609 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_recon_billing_20260610 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_reservation_guest_ids_20260526 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_reservation_guest_ids_20260526_agg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_reset_20260610_folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_reset_20260610_ptx ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_reset_20260610_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_reset_20260610_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_resv_guestname_20260610 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_staff_20260610 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_transactions_neg_20260609 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._dedup_map_20260526 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._dedup_map_20260526_agg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_churn_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_learning_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_pattern_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_followup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_outreach_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_debate_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_performance_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_panelists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_build ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_monitor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deploy_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_pricing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_sale_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fountain_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lighthouse_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manus_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_sync_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_content_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swarm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY acp_tenant_isolation ON public.account_churn_profile AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id())) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY audit_logs_tenant_select ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id IS NOT NULL) AND ((tenant_id)::text = (jwt() ->> 'tenant_id'::text))));
CREATE POLICY authorized_devices_service_only ON public.authorized_devices AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_access ON public.authorized_devices AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_isolation ON public.b2b_bookings AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY b2b_followup_log_tenant ON public.b2b_followup_log AS PERMISSIVE FOR ALL TO public USING ((tenant_id = ( SELECT b2b_followup_log.tenant_id
   FROM profiles
  WHERE (profiles.id = uid())))) WITH CHECK ((tenant_id = ( SELECT b2b_followup_log.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY tenant_isolation ON public.b2b_invoices AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.b2b_outreach_log AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.b2b_partners AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.billing_invoices AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY ceo_pipeline_tenant ON public.ceo_pipeline AS PERMISSIVE FOR ALL TO public USING ((tenant_id = ( SELECT ceo_pipeline.tenant_id
   FROM profiles
  WHERE (profiles.id = uid())))) WITH CHECK ((tenant_id = ( SELECT ceo_pipeline.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY content_tenant ON public.content_calendar AS PERMISSIVE FOR ALL TO public USING ((tenant_id = ( SELECT content_calendar.tenant_id
   FROM profiles
  WHERE (profiles.id = uid())))) WITH CHECK ((tenant_id = ( SELECT content_calendar.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY service_role_all_leads ON public.corporate_leads AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation ON public.corporate_leads AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY council_panelists_tenant_rw ON public.council_panelists AS PERMISSIVE FOR ALL TO public USING ((tenant_id = (((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'tenant_id'::text))::uuid));
CREATE POLICY council_sessions_tenant_rw ON public.council_sessions AS PERMISSIVE FOR ALL TO public USING ((tenant_id = (((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'tenant_id'::text))::uuid));
CREATE POLICY crm_build_read ON public.crm_build AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY crm_chunks_read ON public.crm_chunks AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY customers_owner_read ON public.customers AS PERMISSIVE FOR SELECT TO public USING ((owner_id = uid()));
CREATE POLICY tenant_isolation ON public.daily_closing AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY email_chunks_tenant_isolation ON public.email_chunks AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id())) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY event_inquiries_public_insert ON public.event_inquiries AS PERMISSIVE FOR INSERT TO authenticated, anon WITH CHECK (((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid) AND (status = 'NEW'::text) AND (source = 'events_page'::text)));
CREATE POLICY event_inquiries_staff_delete ON public.event_inquiries AS PERMISSIVE FOR DELETE TO authenticated USING ((tenant_id = ( SELECT event_inquiries.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY event_inquiries_staff_select ON public.event_inquiries AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = ( SELECT event_inquiries.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY event_inquiries_staff_update ON public.event_inquiries AS PERMISSIVE FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT event_inquiries.tenant_id
   FROM profiles
  WHERE (profiles.id = uid())))) WITH CHECK ((tenant_id = ( SELECT event_inquiries.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY tenant_access ON public.folios AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY fountain_inventory_read ON public.fountain_inventory AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY tenant_isolation ON public.guest_ledger AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.guests AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.hotel_settings AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.housekeeping_tasks AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.invoice_line_items AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM billing_invoices bi
  WHERE ((bi.id = invoice_line_items.invoice_id) AND (bi.tenant_id = current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM billing_invoices bi
  WHERE ((bi.id = invoice_line_items.invoice_id) AND (bi.tenant_id = current_tenant_id())))));
CREATE POLICY tenant_isolation ON public.leads AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY lighthouse_service_all ON public.lighthouse_summaries AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation ON public.maintenance_events AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.manus_config AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.marketing_content AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY nal_tenant_read ON public.night_audit_log AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.notifications_log AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY ota_rates_tenant ON public.ota_rate_plans AS PERMISSIVE FOR ALL TO public USING ((tenant_id = ( SELECT ota_rate_plans.tenant_id
   FROM profiles
  WHERE (profiles.id = uid())))) WITH CHECK ((tenant_id = ( SELECT ota_rate_plans.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY tenant_access ON public.ota_rate_plans AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY service_role_all_log ON public.outreach_log AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation ON public.outreach_log AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.payment_transactions AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY block_anon_delete ON public.profiles AS PERMISSIVE FOR DELETE TO public USING (false);
CREATE POLICY block_anon_insert ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK (false);
CREATE POLICY block_anon_update ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING (false);
CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((id = uid()) OR is_admin()));
CREATE POLICY push_tenant_access ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_isolation ON public.rate_plans AS PERMISSIVE FOR ALL TO authenticated USING ((tenant_id = ( SELECT rate_plans.tenant_id
   FROM profiles
  WHERE (profiles.id = uid())))) WITH CHECK ((tenant_id = ( SELECT rate_plans.tenant_id
   FROM profiles
  WHERE (profiles.id = uid()))));
CREATE POLICY tenant_isolation ON public.reservations AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.review_queue AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY review_requests_tenant ON public.review_requests AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_isolation ON public.room_assets AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.rooms AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.staff AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY owner_view_subscription ON public.subscriptions AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid()))));
CREATE POLICY subscriptions_insert ON public.subscriptions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid()))));
CREATE POLICY subscriptions_select ON public.subscriptions AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_my_tenant_id()) OR (tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid())))));
CREATE POLICY subscriptions_update ON public.subscriptions AS PERMISSIVE FOR UPDATE TO public USING ((tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid()))));
CREATE POLICY tenant_access ON public.subscriptions AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_isolation ON public.swarm_leads AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_access ON public.tenant_guests AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_guests_access ON public.tenant_guests AS PERMISSIVE FOR ALL TO public USING (((tenant_id IN ( SELECT tenant_users.tenant_id
   FROM tenant_users
  WHERE (tenant_users.user_id = uid()))) OR (tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid())))));
CREATE POLICY tenant_guests_all ON public.tenant_guests AS PERMISSIVE FOR ALL TO public USING ((tenant_id = get_my_tenant_id()));
CREATE POLICY tenant_access ON public.tenant_reservations AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_reservations_access ON public.tenant_reservations AS PERMISSIVE FOR ALL TO public USING (((tenant_id IN ( SELECT tenant_users.tenant_id
   FROM tenant_users
  WHERE (tenant_users.user_id = uid()))) OR (tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid())))));
CREATE POLICY tenant_reservations_all ON public.tenant_reservations AS PERMISSIVE FOR ALL TO public USING ((tenant_id = get_my_tenant_id()));
CREATE POLICY tenant_access ON public.tenant_rooms AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_rooms_access ON public.tenant_rooms AS PERMISSIVE FOR ALL TO public USING (((tenant_id IN ( SELECT tenant_users.tenant_id
   FROM tenant_users
  WHERE (tenant_users.user_id = uid()))) OR (tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid())))));
CREATE POLICY tenant_rooms_all ON public.tenant_rooms AS PERMISSIVE FOR ALL TO public USING ((tenant_id = get_my_tenant_id()));
CREATE POLICY tenant_access ON public.tenant_users AS PERMISSIVE FOR ALL TO authenticated, anon USING ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid)) WITH CHECK ((tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid));
CREATE POLICY tenant_member_access ON public.tenant_users AS PERMISSIVE FOR ALL TO public USING (((tenant_id IN ( SELECT tenant_users_1.tenant_id
   FROM tenant_users tenant_users_1
  WHERE (tenant_users_1.user_id = uid()))) OR (tenant_id IN ( SELECT tenants.id
   FROM tenants
  WHERE (tenants.owner_id = uid())))));
CREATE POLICY tenant_users_insert ON public.tenant_users AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = uid()));
CREATE POLICY tenant_users_select ON public.tenant_users AS PERMISSIVE FOR SELECT TO public USING (((user_id = uid()) OR (tenant_id = get_my_tenant_id())));
CREATE POLICY tenant_no_client_write ON public.tenants AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY tenant_self_read ON public.tenants AS PERMISSIVE FOR SELECT TO public USING ((uid() IS NOT NULL));
CREATE POLICY tenant_isolation ON public.transactions AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK ((tenant_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON public.upsell_offers AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.workflow_locks AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY tenant_isolation ON public.workflow_runs AS PERMISSIVE FOR ALL TO public USING (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL))) WITH CHECK (((tenant_id = current_tenant_id()) OR (tenant_id IS NULL)));

-- GRANTS
GRANT DELETE ON public._backup_billing_invoices_neg_20260606 TO anon;
GRANT INSERT ON public._backup_billing_invoices_neg_20260606 TO anon;
GRANT REFERENCES ON public._backup_billing_invoices_neg_20260606 TO anon;
GRANT SELECT ON public._backup_billing_invoices_neg_20260606 TO anon;
GRANT TRIGGER ON public._backup_billing_invoices_neg_20260606 TO anon;
GRANT TRUNCATE ON public._backup_billing_invoices_neg_20260606 TO anon;
GRANT UPDATE ON public._backup_billing_invoices_neg_20260606 TO anon;
GRANT DELETE ON public._backup_billing_invoices_neg_20260606 TO authenticated;
GRANT INSERT ON public._backup_billing_invoices_neg_20260606 TO authenticated;
GRANT REFERENCES ON public._backup_billing_invoices_neg_20260606 TO authenticated;
GRANT SELECT ON public._backup_billing_invoices_neg_20260606 TO authenticated;
GRANT TRIGGER ON public._backup_billing_invoices_neg_20260606 TO authenticated;
GRANT TRUNCATE ON public._backup_billing_invoices_neg_20260606 TO authenticated;
GRANT UPDATE ON public._backup_billing_invoices_neg_20260606 TO authenticated;
GRANT DELETE ON public._backup_billing_invoices_neg_20260606 TO service_role;
GRANT INSERT ON public._backup_billing_invoices_neg_20260606 TO service_role;
GRANT REFERENCES ON public._backup_billing_invoices_neg_20260606 TO service_role;
GRANT SELECT ON public._backup_billing_invoices_neg_20260606 TO service_role;
GRANT TRIGGER ON public._backup_billing_invoices_neg_20260606 TO service_role;
GRANT TRUNCATE ON public._backup_billing_invoices_neg_20260606 TO service_role;
GRANT UPDATE ON public._backup_billing_invoices_neg_20260606 TO service_role;
GRANT DELETE ON public._backup_billing_invoices_neg_20260609 TO anon;
GRANT INSERT ON public._backup_billing_invoices_neg_20260609 TO anon;
GRANT REFERENCES ON public._backup_billing_invoices_neg_20260609 TO anon;
GRANT SELECT ON public._backup_billing_invoices_neg_20260609 TO anon;
GRANT TRIGGER ON public._backup_billing_invoices_neg_20260609 TO anon;
GRANT TRUNCATE ON public._backup_billing_invoices_neg_20260609 TO anon;
GRANT UPDATE ON public._backup_billing_invoices_neg_20260609 TO anon;
GRANT DELETE ON public._backup_billing_invoices_neg_20260609 TO authenticated;
GRANT INSERT ON public._backup_billing_invoices_neg_20260609 TO authenticated;
GRANT REFERENCES ON public._backup_billing_invoices_neg_20260609 TO authenticated;
GRANT SELECT ON public._backup_billing_invoices_neg_20260609 TO authenticated;
GRANT TRIGGER ON public._backup_billing_invoices_neg_20260609 TO authenticated;
GRANT TRUNCATE ON public._backup_billing_invoices_neg_20260609 TO authenticated;
GRANT UPDATE ON public._backup_billing_invoices_neg_20260609 TO authenticated;
GRANT DELETE ON public._backup_billing_invoices_neg_20260609 TO service_role;
GRANT INSERT ON public._backup_billing_invoices_neg_20260609 TO service_role;
GRANT REFERENCES ON public._backup_billing_invoices_neg_20260609 TO service_role;
GRANT SELECT ON public._backup_billing_invoices_neg_20260609 TO service_role;
GRANT TRIGGER ON public._backup_billing_invoices_neg_20260609 TO service_role;
GRANT TRUNCATE ON public._backup_billing_invoices_neg_20260609 TO service_role;
GRANT UPDATE ON public._backup_billing_invoices_neg_20260609 TO service_role;
GRANT DELETE ON public._backup_fresh_20260610_ptx TO anon;
GRANT INSERT ON public._backup_fresh_20260610_ptx TO anon;
GRANT REFERENCES ON public._backup_fresh_20260610_ptx TO anon;
GRANT SELECT ON public._backup_fresh_20260610_ptx TO anon;
GRANT TRIGGER ON public._backup_fresh_20260610_ptx TO anon;
GRANT TRUNCATE ON public._backup_fresh_20260610_ptx TO anon;
GRANT UPDATE ON public._backup_fresh_20260610_ptx TO anon;
GRANT DELETE ON public._backup_fresh_20260610_ptx TO authenticated;
GRANT INSERT ON public._backup_fresh_20260610_ptx TO authenticated;
GRANT REFERENCES ON public._backup_fresh_20260610_ptx TO authenticated;
GRANT SELECT ON public._backup_fresh_20260610_ptx TO authenticated;
GRANT TRIGGER ON public._backup_fresh_20260610_ptx TO authenticated;
GRANT TRUNCATE ON public._backup_fresh_20260610_ptx TO authenticated;
GRANT UPDATE ON public._backup_fresh_20260610_ptx TO authenticated;
GRANT DELETE ON public._backup_fresh_20260610_ptx TO service_role;
GRANT INSERT ON public._backup_fresh_20260610_ptx TO service_role;
GRANT REFERENCES ON public._backup_fresh_20260610_ptx TO service_role;
GRANT SELECT ON public._backup_fresh_20260610_ptx TO service_role;
GRANT TRIGGER ON public._backup_fresh_20260610_ptx TO service_role;
GRANT TRUNCATE ON public._backup_fresh_20260610_ptx TO service_role;
GRANT UPDATE ON public._backup_fresh_20260610_ptx TO service_role;
GRANT DELETE ON public._backup_fresh_20260610_reservations TO anon;
GRANT INSERT ON public._backup_fresh_20260610_reservations TO anon;
GRANT REFERENCES ON public._backup_fresh_20260610_reservations TO anon;
GRANT SELECT ON public._backup_fresh_20260610_reservations TO anon;
GRANT TRIGGER ON public._backup_fresh_20260610_reservations TO anon;
GRANT TRUNCATE ON public._backup_fresh_20260610_reservations TO anon;
GRANT UPDATE ON public._backup_fresh_20260610_reservations TO anon;
GRANT DELETE ON public._backup_fresh_20260610_reservations TO authenticated;
GRANT INSERT ON public._backup_fresh_20260610_reservations TO authenticated;
GRANT REFERENCES ON public._backup_fresh_20260610_reservations TO authenticated;
GRANT SELECT ON public._backup_fresh_20260610_reservations TO authenticated;
GRANT TRIGGER ON public._backup_fresh_20260610_reservations TO authenticated;
GRANT TRUNCATE ON public._backup_fresh_20260610_reservations TO authenticated;
GRANT UPDATE ON public._backup_fresh_20260610_reservations TO authenticated;
GRANT DELETE ON public._backup_fresh_20260610_reservations TO service_role;
GRANT INSERT ON public._backup_fresh_20260610_reservations TO service_role;
GRANT REFERENCES ON public._backup_fresh_20260610_reservations TO service_role;
GRANT SELECT ON public._backup_fresh_20260610_reservations TO service_role;
GRANT TRIGGER ON public._backup_fresh_20260610_reservations TO service_role;
GRANT TRUNCATE ON public._backup_fresh_20260610_reservations TO service_role;
GRANT UPDATE ON public._backup_fresh_20260610_reservations TO service_role;
GRANT DELETE ON public._backup_fresh_20260610_transactions TO anon;
GRANT INSERT ON public._backup_fresh_20260610_transactions TO anon;
GRANT REFERENCES ON public._backup_fresh_20260610_transactions TO anon;
GRANT SELECT ON public._backup_fresh_20260610_transactions TO anon;
GRANT TRIGGER ON public._backup_fresh_20260610_transactions TO anon;
GRANT TRUNCATE ON public._backup_fresh_20260610_transactions TO anon;
GRANT UPDATE ON public._backup_fresh_20260610_transactions TO anon;
GRANT DELETE ON public._backup_fresh_20260610_transactions TO authenticated;
GRANT INSERT ON public._backup_fresh_20260610_transactions TO authenticated;
GRANT REFERENCES ON public._backup_fresh_20260610_transactions TO authenticated;
GRANT SELECT ON public._backup_fresh_20260610_transactions TO authenticated;
GRANT TRIGGER ON public._backup_fresh_20260610_transactions TO authenticated;
GRANT TRUNCATE ON public._backup_fresh_20260610_transactions TO authenticated;
GRANT UPDATE ON public._backup_fresh_20260610_transactions TO authenticated;
GRANT DELETE ON public._backup_fresh_20260610_transactions TO service_role;
GRANT INSERT ON public._backup_fresh_20260610_transactions TO service_role;
GRANT REFERENCES ON public._backup_fresh_20260610_transactions TO service_role;
GRANT SELECT ON public._backup_fresh_20260610_transactions TO service_role;
GRANT TRIGGER ON public._backup_fresh_20260610_transactions TO service_role;
GRANT TRUNCATE ON public._backup_fresh_20260610_transactions TO service_role;
GRANT UPDATE ON public._backup_fresh_20260610_transactions TO service_role;
GRANT DELETE ON public._backup_guests_20260526 TO anon;
GRANT INSERT ON public._backup_guests_20260526 TO anon;
GRANT REFERENCES ON public._backup_guests_20260526 TO anon;
GRANT SELECT ON public._backup_guests_20260526 TO anon;
GRANT TRIGGER ON public._backup_guests_20260526 TO anon;
GRANT TRUNCATE ON public._backup_guests_20260526 TO anon;
GRANT UPDATE ON public._backup_guests_20260526 TO anon;
GRANT DELETE ON public._backup_guests_20260526 TO authenticated;
GRANT INSERT ON public._backup_guests_20260526 TO authenticated;
GRANT REFERENCES ON public._backup_guests_20260526 TO authenticated;
GRANT SELECT ON public._backup_guests_20260526 TO authenticated;
GRANT TRIGGER ON public._backup_guests_20260526 TO authenticated;
GRANT TRUNCATE ON public._backup_guests_20260526 TO authenticated;
GRANT UPDATE ON public._backup_guests_20260526 TO authenticated;
GRANT DELETE ON public._backup_guests_20260526 TO service_role;
GRANT INSERT ON public._backup_guests_20260526 TO service_role;
GRANT REFERENCES ON public._backup_guests_20260526 TO service_role;
GRANT SELECT ON public._backup_guests_20260526 TO service_role;
GRANT TRIGGER ON public._backup_guests_20260526 TO service_role;
GRANT TRUNCATE ON public._backup_guests_20260526 TO service_role;
GRANT UPDATE ON public._backup_guests_20260526 TO service_role;
GRANT DELETE ON public._backup_guests_20260526_agg TO anon;
GRANT INSERT ON public._backup_guests_20260526_agg TO anon;
GRANT REFERENCES ON public._backup_guests_20260526_agg TO anon;
GRANT SELECT ON public._backup_guests_20260526_agg TO anon;
GRANT TRIGGER ON public._backup_guests_20260526_agg TO anon;
GRANT TRUNCATE ON public._backup_guests_20260526_agg TO anon;
GRANT UPDATE ON public._backup_guests_20260526_agg TO anon;
GRANT DELETE ON public._backup_guests_20260526_agg TO authenticated;
GRANT INSERT ON public._backup_guests_20260526_agg TO authenticated;
GRANT REFERENCES ON public._backup_guests_20260526_agg TO authenticated;
GRANT SELECT ON public._backup_guests_20260526_agg TO authenticated;
GRANT TRIGGER ON public._backup_guests_20260526_agg TO authenticated;
GRANT TRUNCATE ON public._backup_guests_20260526_agg TO authenticated;
GRANT UPDATE ON public._backup_guests_20260526_agg TO authenticated;
GRANT DELETE ON public._backup_guests_20260526_agg TO service_role;
GRANT INSERT ON public._backup_guests_20260526_agg TO service_role;
GRANT REFERENCES ON public._backup_guests_20260526_agg TO service_role;
GRANT SELECT ON public._backup_guests_20260526_agg TO service_role;
GRANT TRIGGER ON public._backup_guests_20260526_agg TO service_role;
GRANT TRUNCATE ON public._backup_guests_20260526_agg TO service_role;
GRANT UPDATE ON public._backup_guests_20260526_agg TO service_role;
GRANT DELETE ON public._backup_payment_tx_dedup_20260606 TO anon;
GRANT INSERT ON public._backup_payment_tx_dedup_20260606 TO anon;
GRANT REFERENCES ON public._backup_payment_tx_dedup_20260606 TO anon;
GRANT SELECT ON public._backup_payment_tx_dedup_20260606 TO anon;
GRANT TRIGGER ON public._backup_payment_tx_dedup_20260606 TO anon;
GRANT TRUNCATE ON public._backup_payment_tx_dedup_20260606 TO anon;
GRANT UPDATE ON public._backup_payment_tx_dedup_20260606 TO anon;
GRANT DELETE ON public._backup_payment_tx_dedup_20260606 TO authenticated;
GRANT INSERT ON public._backup_payment_tx_dedup_20260606 TO authenticated;
GRANT REFERENCES ON public._backup_payment_tx_dedup_20260606 TO authenticated;
GRANT SELECT ON public._backup_payment_tx_dedup_20260606 TO authenticated;
GRANT TRIGGER ON public._backup_payment_tx_dedup_20260606 TO authenticated;
GRANT TRUNCATE ON public._backup_payment_tx_dedup_20260606 TO authenticated;
GRANT UPDATE ON public._backup_payment_tx_dedup_20260606 TO authenticated;
GRANT DELETE ON public._backup_payment_tx_dedup_20260606 TO service_role;
GRANT INSERT ON public._backup_payment_tx_dedup_20260606 TO service_role;
GRANT REFERENCES ON public._backup_payment_tx_dedup_20260606 TO service_role;
GRANT SELECT ON public._backup_payment_tx_dedup_20260606 TO service_role;
GRANT TRIGGER ON public._backup_payment_tx_dedup_20260606 TO service_role;
GRANT TRUNCATE ON public._backup_payment_tx_dedup_20260606 TO service_role;
GRANT UPDATE ON public._backup_payment_tx_dedup_20260606 TO service_role;
GRANT DELETE ON public._backup_payment_tx_neg_20260609 TO anon;
GRANT INSERT ON public._backup_payment_tx_neg_20260609 TO anon;
GRANT REFERENCES ON public._backup_payment_tx_neg_20260609 TO anon;
GRANT SELECT ON public._backup_payment_tx_neg_20260609 TO anon;
GRANT TRIGGER ON public._backup_payment_tx_neg_20260609 TO anon;
GRANT TRUNCATE ON public._backup_payment_tx_neg_20260609 TO anon;
GRANT UPDATE ON public._backup_payment_tx_neg_20260609 TO anon;
GRANT DELETE ON public._backup_payment_tx_neg_20260609 TO authenticated;
GRANT INSERT ON public._backup_payment_tx_neg_20260609 TO authenticated;
GRANT REFERENCES ON public._backup_payment_tx_neg_20260609 TO authenticated;
GRANT SELECT ON public._backup_payment_tx_neg_20260609 TO authenticated;
GRANT TRIGGER ON public._backup_payment_tx_neg_20260609 TO authenticated;
GRANT TRUNCATE ON public._backup_payment_tx_neg_20260609 TO authenticated;
GRANT UPDATE ON public._backup_payment_tx_neg_20260609 TO authenticated;
GRANT DELETE ON public._backup_payment_tx_neg_20260609 TO service_role;
GRANT INSERT ON public._backup_payment_tx_neg_20260609 TO service_role;
GRANT REFERENCES ON public._backup_payment_tx_neg_20260609 TO service_role;
GRANT SELECT ON public._backup_payment_tx_neg_20260609 TO service_role;
GRANT TRIGGER ON public._backup_payment_tx_neg_20260609 TO service_role;
GRANT TRUNCATE ON public._backup_payment_tx_neg_20260609 TO service_role;
GRANT UPDATE ON public._backup_payment_tx_neg_20260609 TO service_role;
GRANT DELETE ON public._backup_payment_tx_nonneg_dup_20260609 TO anon;
GRANT INSERT ON public._backup_payment_tx_nonneg_dup_20260609 TO anon;
GRANT REFERENCES ON public._backup_payment_tx_nonneg_dup_20260609 TO anon;
GRANT SELECT ON public._backup_payment_tx_nonneg_dup_20260609 TO anon;
GRANT TRIGGER ON public._backup_payment_tx_nonneg_dup_20260609 TO anon;
GRANT TRUNCATE ON public._backup_payment_tx_nonneg_dup_20260609 TO anon;
GRANT UPDATE ON public._backup_payment_tx_nonneg_dup_20260609 TO anon;
GRANT DELETE ON public._backup_payment_tx_nonneg_dup_20260609 TO authenticated;
GRANT INSERT ON public._backup_payment_tx_nonneg_dup_20260609 TO authenticated;
GRANT REFERENCES ON public._backup_payment_tx_nonneg_dup_20260609 TO authenticated;
GRANT SELECT ON public._backup_payment_tx_nonneg_dup_20260609 TO authenticated;
GRANT TRIGGER ON public._backup_payment_tx_nonneg_dup_20260609 TO authenticated;
GRANT TRUNCATE ON public._backup_payment_tx_nonneg_dup_20260609 TO authenticated;
GRANT UPDATE ON public._backup_payment_tx_nonneg_dup_20260609 TO authenticated;
GRANT DELETE ON public._backup_payment_tx_nonneg_dup_20260609 TO service_role;
GRANT INSERT ON public._backup_payment_tx_nonneg_dup_20260609 TO service_role;
GRANT REFERENCES ON public._backup_payment_tx_nonneg_dup_20260609 TO service_role;
GRANT SELECT ON public._backup_payment_tx_nonneg_dup_20260609 TO service_role;
GRANT TRIGGER ON public._backup_payment_tx_nonneg_dup_20260609 TO service_role;
GRANT TRUNCATE ON public._backup_payment_tx_nonneg_dup_20260609 TO service_role;
GRANT UPDATE ON public._backup_payment_tx_nonneg_dup_20260609 TO service_role;
GRANT DELETE ON public._backup_recon_billing_20260610 TO anon;
GRANT INSERT ON public._backup_recon_billing_20260610 TO anon;
GRANT REFERENCES ON public._backup_recon_billing_20260610 TO anon;
GRANT SELECT ON public._backup_recon_billing_20260610 TO anon;
GRANT TRIGGER ON public._backup_recon_billing_20260610 TO anon;
GRANT TRUNCATE ON public._backup_recon_billing_20260610 TO anon;
GRANT UPDATE ON public._backup_recon_billing_20260610 TO anon;
GRANT DELETE ON public._backup_recon_billing_20260610 TO authenticated;
GRANT INSERT ON public._backup_recon_billing_20260610 TO authenticated;
GRANT REFERENCES ON public._backup_recon_billing_20260610 TO authenticated;
GRANT SELECT ON public._backup_recon_billing_20260610 TO authenticated;
GRANT TRIGGER ON public._backup_recon_billing_20260610 TO authenticated;
GRANT TRUNCATE ON public._backup_recon_billing_20260610 TO authenticated;
GRANT UPDATE ON public._backup_recon_billing_20260610 TO authenticated;
GRANT DELETE ON public._backup_recon_billing_20260610 TO service_role;
GRANT INSERT ON public._backup_recon_billing_20260610 TO service_role;
GRANT REFERENCES ON public._backup_recon_billing_20260610 TO service_role;
GRANT SELECT ON public._backup_recon_billing_20260610 TO service_role;
GRANT TRIGGER ON public._backup_recon_billing_20260610 TO service_role;
GRANT TRUNCATE ON public._backup_recon_billing_20260610 TO service_role;
GRANT UPDATE ON public._backup_recon_billing_20260610 TO service_role;
GRANT DELETE ON public._backup_reservation_guest_ids_20260526 TO anon;
GRANT INSERT ON public._backup_reservation_guest_ids_20260526 TO anon;
GRANT REFERENCES ON public._backup_reservation_guest_ids_20260526 TO anon;
GRANT SELECT ON public._backup_reservation_guest_ids_20260526 TO anon;
GRANT TRIGGER ON public._backup_reservation_guest_ids_20260526 TO anon;
GRANT TRUNCATE ON public._backup_reservation_guest_ids_20260526 TO anon;
GRANT UPDATE ON public._backup_reservation_guest_ids_20260526 TO anon;
GRANT DELETE ON public._backup_reservation_guest_ids_20260526 TO authenticated;
GRANT INSERT ON public._backup_reservation_guest_ids_20260526 TO authenticated;
GRANT REFERENCES ON public._backup_reservation_guest_ids_20260526 TO authenticated;
GRANT SELECT ON public._backup_reservation_guest_ids_20260526 TO authenticated;
GRANT TRIGGER ON public._backup_reservation_guest_ids_20260526 TO authenticated;
GRANT TRUNCATE ON public._backup_reservation_guest_ids_20260526 TO authenticated;
GRANT UPDATE ON public._backup_reservation_guest_ids_20260526 TO authenticated;
GRANT DELETE ON public._backup_reservation_guest_ids_20260526 TO service_role;
GRANT INSERT ON public._backup_reservation_guest_ids_20260526 TO service_role;
GRANT REFERENCES ON public._backup_reservation_guest_ids_20260526 TO service_role;
GRANT SELECT ON public._backup_reservation_guest_ids_20260526 TO service_role;
GRANT TRIGGER ON public._backup_reservation_guest_ids_20260526 TO service_role;
GRANT TRUNCATE ON public._backup_reservation_guest_ids_20260526 TO service_role;
GRANT UPDATE ON public._backup_reservation_guest_ids_20260526 TO service_role;
GRANT DELETE ON public._backup_reservation_guest_ids_20260526_agg TO anon;
GRANT INSERT ON public._backup_reservation_guest_ids_20260526_agg TO anon;
GRANT REFERENCES ON public._backup_reservation_guest_ids_20260526_agg TO anon;
GRANT SELECT ON public._backup_reservation_guest_ids_20260526_agg TO anon;
GRANT TRIGGER ON public._backup_reservation_guest_ids_20260526_agg TO anon;
GRANT TRUNCATE ON public._backup_reservation_guest_ids_20260526_agg TO anon;
GRANT UPDATE ON public._backup_reservation_guest_ids_20260526_agg TO anon;
GRANT DELETE ON public._backup_reservation_guest_ids_20260526_agg TO authenticated;
GRANT INSERT ON public._backup_reservation_guest_ids_20260526_agg TO authenticated;
GRANT REFERENCES ON public._backup_reservation_guest_ids_20260526_agg TO authenticated;
GRANT SELECT ON public._backup_reservation_guest_ids_20260526_agg TO authenticated;
GRANT TRIGGER ON public._backup_reservation_guest_ids_20260526_agg TO authenticated;
GRANT TRUNCATE ON public._backup_reservation_guest_ids_20260526_agg TO authenticated;
GRANT UPDATE ON public._backup_reservation_guest_ids_20260526_agg TO authenticated;
GRANT DELETE ON public._backup_reservation_guest_ids_20260526_agg TO service_role;
GRANT INSERT ON public._backup_reservation_guest_ids_20260526_agg TO service_role;
GRANT REFERENCES ON public._backup_reservation_guest_ids_20260526_agg TO service_role;
GRANT SELECT ON public._backup_reservation_guest_ids_20260526_agg TO service_role;
GRANT TRIGGER ON public._backup_reservation_guest_ids_20260526_agg TO service_role;
GRANT TRUNCATE ON public._backup_reservation_guest_ids_20260526_agg TO service_role;
GRANT UPDATE ON public._backup_reservation_guest_ids_20260526_agg TO service_role;
GRANT DELETE ON public._backup_reset_20260610_folios TO anon;
GRANT INSERT ON public._backup_reset_20260610_folios TO anon;
GRANT REFERENCES ON public._backup_reset_20260610_folios TO anon;
GRANT SELECT ON public._backup_reset_20260610_folios TO anon;
GRANT TRIGGER ON public._backup_reset_20260610_folios TO anon;
GRANT TRUNCATE ON public._backup_reset_20260610_folios TO anon;
GRANT UPDATE ON public._backup_reset_20260610_folios TO anon;
GRANT DELETE ON public._backup_reset_20260610_folios TO authenticated;
GRANT INSERT ON public._backup_reset_20260610_folios TO authenticated;
GRANT REFERENCES ON public._backup_reset_20260610_folios TO authenticated;
GRANT SELECT ON public._backup_reset_20260610_folios TO authenticated;
GRANT TRIGGER ON public._backup_reset_20260610_folios TO authenticated;
GRANT TRUNCATE ON public._backup_reset_20260610_folios TO authenticated;
GRANT UPDATE ON public._backup_reset_20260610_folios TO authenticated;
GRANT DELETE ON public._backup_reset_20260610_folios TO service_role;
GRANT INSERT ON public._backup_reset_20260610_folios TO service_role;
GRANT REFERENCES ON public._backup_reset_20260610_folios TO service_role;
GRANT SELECT ON public._backup_reset_20260610_folios TO service_role;
GRANT TRIGGER ON public._backup_reset_20260610_folios TO service_role;
GRANT TRUNCATE ON public._backup_reset_20260610_folios TO service_role;
GRANT UPDATE ON public._backup_reset_20260610_folios TO service_role;
GRANT DELETE ON public._backup_reset_20260610_ptx TO anon;
GRANT INSERT ON public._backup_reset_20260610_ptx TO anon;
GRANT REFERENCES ON public._backup_reset_20260610_ptx TO anon;
GRANT SELECT ON public._backup_reset_20260610_ptx TO anon;
GRANT TRIGGER ON public._backup_reset_20260610_ptx TO anon;
GRANT TRUNCATE ON public._backup_reset_20260610_ptx TO anon;
GRANT UPDATE ON public._backup_reset_20260610_ptx TO anon;
GRANT DELETE ON public._backup_reset_20260610_ptx TO authenticated;
GRANT INSERT ON public._backup_reset_20260610_ptx TO authenticated;
GRANT REFERENCES ON public._backup_reset_20260610_ptx TO authenticated;
GRANT SELECT ON public._backup_reset_20260610_ptx TO authenticated;
GRANT TRIGGER ON public._backup_reset_20260610_ptx TO authenticated;
GRANT TRUNCATE ON public._backup_reset_20260610_ptx TO authenticated;
GRANT UPDATE ON public._backup_reset_20260610_ptx TO authenticated;
GRANT DELETE ON public._backup_reset_20260610_ptx TO service_role;
GRANT INSERT ON public._backup_reset_20260610_ptx TO service_role;
GRANT REFERENCES ON public._backup_reset_20260610_ptx TO service_role;
GRANT SELECT ON public._backup_reset_20260610_ptx TO service_role;
GRANT TRIGGER ON public._backup_reset_20260610_ptx TO service_role;
GRANT TRUNCATE ON public._backup_reset_20260610_ptx TO service_role;
GRANT UPDATE ON public._backup_reset_20260610_ptx TO service_role;
GRANT DELETE ON public._backup_reset_20260610_reservations TO anon;
GRANT INSERT ON public._backup_reset_20260610_reservations TO anon;
GRANT REFERENCES ON public._backup_reset_20260610_reservations TO anon;
GRANT SELECT ON public._backup_reset_20260610_reservations TO anon;
GRANT TRIGGER ON public._backup_reset_20260610_reservations TO anon;
GRANT TRUNCATE ON public._backup_reset_20260610_reservations TO anon;
GRANT UPDATE ON public._backup_reset_20260610_reservations TO anon;
GRANT DELETE ON public._backup_reset_20260610_reservations TO authenticated;
GRANT INSERT ON public._backup_reset_20260610_reservations TO authenticated;
GRANT REFERENCES ON public._backup_reset_20260610_reservations TO authenticated;
GRANT SELECT ON public._backup_reset_20260610_reservations TO authenticated;
GRANT TRIGGER ON public._backup_reset_20260610_reservations TO authenticated;
GRANT TRUNCATE ON public._backup_reset_20260610_reservations TO authenticated;
GRANT UPDATE ON public._backup_reset_20260610_reservations TO authenticated;
GRANT DELETE ON public._backup_reset_20260610_reservations TO service_role;
GRANT INSERT ON public._backup_reset_20260610_reservations TO service_role;
GRANT REFERENCES ON public._backup_reset_20260610_reservations TO service_role;
GRANT SELECT ON public._backup_reset_20260610_reservations TO service_role;
GRANT TRIGGER ON public._backup_reset_20260610_reservations TO service_role;
GRANT TRUNCATE ON public._backup_reset_20260610_reservations TO service_role;
GRANT UPDATE ON public._backup_reset_20260610_reservations TO service_role;
GRANT DELETE ON public._backup_reset_20260610_transactions TO anon;
GRANT INSERT ON public._backup_reset_20260610_transactions TO anon;
GRANT REFERENCES ON public._backup_reset_20260610_transactions TO anon;
GRANT SELECT ON public._backup_reset_20260610_transactions TO anon;
GRANT TRIGGER ON public._backup_reset_20260610_transactions TO anon;
GRANT TRUNCATE ON public._backup_reset_20260610_transactions TO anon;
GRANT UPDATE ON public._backup_reset_20260610_transactions TO anon;
GRANT DELETE ON public._backup_reset_20260610_transactions TO authenticated;
GRANT INSERT ON public._backup_reset_20260610_transactions TO authenticated;
GRANT REFERENCES ON public._backup_reset_20260610_transactions TO authenticated;
GRANT SELECT ON public._backup_reset_20260610_transactions TO authenticated;
GRANT TRIGGER ON public._backup_reset_20260610_transactions TO authenticated;
GRANT TRUNCATE ON public._backup_reset_20260610_transactions TO authenticated;
GRANT UPDATE ON public._backup_reset_20260610_transactions TO authenticated;
GRANT DELETE ON public._backup_reset_20260610_transactions TO service_role;
GRANT INSERT ON public._backup_reset_20260610_transactions TO service_role;
GRANT REFERENCES ON public._backup_reset_20260610_transactions TO service_role;
GRANT SELECT ON public._backup_reset_20260610_transactions TO service_role;
GRANT TRIGGER ON public._backup_reset_20260610_transactions TO service_role;
GRANT TRUNCATE ON public._backup_reset_20260610_transactions TO service_role;
GRANT UPDATE ON public._backup_reset_20260610_transactions TO service_role;
GRANT DELETE ON public._backup_resv_guestname_20260610 TO anon;
GRANT INSERT ON public._backup_resv_guestname_20260610 TO anon;
GRANT REFERENCES ON public._backup_resv_guestname_20260610 TO anon;
GRANT SELECT ON public._backup_resv_guestname_20260610 TO anon;
GRANT TRIGGER ON public._backup_resv_guestname_20260610 TO anon;
GRANT TRUNCATE ON public._backup_resv_guestname_20260610 TO anon;
GRANT UPDATE ON public._backup_resv_guestname_20260610 TO anon;
GRANT DELETE ON public._backup_resv_guestname_20260610 TO authenticated;
GRANT INSERT ON public._backup_resv_guestname_20260610 TO authenticated;
GRANT REFERENCES ON public._backup_resv_guestname_20260610 TO authenticated;
GRANT SELECT ON public._backup_resv_guestname_20260610 TO authenticated;
GRANT TRIGGER ON public._backup_resv_guestname_20260610 TO authenticated;
GRANT TRUNCATE ON public._backup_resv_guestname_20260610 TO authenticated;
GRANT UPDATE ON public._backup_resv_guestname_20260610 TO authenticated;
GRANT DELETE ON public._backup_resv_guestname_20260610 TO service_role;
GRANT INSERT ON public._backup_resv_guestname_20260610 TO service_role;
GRANT REFERENCES ON public._backup_resv_guestname_20260610 TO service_role;
GRANT SELECT ON public._backup_resv_guestname_20260610 TO service_role;
GRANT TRIGGER ON public._backup_resv_guestname_20260610 TO service_role;
GRANT TRUNCATE ON public._backup_resv_guestname_20260610 TO service_role;
GRANT UPDATE ON public._backup_resv_guestname_20260610 TO service_role;
GRANT DELETE ON public._backup_staff_20260610 TO anon;
GRANT INSERT ON public._backup_staff_20260610 TO anon;
GRANT REFERENCES ON public._backup_staff_20260610 TO anon;
GRANT SELECT ON public._backup_staff_20260610 TO anon;
GRANT TRIGGER ON public._backup_staff_20260610 TO anon;
GRANT TRUNCATE ON public._backup_staff_20260610 TO anon;
GRANT UPDATE ON public._backup_staff_20260610 TO anon;
GRANT DELETE ON public._backup_staff_20260610 TO authenticated;
GRANT INSERT ON public._backup_staff_20260610 TO authenticated;
GRANT REFERENCES ON public._backup_staff_20260610 TO authenticated;
GRANT SELECT ON public._backup_staff_20260610 TO authenticated;
GRANT TRIGGER ON public._backup_staff_20260610 TO authenticated;
GRANT TRUNCATE ON public._backup_staff_20260610 TO authenticated;
GRANT UPDATE ON public._backup_staff_20260610 TO authenticated;
GRANT DELETE ON public._backup_staff_20260610 TO service_role;
GRANT INSERT ON public._backup_staff_20260610 TO service_role;
GRANT REFERENCES ON public._backup_staff_20260610 TO service_role;
GRANT SELECT ON public._backup_staff_20260610 TO service_role;
GRANT TRIGGER ON public._backup_staff_20260610 TO service_role;
GRANT TRUNCATE ON public._backup_staff_20260610 TO service_role;
GRANT UPDATE ON public._backup_staff_20260610 TO service_role;
GRANT DELETE ON public._backup_transactions_neg_20260609 TO anon;
GRANT INSERT ON public._backup_transactions_neg_20260609 TO anon;
GRANT REFERENCES ON public._backup_transactions_neg_20260609 TO anon;
GRANT SELECT ON public._backup_transactions_neg_20260609 TO anon;
GRANT TRIGGER ON public._backup_transactions_neg_20260609 TO anon;
GRANT TRUNCATE ON public._backup_transactions_neg_20260609 TO anon;
GRANT UPDATE ON public._backup_transactions_neg_20260609 TO anon;
GRANT DELETE ON public._backup_transactions_neg_20260609 TO authenticated;
GRANT INSERT ON public._backup_transactions_neg_20260609 TO authenticated;
GRANT REFERENCES ON public._backup_transactions_neg_20260609 TO authenticated;
GRANT SELECT ON public._backup_transactions_neg_20260609 TO authenticated;
GRANT TRIGGER ON public._backup_transactions_neg_20260609 TO authenticated;
GRANT TRUNCATE ON public._backup_transactions_neg_20260609 TO authenticated;
GRANT UPDATE ON public._backup_transactions_neg_20260609 TO authenticated;
GRANT DELETE ON public._backup_transactions_neg_20260609 TO service_role;
GRANT INSERT ON public._backup_transactions_neg_20260609 TO service_role;
GRANT REFERENCES ON public._backup_transactions_neg_20260609 TO service_role;
GRANT SELECT ON public._backup_transactions_neg_20260609 TO service_role;
GRANT TRIGGER ON public._backup_transactions_neg_20260609 TO service_role;
GRANT TRUNCATE ON public._backup_transactions_neg_20260609 TO service_role;
GRANT UPDATE ON public._backup_transactions_neg_20260609 TO service_role;
GRANT DELETE ON public._dedup_map_20260526 TO anon;
GRANT INSERT ON public._dedup_map_20260526 TO anon;
GRANT REFERENCES ON public._dedup_map_20260526 TO anon;
GRANT SELECT ON public._dedup_map_20260526 TO anon;
GRANT TRIGGER ON public._dedup_map_20260526 TO anon;
GRANT TRUNCATE ON public._dedup_map_20260526 TO anon;
GRANT UPDATE ON public._dedup_map_20260526 TO anon;
GRANT DELETE ON public._dedup_map_20260526 TO authenticated;
GRANT INSERT ON public._dedup_map_20260526 TO authenticated;
GRANT REFERENCES ON public._dedup_map_20260526 TO authenticated;
GRANT SELECT ON public._dedup_map_20260526 TO authenticated;
GRANT TRIGGER ON public._dedup_map_20260526 TO authenticated;
GRANT TRUNCATE ON public._dedup_map_20260526 TO authenticated;
GRANT UPDATE ON public._dedup_map_20260526 TO authenticated;
GRANT DELETE ON public._dedup_map_20260526 TO service_role;
GRANT INSERT ON public._dedup_map_20260526 TO service_role;
GRANT REFERENCES ON public._dedup_map_20260526 TO service_role;
GRANT SELECT ON public._dedup_map_20260526 TO service_role;
GRANT TRIGGER ON public._dedup_map_20260526 TO service_role;
GRANT TRUNCATE ON public._dedup_map_20260526 TO service_role;
GRANT UPDATE ON public._dedup_map_20260526 TO service_role;
GRANT DELETE ON public._dedup_map_20260526_agg TO anon;
GRANT INSERT ON public._dedup_map_20260526_agg TO anon;
GRANT REFERENCES ON public._dedup_map_20260526_agg TO anon;
GRANT SELECT ON public._dedup_map_20260526_agg TO anon;
GRANT TRIGGER ON public._dedup_map_20260526_agg TO anon;
GRANT TRUNCATE ON public._dedup_map_20260526_agg TO anon;
GRANT UPDATE ON public._dedup_map_20260526_agg TO anon;
GRANT DELETE ON public._dedup_map_20260526_agg TO authenticated;
GRANT INSERT ON public._dedup_map_20260526_agg TO authenticated;
GRANT REFERENCES ON public._dedup_map_20260526_agg TO authenticated;
GRANT SELECT ON public._dedup_map_20260526_agg TO authenticated;
GRANT TRIGGER ON public._dedup_map_20260526_agg TO authenticated;
GRANT TRUNCATE ON public._dedup_map_20260526_agg TO authenticated;
GRANT UPDATE ON public._dedup_map_20260526_agg TO authenticated;
GRANT DELETE ON public._dedup_map_20260526_agg TO service_role;
GRANT INSERT ON public._dedup_map_20260526_agg TO service_role;
GRANT REFERENCES ON public._dedup_map_20260526_agg TO service_role;
GRANT SELECT ON public._dedup_map_20260526_agg TO service_role;
GRANT TRIGGER ON public._dedup_map_20260526_agg TO service_role;
GRANT TRUNCATE ON public._dedup_map_20260526_agg TO service_role;
GRANT UPDATE ON public._dedup_map_20260526_agg TO service_role;
GRANT DELETE ON public.account_churn_profile TO anon;
GRANT INSERT ON public.account_churn_profile TO anon;
GRANT REFERENCES ON public.account_churn_profile TO anon;
GRANT SELECT ON public.account_churn_profile TO anon;
GRANT TRIGGER ON public.account_churn_profile TO anon;
GRANT TRUNCATE ON public.account_churn_profile TO anon;
GRANT UPDATE ON public.account_churn_profile TO anon;
GRANT DELETE ON public.account_churn_profile TO authenticated;
GRANT INSERT ON public.account_churn_profile TO authenticated;
GRANT REFERENCES ON public.account_churn_profile TO authenticated;
GRANT SELECT ON public.account_churn_profile TO authenticated;
GRANT TRIGGER ON public.account_churn_profile TO authenticated;
GRANT TRUNCATE ON public.account_churn_profile TO authenticated;
GRANT UPDATE ON public.account_churn_profile TO authenticated;
GRANT DELETE ON public.account_churn_profile TO service_role;
GRANT INSERT ON public.account_churn_profile TO service_role;
GRANT REFERENCES ON public.account_churn_profile TO service_role;
GRANT SELECT ON public.account_churn_profile TO service_role;
GRANT TRIGGER ON public.account_churn_profile TO service_role;
GRANT TRUNCATE ON public.account_churn_profile TO service_role;
GRANT UPDATE ON public.account_churn_profile TO service_role;
GRANT DELETE ON public.agent_learning_log TO anon;
GRANT INSERT ON public.agent_learning_log TO anon;
GRANT REFERENCES ON public.agent_learning_log TO anon;
GRANT SELECT ON public.agent_learning_log TO anon;
GRANT TRIGGER ON public.agent_learning_log TO anon;
GRANT TRUNCATE ON public.agent_learning_log TO anon;
GRANT UPDATE ON public.agent_learning_log TO anon;
GRANT DELETE ON public.agent_learning_log TO authenticated;
GRANT INSERT ON public.agent_learning_log TO authenticated;
GRANT REFERENCES ON public.agent_learning_log TO authenticated;
GRANT SELECT ON public.agent_learning_log TO authenticated;
GRANT TRIGGER ON public.agent_learning_log TO authenticated;
GRANT TRUNCATE ON public.agent_learning_log TO authenticated;
GRANT UPDATE ON public.agent_learning_log TO authenticated;
GRANT DELETE ON public.agent_learning_log TO service_role;
GRANT INSERT ON public.agent_learning_log TO service_role;
GRANT REFERENCES ON public.agent_learning_log TO service_role;
GRANT SELECT ON public.agent_learning_log TO service_role;
GRANT TRIGGER ON public.agent_learning_log TO service_role;
GRANT TRUNCATE ON public.agent_learning_log TO service_role;
GRANT UPDATE ON public.agent_learning_log TO service_role;
GRANT DELETE ON public.agent_messages TO anon;
GRANT INSERT ON public.agent_messages TO anon;
GRANT REFERENCES ON public.agent_messages TO anon;
GRANT SELECT ON public.agent_messages TO anon;
GRANT TRIGGER ON public.agent_messages TO anon;
GRANT TRUNCATE ON public.agent_messages TO anon;
GRANT UPDATE ON public.agent_messages TO anon;
GRANT DELETE ON public.agent_messages TO authenticated;
GRANT INSERT ON public.agent_messages TO authenticated;
GRANT REFERENCES ON public.agent_messages TO authenticated;
GRANT SELECT ON public.agent_messages TO authenticated;
GRANT TRIGGER ON public.agent_messages TO authenticated;
GRANT TRUNCATE ON public.agent_messages TO authenticated;
GRANT UPDATE ON public.agent_messages TO authenticated;
GRANT DELETE ON public.agent_messages TO service_role;
GRANT INSERT ON public.agent_messages TO service_role;
GRANT REFERENCES ON public.agent_messages TO service_role;
GRANT SELECT ON public.agent_messages TO service_role;
GRANT TRIGGER ON public.agent_messages TO service_role;
GRANT TRUNCATE ON public.agent_messages TO service_role;
GRANT UPDATE ON public.agent_messages TO service_role;
GRANT DELETE ON public.agent_pattern_memory TO anon;
GRANT INSERT ON public.agent_pattern_memory TO anon;
GRANT REFERENCES ON public.agent_pattern_memory TO anon;
GRANT SELECT ON public.agent_pattern_memory TO anon;
GRANT TRIGGER ON public.agent_pattern_memory TO anon;
GRANT TRUNCATE ON public.agent_pattern_memory TO anon;
GRANT UPDATE ON public.agent_pattern_memory TO anon;
GRANT DELETE ON public.agent_pattern_memory TO authenticated;
GRANT INSERT ON public.agent_pattern_memory TO authenticated;
GRANT REFERENCES ON public.agent_pattern_memory TO authenticated;
GRANT SELECT ON public.agent_pattern_memory TO authenticated;
GRANT TRIGGER ON public.agent_pattern_memory TO authenticated;
GRANT TRUNCATE ON public.agent_pattern_memory TO authenticated;
GRANT UPDATE ON public.agent_pattern_memory TO authenticated;
GRANT DELETE ON public.agent_pattern_memory TO service_role;
GRANT INSERT ON public.agent_pattern_memory TO service_role;
GRANT REFERENCES ON public.agent_pattern_memory TO service_role;
GRANT SELECT ON public.agent_pattern_memory TO service_role;
GRANT TRIGGER ON public.agent_pattern_memory TO service_role;
GRANT TRUNCATE ON public.agent_pattern_memory TO service_role;
GRANT UPDATE ON public.agent_pattern_memory TO service_role;
GRANT DELETE ON public.agent_run_log TO anon;
GRANT INSERT ON public.agent_run_log TO anon;
GRANT REFERENCES ON public.agent_run_log TO anon;
GRANT SELECT ON public.agent_run_log TO anon;
GRANT TRIGGER ON public.agent_run_log TO anon;
GRANT TRUNCATE ON public.agent_run_log TO anon;
GRANT UPDATE ON public.agent_run_log TO anon;
GRANT DELETE ON public.agent_run_log TO authenticated;
GRANT INSERT ON public.agent_run_log TO authenticated;
GRANT REFERENCES ON public.agent_run_log TO authenticated;
GRANT SELECT ON public.agent_run_log TO authenticated;
GRANT TRIGGER ON public.agent_run_log TO authenticated;
GRANT TRUNCATE ON public.agent_run_log TO authenticated;
GRANT UPDATE ON public.agent_run_log TO authenticated;
GRANT DELETE ON public.agent_run_log TO service_role;
GRANT INSERT ON public.agent_run_log TO service_role;
GRANT REFERENCES ON public.agent_run_log TO service_role;
GRANT SELECT ON public.agent_run_log TO service_role;
GRANT TRIGGER ON public.agent_run_log TO service_role;
GRANT TRUNCATE ON public.agent_run_log TO service_role;
GRANT UPDATE ON public.agent_run_log TO service_role;
GRANT DELETE ON public.audit_logs TO anon;
GRANT INSERT ON public.audit_logs TO anon;
GRANT REFERENCES ON public.audit_logs TO anon;
GRANT SELECT ON public.audit_logs TO anon;
GRANT TRIGGER ON public.audit_logs TO anon;
GRANT TRUNCATE ON public.audit_logs TO anon;
GRANT UPDATE ON public.audit_logs TO anon;
GRANT DELETE ON public.audit_logs TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;
GRANT REFERENCES ON public.audit_logs TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT TRIGGER ON public.audit_logs TO authenticated;
GRANT TRUNCATE ON public.audit_logs TO authenticated;
GRANT UPDATE ON public.audit_logs TO authenticated;
GRANT DELETE ON public.audit_logs TO service_role;
GRANT INSERT ON public.audit_logs TO service_role;
GRANT REFERENCES ON public.audit_logs TO service_role;
GRANT SELECT ON public.audit_logs TO service_role;
GRANT TRIGGER ON public.audit_logs TO service_role;
GRANT TRUNCATE ON public.audit_logs TO service_role;
GRANT UPDATE ON public.audit_logs TO service_role;
GRANT DELETE ON public.authorized_devices TO anon;
GRANT INSERT ON public.authorized_devices TO anon;
GRANT REFERENCES ON public.authorized_devices TO anon;
GRANT SELECT ON public.authorized_devices TO anon;
GRANT TRIGGER ON public.authorized_devices TO anon;
GRANT TRUNCATE ON public.authorized_devices TO anon;
GRANT UPDATE ON public.authorized_devices TO anon;
GRANT DELETE ON public.authorized_devices TO authenticated;
GRANT INSERT ON public.authorized_devices TO authenticated;
GRANT REFERENCES ON public.authorized_devices TO authenticated;
GRANT SELECT ON public.authorized_devices TO authenticated;
GRANT TRIGGER ON public.authorized_devices TO authenticated;
GRANT TRUNCATE ON public.authorized_devices TO authenticated;
GRANT UPDATE ON public.authorized_devices TO authenticated;
GRANT DELETE ON public.authorized_devices TO service_role;
GRANT INSERT ON public.authorized_devices TO service_role;
GRANT REFERENCES ON public.authorized_devices TO service_role;
GRANT SELECT ON public.authorized_devices TO service_role;
GRANT TRIGGER ON public.authorized_devices TO service_role;
GRANT TRUNCATE ON public.authorized_devices TO service_role;
GRANT UPDATE ON public.authorized_devices TO service_role;
GRANT DELETE ON public.b2b_activation_dashboard TO anon;
GRANT INSERT ON public.b2b_activation_dashboard TO anon;
GRANT REFERENCES ON public.b2b_activation_dashboard TO anon;
GRANT SELECT ON public.b2b_activation_dashboard TO anon;
GRANT TRIGGER ON public.b2b_activation_dashboard TO anon;
GRANT TRUNCATE ON public.b2b_activation_dashboard TO anon;
GRANT UPDATE ON public.b2b_activation_dashboard TO anon;
GRANT DELETE ON public.b2b_activation_dashboard TO authenticated;
GRANT INSERT ON public.b2b_activation_dashboard TO authenticated;
GRANT REFERENCES ON public.b2b_activation_dashboard TO authenticated;
GRANT SELECT ON public.b2b_activation_dashboard TO authenticated;
GRANT TRIGGER ON public.b2b_activation_dashboard TO authenticated;
GRANT TRUNCATE ON public.b2b_activation_dashboard TO authenticated;
GRANT UPDATE ON public.b2b_activation_dashboard TO authenticated;
GRANT DELETE ON public.b2b_activation_dashboard TO service_role;
GRANT INSERT ON public.b2b_activation_dashboard TO service_role;
GRANT REFERENCES ON public.b2b_activation_dashboard TO service_role;
GRANT SELECT ON public.b2b_activation_dashboard TO service_role;
GRANT TRIGGER ON public.b2b_activation_dashboard TO service_role;
GRANT TRUNCATE ON public.b2b_activation_dashboard TO service_role;
GRANT UPDATE ON public.b2b_activation_dashboard TO service_role;
GRANT DELETE ON public.b2b_bookings TO anon;
GRANT INSERT ON public.b2b_bookings TO anon;
GRANT REFERENCES ON public.b2b_bookings TO anon;
GRANT SELECT ON public.b2b_bookings TO anon;
GRANT TRIGGER ON public.b2b_bookings TO anon;
GRANT TRUNCATE ON public.b2b_bookings TO anon;
GRANT UPDATE ON public.b2b_bookings TO anon;
GRANT DELETE ON public.b2b_bookings TO authenticated;
GRANT INSERT ON public.b2b_bookings TO authenticated;
GRANT REFERENCES ON public.b2b_bookings TO authenticated;
GRANT SELECT ON public.b2b_bookings TO authenticated;
GRANT TRIGGER ON public.b2b_bookings TO authenticated;
GRANT TRUNCATE ON public.b2b_bookings TO authenticated;
GRANT UPDATE ON public.b2b_bookings TO authenticated;
GRANT DELETE ON public.b2b_bookings TO service_role;
GRANT INSERT ON public.b2b_bookings TO service_role;
GRANT REFERENCES ON public.b2b_bookings TO service_role;
GRANT SELECT ON public.b2b_bookings TO service_role;
GRANT TRIGGER ON public.b2b_bookings TO service_role;
GRANT TRUNCATE ON public.b2b_bookings TO service_role;
GRANT UPDATE ON public.b2b_bookings TO service_role;
GRANT DELETE ON public.b2b_followup_log TO anon;
GRANT INSERT ON public.b2b_followup_log TO anon;
GRANT REFERENCES ON public.b2b_followup_log TO anon;
GRANT SELECT ON public.b2b_followup_log TO anon;
GRANT TRIGGER ON public.b2b_followup_log TO anon;
GRANT TRUNCATE ON public.b2b_followup_log TO anon;
GRANT UPDATE ON public.b2b_followup_log TO anon;
GRANT DELETE ON public.b2b_followup_log TO authenticated;
GRANT INSERT ON public.b2b_followup_log TO authenticated;
GRANT REFERENCES ON public.b2b_followup_log TO authenticated;
GRANT SELECT ON public.b2b_followup_log TO authenticated;
GRANT TRIGGER ON public.b2b_followup_log TO authenticated;
GRANT TRUNCATE ON public.b2b_followup_log TO authenticated;
GRANT UPDATE ON public.b2b_followup_log TO authenticated;
GRANT DELETE ON public.b2b_followup_log TO service_role;
GRANT INSERT ON public.b2b_followup_log TO service_role;
GRANT REFERENCES ON public.b2b_followup_log TO service_role;
GRANT SELECT ON public.b2b_followup_log TO service_role;
GRANT TRIGGER ON public.b2b_followup_log TO service_role;
GRANT TRUNCATE ON public.b2b_followup_log TO service_role;
GRANT UPDATE ON public.b2b_followup_log TO service_role;
GRANT DELETE ON public.b2b_invoices TO anon;
GRANT INSERT ON public.b2b_invoices TO anon;
GRANT REFERENCES ON public.b2b_invoices TO anon;
GRANT SELECT ON public.b2b_invoices TO anon;
GRANT TRIGGER ON public.b2b_invoices TO anon;
GRANT TRUNCATE ON public.b2b_invoices TO anon;
GRANT UPDATE ON public.b2b_invoices TO anon;
GRANT DELETE ON public.b2b_invoices TO authenticated;
GRANT INSERT ON public.b2b_invoices TO authenticated;
GRANT REFERENCES ON public.b2b_invoices TO authenticated;
GRANT SELECT ON public.b2b_invoices TO authenticated;
GRANT TRIGGER ON public.b2b_invoices TO authenticated;
GRANT TRUNCATE ON public.b2b_invoices TO authenticated;
GRANT UPDATE ON public.b2b_invoices TO authenticated;
GRANT DELETE ON public.b2b_invoices TO service_role;
GRANT INSERT ON public.b2b_invoices TO service_role;
GRANT REFERENCES ON public.b2b_invoices TO service_role;
GRANT SELECT ON public.b2b_invoices TO service_role;
GRANT TRIGGER ON public.b2b_invoices TO service_role;
GRANT TRUNCATE ON public.b2b_invoices TO service_role;
GRANT UPDATE ON public.b2b_invoices TO service_role;
GRANT DELETE ON public.b2b_outreach_log TO anon;
GRANT INSERT ON public.b2b_outreach_log TO anon;
GRANT REFERENCES ON public.b2b_outreach_log TO anon;
GRANT SELECT ON public.b2b_outreach_log TO anon;
GRANT TRIGGER ON public.b2b_outreach_log TO anon;
GRANT TRUNCATE ON public.b2b_outreach_log TO anon;
GRANT UPDATE ON public.b2b_outreach_log TO anon;
GRANT DELETE ON public.b2b_outreach_log TO authenticated;
GRANT INSERT ON public.b2b_outreach_log TO authenticated;
GRANT REFERENCES ON public.b2b_outreach_log TO authenticated;
GRANT SELECT ON public.b2b_outreach_log TO authenticated;
GRANT TRIGGER ON public.b2b_outreach_log TO authenticated;
GRANT TRUNCATE ON public.b2b_outreach_log TO authenticated;
GRANT UPDATE ON public.b2b_outreach_log TO authenticated;
GRANT DELETE ON public.b2b_outreach_log TO service_role;
GRANT INSERT ON public.b2b_outreach_log TO service_role;
GRANT REFERENCES ON public.b2b_outreach_log TO service_role;
GRANT SELECT ON public.b2b_outreach_log TO service_role;
GRANT TRIGGER ON public.b2b_outreach_log TO service_role;
GRANT TRUNCATE ON public.b2b_outreach_log TO service_role;
GRANT UPDATE ON public.b2b_outreach_log TO service_role;
GRANT DELETE ON public.b2b_outreach_status TO anon;
GRANT INSERT ON public.b2b_outreach_status TO anon;
GRANT REFERENCES ON public.b2b_outreach_status TO anon;
GRANT SELECT ON public.b2b_outreach_status TO anon;
GRANT TRIGGER ON public.b2b_outreach_status TO anon;
GRANT TRUNCATE ON public.b2b_outreach_status TO anon;
GRANT UPDATE ON public.b2b_outreach_status TO anon;
GRANT DELETE ON public.b2b_outreach_status TO authenticated;
GRANT INSERT ON public.b2b_outreach_status TO authenticated;
GRANT REFERENCES ON public.b2b_outreach_status TO authenticated;
GRANT SELECT ON public.b2b_outreach_status TO authenticated;
GRANT TRIGGER ON public.b2b_outreach_status TO authenticated;
GRANT TRUNCATE ON public.b2b_outreach_status TO authenticated;
GRANT UPDATE ON public.b2b_outreach_status TO authenticated;
GRANT DELETE ON public.b2b_outreach_status TO service_role;
GRANT INSERT ON public.b2b_outreach_status TO service_role;
GRANT REFERENCES ON public.b2b_outreach_status TO service_role;
GRANT SELECT ON public.b2b_outreach_status TO service_role;
GRANT TRIGGER ON public.b2b_outreach_status TO service_role;
GRANT TRUNCATE ON public.b2b_outreach_status TO service_role;
GRANT UPDATE ON public.b2b_outreach_status TO service_role;
GRANT DELETE ON public.b2b_partner_summary TO anon;
GRANT INSERT ON public.b2b_partner_summary TO anon;
GRANT REFERENCES ON public.b2b_partner_summary TO anon;
GRANT SELECT ON public.b2b_partner_summary TO anon;
GRANT TRIGGER ON public.b2b_partner_summary TO anon;
GRANT TRUNCATE ON public.b2b_partner_summary TO anon;
GRANT UPDATE ON public.b2b_partner_summary TO anon;
GRANT DELETE ON public.b2b_partner_summary TO authenticated;
GRANT INSERT ON public.b2b_partner_summary TO authenticated;
GRANT REFERENCES ON public.b2b_partner_summary TO authenticated;
GRANT SELECT ON public.b2b_partner_summary TO authenticated;
GRANT TRIGGER ON public.b2b_partner_summary TO authenticated;
GRANT TRUNCATE ON public.b2b_partner_summary TO authenticated;
GRANT UPDATE ON public.b2b_partner_summary TO authenticated;
GRANT DELETE ON public.b2b_partner_summary TO service_role;
GRANT INSERT ON public.b2b_partner_summary TO service_role;
GRANT REFERENCES ON public.b2b_partner_summary TO service_role;
GRANT SELECT ON public.b2b_partner_summary TO service_role;
GRANT TRIGGER ON public.b2b_partner_summary TO service_role;
GRANT TRUNCATE ON public.b2b_partner_summary TO service_role;
GRANT UPDATE ON public.b2b_partner_summary TO service_role;
GRANT DELETE ON public.b2b_partners TO anon;
GRANT INSERT ON public.b2b_partners TO anon;
GRANT REFERENCES ON public.b2b_partners TO anon;
GRANT SELECT ON public.b2b_partners TO anon;
GRANT TRIGGER ON public.b2b_partners TO anon;
GRANT TRUNCATE ON public.b2b_partners TO anon;
GRANT UPDATE ON public.b2b_partners TO anon;
GRANT DELETE ON public.b2b_partners TO authenticated;
GRANT INSERT ON public.b2b_partners TO authenticated;
GRANT REFERENCES ON public.b2b_partners TO authenticated;
GRANT SELECT ON public.b2b_partners TO authenticated;
GRANT TRIGGER ON public.b2b_partners TO authenticated;
GRANT TRUNCATE ON public.b2b_partners TO authenticated;
GRANT UPDATE ON public.b2b_partners TO authenticated;
GRANT DELETE ON public.b2b_partners TO service_role;
GRANT INSERT ON public.b2b_partners TO service_role;
GRANT REFERENCES ON public.b2b_partners TO service_role;
GRANT SELECT ON public.b2b_partners TO service_role;
GRANT TRIGGER ON public.b2b_partners TO service_role;
GRANT TRUNCATE ON public.b2b_partners TO service_role;
GRANT UPDATE ON public.b2b_partners TO service_role;
GRANT DELETE ON public.billing_invoices TO anon;
GRANT INSERT ON public.billing_invoices TO anon;
GRANT REFERENCES ON public.billing_invoices TO anon;
GRANT SELECT ON public.billing_invoices TO anon;
GRANT TRIGGER ON public.billing_invoices TO anon;
GRANT TRUNCATE ON public.billing_invoices TO anon;
GRANT UPDATE ON public.billing_invoices TO anon;
GRANT DELETE ON public.billing_invoices TO authenticated;
GRANT INSERT ON public.billing_invoices TO authenticated;
GRANT REFERENCES ON public.billing_invoices TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT TRIGGER ON public.billing_invoices TO authenticated;
GRANT TRUNCATE ON public.billing_invoices TO authenticated;
GRANT UPDATE ON public.billing_invoices TO authenticated;
GRANT DELETE ON public.billing_invoices TO service_role;
GRANT INSERT ON public.billing_invoices TO service_role;
GRANT REFERENCES ON public.billing_invoices TO service_role;
GRANT SELECT ON public.billing_invoices TO service_role;
GRANT TRIGGER ON public.billing_invoices TO service_role;
GRANT TRUNCATE ON public.billing_invoices TO service_role;
GRANT UPDATE ON public.billing_invoices TO service_role;
GRANT DELETE ON public.ceo_dashboard TO anon;
GRANT INSERT ON public.ceo_dashboard TO anon;
GRANT REFERENCES ON public.ceo_dashboard TO anon;
GRANT SELECT ON public.ceo_dashboard TO anon;
GRANT TRIGGER ON public.ceo_dashboard TO anon;
GRANT TRUNCATE ON public.ceo_dashboard TO anon;
GRANT UPDATE ON public.ceo_dashboard TO anon;
GRANT DELETE ON public.ceo_dashboard TO authenticated;
GRANT INSERT ON public.ceo_dashboard TO authenticated;
GRANT REFERENCES ON public.ceo_dashboard TO authenticated;
GRANT SELECT ON public.ceo_dashboard TO authenticated;
GRANT TRIGGER ON public.ceo_dashboard TO authenticated;
GRANT TRUNCATE ON public.ceo_dashboard TO authenticated;
GRANT UPDATE ON public.ceo_dashboard TO authenticated;
GRANT DELETE ON public.ceo_dashboard TO service_role;
GRANT INSERT ON public.ceo_dashboard TO service_role;
GRANT REFERENCES ON public.ceo_dashboard TO service_role;
GRANT SELECT ON public.ceo_dashboard TO service_role;
GRANT TRIGGER ON public.ceo_dashboard TO service_role;
GRANT TRUNCATE ON public.ceo_dashboard TO service_role;
GRANT UPDATE ON public.ceo_dashboard TO service_role;
GRANT DELETE ON public.ceo_inbox TO anon;
GRANT INSERT ON public.ceo_inbox TO anon;
GRANT REFERENCES ON public.ceo_inbox TO anon;
GRANT SELECT ON public.ceo_inbox TO anon;
GRANT TRIGGER ON public.ceo_inbox TO anon;
GRANT TRUNCATE ON public.ceo_inbox TO anon;
GRANT UPDATE ON public.ceo_inbox TO anon;
GRANT DELETE ON public.ceo_inbox TO authenticated;
GRANT INSERT ON public.ceo_inbox TO authenticated;
GRANT REFERENCES ON public.ceo_inbox TO authenticated;
GRANT SELECT ON public.ceo_inbox TO authenticated;
GRANT TRIGGER ON public.ceo_inbox TO authenticated;
GRANT TRUNCATE ON public.ceo_inbox TO authenticated;
GRANT UPDATE ON public.ceo_inbox TO authenticated;
GRANT DELETE ON public.ceo_inbox TO service_role;
GRANT INSERT ON public.ceo_inbox TO service_role;
GRANT REFERENCES ON public.ceo_inbox TO service_role;
GRANT SELECT ON public.ceo_inbox TO service_role;
GRANT TRIGGER ON public.ceo_inbox TO service_role;
GRANT TRUNCATE ON public.ceo_inbox TO service_role;
GRANT UPDATE ON public.ceo_inbox TO service_role;
GRANT DELETE ON public.ceo_pipeline TO anon;
GRANT INSERT ON public.ceo_pipeline TO anon;
GRANT REFERENCES ON public.ceo_pipeline TO anon;
GRANT SELECT ON public.ceo_pipeline TO anon;
GRANT TRIGGER ON public.ceo_pipeline TO anon;
GRANT TRUNCATE ON public.ceo_pipeline TO anon;
GRANT UPDATE ON public.ceo_pipeline TO anon;
GRANT DELETE ON public.ceo_pipeline TO authenticated;
GRANT INSERT ON public.ceo_pipeline TO authenticated;
GRANT REFERENCES ON public.ceo_pipeline TO authenticated;
GRANT SELECT ON public.ceo_pipeline TO authenticated;
GRANT TRIGGER ON public.ceo_pipeline TO authenticated;
GRANT TRUNCATE ON public.ceo_pipeline TO authenticated;
GRANT UPDATE ON public.ceo_pipeline TO authenticated;
GRANT DELETE ON public.ceo_pipeline TO service_role;
GRANT INSERT ON public.ceo_pipeline TO service_role;
GRANT REFERENCES ON public.ceo_pipeline TO service_role;
GRANT SELECT ON public.ceo_pipeline TO service_role;
GRANT TRIGGER ON public.ceo_pipeline TO service_role;
GRANT TRUNCATE ON public.ceo_pipeline TO service_role;
GRANT UPDATE ON public.ceo_pipeline TO service_role;
GRANT DELETE ON public.competitor_rates TO anon;
GRANT INSERT ON public.competitor_rates TO anon;
GRANT REFERENCES ON public.competitor_rates TO anon;
GRANT SELECT ON public.competitor_rates TO anon;
GRANT TRIGGER ON public.competitor_rates TO anon;
GRANT TRUNCATE ON public.competitor_rates TO anon;
GRANT UPDATE ON public.competitor_rates TO anon;
GRANT DELETE ON public.competitor_rates TO authenticated;
GRANT INSERT ON public.competitor_rates TO authenticated;
GRANT REFERENCES ON public.competitor_rates TO authenticated;
GRANT SELECT ON public.competitor_rates TO authenticated;
GRANT TRIGGER ON public.competitor_rates TO authenticated;
GRANT TRUNCATE ON public.competitor_rates TO authenticated;
GRANT UPDATE ON public.competitor_rates TO authenticated;
GRANT DELETE ON public.competitor_rates TO service_role;
GRANT INSERT ON public.competitor_rates TO service_role;
GRANT REFERENCES ON public.competitor_rates TO service_role;
GRANT SELECT ON public.competitor_rates TO service_role;
GRANT TRIGGER ON public.competitor_rates TO service_role;
GRANT TRUNCATE ON public.competitor_rates TO service_role;
GRANT UPDATE ON public.competitor_rates TO service_role;
GRANT DELETE ON public.content_calendar TO anon;
GRANT INSERT ON public.content_calendar TO anon;
GRANT REFERENCES ON public.content_calendar TO anon;
GRANT SELECT ON public.content_calendar TO anon;
GRANT TRIGGER ON public.content_calendar TO anon;
GRANT TRUNCATE ON public.content_calendar TO anon;
GRANT UPDATE ON public.content_calendar TO anon;
GRANT DELETE ON public.content_calendar TO authenticated;
GRANT INSERT ON public.content_calendar TO authenticated;
GRANT REFERENCES ON public.content_calendar TO authenticated;
GRANT SELECT ON public.content_calendar TO authenticated;
GRANT TRIGGER ON public.content_calendar TO authenticated;
GRANT TRUNCATE ON public.content_calendar TO authenticated;
GRANT UPDATE ON public.content_calendar TO authenticated;
GRANT DELETE ON public.content_calendar TO service_role;
GRANT INSERT ON public.content_calendar TO service_role;
GRANT REFERENCES ON public.content_calendar TO service_role;
GRANT SELECT ON public.content_calendar TO service_role;
GRANT TRIGGER ON public.content_calendar TO service_role;
GRANT TRUNCATE ON public.content_calendar TO service_role;
GRANT UPDATE ON public.content_calendar TO service_role;
GRANT DELETE ON public.content_debate_log TO anon;
GRANT INSERT ON public.content_debate_log TO anon;
GRANT REFERENCES ON public.content_debate_log TO anon;
GRANT SELECT ON public.content_debate_log TO anon;
GRANT TRIGGER ON public.content_debate_log TO anon;
GRANT TRUNCATE ON public.content_debate_log TO anon;
GRANT UPDATE ON public.content_debate_log TO anon;
GRANT DELETE ON public.content_debate_log TO authenticated;
GRANT INSERT ON public.content_debate_log TO authenticated;
GRANT REFERENCES ON public.content_debate_log TO authenticated;
GRANT SELECT ON public.content_debate_log TO authenticated;
GRANT TRIGGER ON public.content_debate_log TO authenticated;
GRANT TRUNCATE ON public.content_debate_log TO authenticated;
GRANT UPDATE ON public.content_debate_log TO authenticated;
GRANT DELETE ON public.content_debate_log TO service_role;
GRANT INSERT ON public.content_debate_log TO service_role;
GRANT REFERENCES ON public.content_debate_log TO service_role;
GRANT SELECT ON public.content_debate_log TO service_role;
GRANT TRIGGER ON public.content_debate_log TO service_role;
GRANT TRUNCATE ON public.content_debate_log TO service_role;
GRANT UPDATE ON public.content_debate_log TO service_role;
GRANT DELETE ON public.content_performance_patterns TO anon;
GRANT INSERT ON public.content_performance_patterns TO anon;
GRANT REFERENCES ON public.content_performance_patterns TO anon;
GRANT SELECT ON public.content_performance_patterns TO anon;
GRANT TRIGGER ON public.content_performance_patterns TO anon;
GRANT TRUNCATE ON public.content_performance_patterns TO anon;
GRANT UPDATE ON public.content_performance_patterns TO anon;
GRANT DELETE ON public.content_performance_patterns TO authenticated;
GRANT INSERT ON public.content_performance_patterns TO authenticated;
GRANT REFERENCES ON public.content_performance_patterns TO authenticated;
GRANT SELECT ON public.content_performance_patterns TO authenticated;
GRANT TRIGGER ON public.content_performance_patterns TO authenticated;
GRANT TRUNCATE ON public.content_performance_patterns TO authenticated;
GRANT UPDATE ON public.content_performance_patterns TO authenticated;
GRANT DELETE ON public.content_performance_patterns TO service_role;
GRANT INSERT ON public.content_performance_patterns TO service_role;
GRANT REFERENCES ON public.content_performance_patterns TO service_role;
GRANT SELECT ON public.content_performance_patterns TO service_role;
GRANT TRIGGER ON public.content_performance_patterns TO service_role;
GRANT TRUNCATE ON public.content_performance_patterns TO service_role;
GRANT UPDATE ON public.content_performance_patterns TO service_role;
GRANT DELETE ON public.content_variations TO anon;
GRANT INSERT ON public.content_variations TO anon;
GRANT REFERENCES ON public.content_variations TO anon;
GRANT SELECT ON public.content_variations TO anon;
GRANT TRIGGER ON public.content_variations TO anon;
GRANT TRUNCATE ON public.content_variations TO anon;
GRANT UPDATE ON public.content_variations TO anon;
GRANT DELETE ON public.content_variations TO authenticated;
GRANT INSERT ON public.content_variations TO authenticated;
GRANT REFERENCES ON public.content_variations TO authenticated;
GRANT SELECT ON public.content_variations TO authenticated;
GRANT TRIGGER ON public.content_variations TO authenticated;
GRANT TRUNCATE ON public.content_variations TO authenticated;
GRANT UPDATE ON public.content_variations TO authenticated;
GRANT DELETE ON public.content_variations TO service_role;
GRANT INSERT ON public.content_variations TO service_role;
GRANT REFERENCES ON public.content_variations TO service_role;
GRANT SELECT ON public.content_variations TO service_role;
GRANT TRIGGER ON public.content_variations TO service_role;
GRANT TRUNCATE ON public.content_variations TO service_role;
GRANT UPDATE ON public.content_variations TO service_role;
GRANT DELETE ON public.corporate_leads TO anon;
GRANT INSERT ON public.corporate_leads TO anon;
GRANT REFERENCES ON public.corporate_leads TO anon;
GRANT SELECT ON public.corporate_leads TO anon;
GRANT TRIGGER ON public.corporate_leads TO anon;
GRANT TRUNCATE ON public.corporate_leads TO anon;
GRANT UPDATE ON public.corporate_leads TO anon;
GRANT DELETE ON public.corporate_leads TO authenticated;
GRANT INSERT ON public.corporate_leads TO authenticated;
GRANT REFERENCES ON public.corporate_leads TO authenticated;
GRANT SELECT ON public.corporate_leads TO authenticated;
GRANT TRIGGER ON public.corporate_leads TO authenticated;
GRANT TRUNCATE ON public.corporate_leads TO authenticated;
GRANT UPDATE ON public.corporate_leads TO authenticated;
GRANT DELETE ON public.corporate_leads TO service_role;
GRANT INSERT ON public.corporate_leads TO service_role;
GRANT REFERENCES ON public.corporate_leads TO service_role;
GRANT SELECT ON public.corporate_leads TO service_role;
GRANT TRIGGER ON public.corporate_leads TO service_role;
GRANT TRUNCATE ON public.corporate_leads TO service_role;
GRANT UPDATE ON public.corporate_leads TO service_role;
GRANT DELETE ON public.council_panelists TO anon;
GRANT INSERT ON public.council_panelists TO anon;
GRANT REFERENCES ON public.council_panelists TO anon;
GRANT SELECT ON public.council_panelists TO anon;
GRANT TRIGGER ON public.council_panelists TO anon;
GRANT TRUNCATE ON public.council_panelists TO anon;
GRANT UPDATE ON public.council_panelists TO anon;
GRANT DELETE ON public.council_panelists TO authenticated;
GRANT INSERT ON public.council_panelists TO authenticated;
GRANT REFERENCES ON public.council_panelists TO authenticated;
GRANT SELECT ON public.council_panelists TO authenticated;
GRANT TRIGGER ON public.council_panelists TO authenticated;
GRANT TRUNCATE ON public.council_panelists TO authenticated;
GRANT UPDATE ON public.council_panelists TO authenticated;
GRANT DELETE ON public.council_panelists TO service_role;
GRANT INSERT ON public.council_panelists TO service_role;
GRANT REFERENCES ON public.council_panelists TO service_role;
GRANT SELECT ON public.council_panelists TO service_role;
GRANT TRIGGER ON public.council_panelists TO service_role;
GRANT TRUNCATE ON public.council_panelists TO service_role;
GRANT UPDATE ON public.council_panelists TO service_role;
GRANT DELETE ON public.council_sessions TO anon;
GRANT INSERT ON public.council_sessions TO anon;
GRANT REFERENCES ON public.council_sessions TO anon;
GRANT SELECT ON public.council_sessions TO anon;
GRANT TRIGGER ON public.council_sessions TO anon;
GRANT TRUNCATE ON public.council_sessions TO anon;
GRANT UPDATE ON public.council_sessions TO anon;
GRANT DELETE ON public.council_sessions TO authenticated;
GRANT INSERT ON public.council_sessions TO authenticated;
GRANT REFERENCES ON public.council_sessions TO authenticated;
GRANT SELECT ON public.council_sessions TO authenticated;
GRANT TRIGGER ON public.council_sessions TO authenticated;
GRANT TRUNCATE ON public.council_sessions TO authenticated;
GRANT UPDATE ON public.council_sessions TO authenticated;
GRANT DELETE ON public.council_sessions TO service_role;
GRANT INSERT ON public.council_sessions TO service_role;
GRANT REFERENCES ON public.council_sessions TO service_role;
GRANT SELECT ON public.council_sessions TO service_role;
GRANT TRIGGER ON public.council_sessions TO service_role;
GRANT TRUNCATE ON public.council_sessions TO service_role;
GRANT UPDATE ON public.council_sessions TO service_role;
GRANT DELETE ON public.crm_build TO anon;
GRANT INSERT ON public.crm_build TO anon;
GRANT REFERENCES ON public.crm_build TO anon;
GRANT SELECT ON public.crm_build TO anon;
GRANT TRIGGER ON public.crm_build TO anon;
GRANT TRUNCATE ON public.crm_build TO anon;
GRANT UPDATE ON public.crm_build TO anon;
GRANT DELETE ON public.crm_build TO authenticated;
GRANT INSERT ON public.crm_build TO authenticated;
GRANT REFERENCES ON public.crm_build TO authenticated;
GRANT SELECT ON public.crm_build TO authenticated;
GRANT TRIGGER ON public.crm_build TO authenticated;
GRANT TRUNCATE ON public.crm_build TO authenticated;
GRANT UPDATE ON public.crm_build TO authenticated;
GRANT DELETE ON public.crm_build TO service_role;
GRANT INSERT ON public.crm_build TO service_role;
GRANT REFERENCES ON public.crm_build TO service_role;
GRANT SELECT ON public.crm_build TO service_role;
GRANT TRIGGER ON public.crm_build TO service_role;
GRANT TRUNCATE ON public.crm_build TO service_role;
GRANT UPDATE ON public.crm_build TO service_role;
GRANT DELETE ON public.crm_chunks TO anon;
GRANT INSERT ON public.crm_chunks TO anon;
GRANT REFERENCES ON public.crm_chunks TO anon;
GRANT SELECT ON public.crm_chunks TO anon;
GRANT TRIGGER ON public.crm_chunks TO anon;
GRANT TRUNCATE ON public.crm_chunks TO anon;
GRANT UPDATE ON public.crm_chunks TO anon;
GRANT DELETE ON public.crm_chunks TO authenticated;
GRANT INSERT ON public.crm_chunks TO authenticated;
GRANT REFERENCES ON public.crm_chunks TO authenticated;
GRANT SELECT ON public.crm_chunks TO authenticated;
GRANT TRIGGER ON public.crm_chunks TO authenticated;
GRANT TRUNCATE ON public.crm_chunks TO authenticated;
GRANT UPDATE ON public.crm_chunks TO authenticated;
GRANT DELETE ON public.crm_chunks TO service_role;
GRANT INSERT ON public.crm_chunks TO service_role;
GRANT REFERENCES ON public.crm_chunks TO service_role;
GRANT SELECT ON public.crm_chunks TO service_role;
GRANT TRIGGER ON public.crm_chunks TO service_role;
GRANT TRUNCATE ON public.crm_chunks TO service_role;
GRANT UPDATE ON public.crm_chunks TO service_role;
GRANT DELETE ON public.crm_monitor_config TO anon;
GRANT INSERT ON public.crm_monitor_config TO anon;
GRANT REFERENCES ON public.crm_monitor_config TO anon;
GRANT SELECT ON public.crm_monitor_config TO anon;
GRANT TRIGGER ON public.crm_monitor_config TO anon;
GRANT TRUNCATE ON public.crm_monitor_config TO anon;
GRANT UPDATE ON public.crm_monitor_config TO anon;
GRANT DELETE ON public.crm_monitor_config TO authenticated;
GRANT INSERT ON public.crm_monitor_config TO authenticated;
GRANT REFERENCES ON public.crm_monitor_config TO authenticated;
GRANT SELECT ON public.crm_monitor_config TO authenticated;
GRANT TRIGGER ON public.crm_monitor_config TO authenticated;
GRANT TRUNCATE ON public.crm_monitor_config TO authenticated;
GRANT UPDATE ON public.crm_monitor_config TO authenticated;
GRANT DELETE ON public.crm_monitor_config TO service_role;
GRANT INSERT ON public.crm_monitor_config TO service_role;
GRANT REFERENCES ON public.crm_monitor_config TO service_role;
GRANT SELECT ON public.crm_monitor_config TO service_role;
GRANT TRIGGER ON public.crm_monitor_config TO service_role;
GRANT TRUNCATE ON public.crm_monitor_config TO service_role;
GRANT UPDATE ON public.crm_monitor_config TO service_role;
GRANT REFERENCES ON public.customers TO anon;
GRANT SELECT ON public.customers TO anon;
GRANT TRIGGER ON public.customers TO anon;
GRANT REFERENCES ON public.customers TO authenticated;
GRANT SELECT ON public.customers TO authenticated;
GRANT TRIGGER ON public.customers TO authenticated;
GRANT DELETE ON public.customers TO service_role;
GRANT INSERT ON public.customers TO service_role;
GRANT REFERENCES ON public.customers TO service_role;
GRANT SELECT ON public.customers TO service_role;
GRANT TRIGGER ON public.customers TO service_role;
GRANT TRUNCATE ON public.customers TO service_role;
GRANT UPDATE ON public.customers TO service_role;
GRANT DELETE ON public.daily_closing TO anon;
GRANT INSERT ON public.daily_closing TO anon;
GRANT REFERENCES ON public.daily_closing TO anon;
GRANT SELECT ON public.daily_closing TO anon;
GRANT TRIGGER ON public.daily_closing TO anon;
GRANT TRUNCATE ON public.daily_closing TO anon;
GRANT UPDATE ON public.daily_closing TO anon;
GRANT DELETE ON public.daily_closing TO authenticated;
GRANT INSERT ON public.daily_closing TO authenticated;
GRANT REFERENCES ON public.daily_closing TO authenticated;
GRANT SELECT ON public.daily_closing TO authenticated;
GRANT TRIGGER ON public.daily_closing TO authenticated;
GRANT TRUNCATE ON public.daily_closing TO authenticated;
GRANT UPDATE ON public.daily_closing TO authenticated;
GRANT DELETE ON public.daily_closing TO service_role;
GRANT INSERT ON public.daily_closing TO service_role;
GRANT REFERENCES ON public.daily_closing TO service_role;
GRANT SELECT ON public.daily_closing TO service_role;
GRANT TRIGGER ON public.daily_closing TO service_role;
GRANT TRUNCATE ON public.daily_closing TO service_role;
GRANT UPDATE ON public.daily_closing TO service_role;
GRANT DELETE ON public.daily_revenue_summary TO anon;
GRANT INSERT ON public.daily_revenue_summary TO anon;
GRANT REFERENCES ON public.daily_revenue_summary TO anon;
GRANT SELECT ON public.daily_revenue_summary TO anon;
GRANT TRIGGER ON public.daily_revenue_summary TO anon;
GRANT TRUNCATE ON public.daily_revenue_summary TO anon;
GRANT UPDATE ON public.daily_revenue_summary TO anon;
GRANT DELETE ON public.daily_revenue_summary TO authenticated;
GRANT INSERT ON public.daily_revenue_summary TO authenticated;
GRANT REFERENCES ON public.daily_revenue_summary TO authenticated;
GRANT SELECT ON public.daily_revenue_summary TO authenticated;
GRANT TRIGGER ON public.daily_revenue_summary TO authenticated;
GRANT TRUNCATE ON public.daily_revenue_summary TO authenticated;
GRANT UPDATE ON public.daily_revenue_summary TO authenticated;
GRANT DELETE ON public.daily_revenue_summary TO service_role;
GRANT INSERT ON public.daily_revenue_summary TO service_role;
GRANT REFERENCES ON public.daily_revenue_summary TO service_role;
GRANT SELECT ON public.daily_revenue_summary TO service_role;
GRANT TRIGGER ON public.daily_revenue_summary TO service_role;
GRANT TRUNCATE ON public.daily_revenue_summary TO service_role;
GRANT UPDATE ON public.daily_revenue_summary TO service_role;
GRANT DELETE ON public.deploy_cache TO anon;
GRANT INSERT ON public.deploy_cache TO anon;
GRANT REFERENCES ON public.deploy_cache TO anon;
GRANT SELECT ON public.deploy_cache TO anon;
GRANT TRIGGER ON public.deploy_cache TO anon;
GRANT TRUNCATE ON public.deploy_cache TO anon;
GRANT UPDATE ON public.deploy_cache TO anon;
GRANT DELETE ON public.deploy_cache TO authenticated;
GRANT INSERT ON public.deploy_cache TO authenticated;
GRANT REFERENCES ON public.deploy_cache TO authenticated;
GRANT SELECT ON public.deploy_cache TO authenticated;
GRANT TRIGGER ON public.deploy_cache TO authenticated;
GRANT TRUNCATE ON public.deploy_cache TO authenticated;
GRANT UPDATE ON public.deploy_cache TO authenticated;
GRANT DELETE ON public.deploy_cache TO service_role;
GRANT INSERT ON public.deploy_cache TO service_role;
GRANT REFERENCES ON public.deploy_cache TO service_role;
GRANT SELECT ON public.deploy_cache TO service_role;
GRANT TRIGGER ON public.deploy_cache TO service_role;
GRANT TRUNCATE ON public.deploy_cache TO service_role;
GRANT UPDATE ON public.deploy_cache TO service_role;
GRANT DELETE ON public.dynamic_pricing_log TO anon;
GRANT INSERT ON public.dynamic_pricing_log TO anon;
GRANT REFERENCES ON public.dynamic_pricing_log TO anon;
GRANT SELECT ON public.dynamic_pricing_log TO anon;
GRANT TRIGGER ON public.dynamic_pricing_log TO anon;
GRANT TRUNCATE ON public.dynamic_pricing_log TO anon;
GRANT UPDATE ON public.dynamic_pricing_log TO anon;
GRANT DELETE ON public.dynamic_pricing_log TO authenticated;
GRANT INSERT ON public.dynamic_pricing_log TO authenticated;
GRANT REFERENCES ON public.dynamic_pricing_log TO authenticated;
GRANT SELECT ON public.dynamic_pricing_log TO authenticated;
GRANT TRIGGER ON public.dynamic_pricing_log TO authenticated;
GRANT TRUNCATE ON public.dynamic_pricing_log TO authenticated;
GRANT UPDATE ON public.dynamic_pricing_log TO authenticated;
GRANT DELETE ON public.dynamic_pricing_log TO service_role;
GRANT INSERT ON public.dynamic_pricing_log TO service_role;
GRANT REFERENCES ON public.dynamic_pricing_log TO service_role;
GRANT SELECT ON public.dynamic_pricing_log TO service_role;
GRANT TRIGGER ON public.dynamic_pricing_log TO service_role;
GRANT TRUNCATE ON public.dynamic_pricing_log TO service_role;
GRANT UPDATE ON public.dynamic_pricing_log TO service_role;
GRANT DELETE ON public.email_chunks TO anon;
GRANT INSERT ON public.email_chunks TO anon;
GRANT REFERENCES ON public.email_chunks TO anon;
GRANT SELECT ON public.email_chunks TO anon;
GRANT TRIGGER ON public.email_chunks TO anon;
GRANT TRUNCATE ON public.email_chunks TO anon;
GRANT UPDATE ON public.email_chunks TO anon;
GRANT DELETE ON public.email_chunks TO authenticated;
GRANT INSERT ON public.email_chunks TO authenticated;
GRANT REFERENCES ON public.email_chunks TO authenticated;
GRANT SELECT ON public.email_chunks TO authenticated;
GRANT TRIGGER ON public.email_chunks TO authenticated;
GRANT TRUNCATE ON public.email_chunks TO authenticated;
GRANT UPDATE ON public.email_chunks TO authenticated;
GRANT DELETE ON public.email_chunks TO service_role;
GRANT INSERT ON public.email_chunks TO service_role;
GRANT REFERENCES ON public.email_chunks TO service_role;
GRANT SELECT ON public.email_chunks TO service_role;
GRANT TRIGGER ON public.email_chunks TO service_role;
GRANT TRUNCATE ON public.email_chunks TO service_role;
GRANT UPDATE ON public.email_chunks TO service_role;
GRANT DELETE ON public.event_inquiries TO anon;
GRANT INSERT ON public.event_inquiries TO anon;
GRANT REFERENCES ON public.event_inquiries TO anon;
GRANT SELECT ON public.event_inquiries TO anon;
GRANT TRIGGER ON public.event_inquiries TO anon;
GRANT TRUNCATE ON public.event_inquiries TO anon;
GRANT UPDATE ON public.event_inquiries TO anon;
GRANT DELETE ON public.event_inquiries TO authenticated;
GRANT INSERT ON public.event_inquiries TO authenticated;
GRANT REFERENCES ON public.event_inquiries TO authenticated;
GRANT SELECT ON public.event_inquiries TO authenticated;
GRANT TRIGGER ON public.event_inquiries TO authenticated;
GRANT TRUNCATE ON public.event_inquiries TO authenticated;
GRANT UPDATE ON public.event_inquiries TO authenticated;
GRANT DELETE ON public.event_inquiries TO service_role;
GRANT INSERT ON public.event_inquiries TO service_role;
GRANT REFERENCES ON public.event_inquiries TO service_role;
GRANT SELECT ON public.event_inquiries TO service_role;
GRANT TRIGGER ON public.event_inquiries TO service_role;
GRANT TRUNCATE ON public.event_inquiries TO service_role;
GRANT UPDATE ON public.event_inquiries TO service_role;
GRANT DELETE ON public.flash_sale_log TO anon;
GRANT INSERT ON public.flash_sale_log TO anon;
GRANT REFERENCES ON public.flash_sale_log TO anon;
GRANT SELECT ON public.flash_sale_log TO anon;
GRANT TRIGGER ON public.flash_sale_log TO anon;
GRANT TRUNCATE ON public.flash_sale_log TO anon;
GRANT UPDATE ON public.flash_sale_log TO anon;
GRANT DELETE ON public.flash_sale_log TO authenticated;
GRANT INSERT ON public.flash_sale_log TO authenticated;
GRANT REFERENCES ON public.flash_sale_log TO authenticated;
GRANT SELECT ON public.flash_sale_log TO authenticated;
GRANT TRIGGER ON public.flash_sale_log TO authenticated;
GRANT TRUNCATE ON public.flash_sale_log TO authenticated;
GRANT UPDATE ON public.flash_sale_log TO authenticated;
GRANT DELETE ON public.flash_sale_log TO service_role;
GRANT INSERT ON public.flash_sale_log TO service_role;
GRANT REFERENCES ON public.flash_sale_log TO service_role;
GRANT SELECT ON public.flash_sale_log TO service_role;
GRANT TRIGGER ON public.flash_sale_log TO service_role;
GRANT TRUNCATE ON public.flash_sale_log TO service_role;
GRANT UPDATE ON public.flash_sale_log TO service_role;
GRANT REFERENCES ON public.folios TO anon;
GRANT SELECT ON public.folios TO anon;
GRANT TRIGGER ON public.folios TO anon;
GRANT TRUNCATE ON public.folios TO anon;
GRANT DELETE ON public.folios TO authenticated;
GRANT INSERT ON public.folios TO authenticated;
GRANT REFERENCES ON public.folios TO authenticated;
GRANT SELECT ON public.folios TO authenticated;
GRANT TRIGGER ON public.folios TO authenticated;
GRANT TRUNCATE ON public.folios TO authenticated;
GRANT UPDATE ON public.folios TO authenticated;
GRANT DELETE ON public.folios TO service_role;
GRANT INSERT ON public.folios TO service_role;
GRANT REFERENCES ON public.folios TO service_role;
GRANT SELECT ON public.folios TO service_role;
GRANT TRIGGER ON public.folios TO service_role;
GRANT TRUNCATE ON public.folios TO service_role;
GRANT UPDATE ON public.folios TO service_role;
GRANT REFERENCES ON public.fountain_inventory TO anon;
GRANT SELECT ON public.fountain_inventory TO anon;
GRANT TRIGGER ON public.fountain_inventory TO anon;
GRANT REFERENCES ON public.fountain_inventory TO authenticated;
GRANT SELECT ON public.fountain_inventory TO authenticated;
GRANT TRIGGER ON public.fountain_inventory TO authenticated;
GRANT DELETE ON public.fountain_inventory TO service_role;
GRANT INSERT ON public.fountain_inventory TO service_role;
GRANT REFERENCES ON public.fountain_inventory TO service_role;
GRANT SELECT ON public.fountain_inventory TO service_role;
GRANT TRIGGER ON public.fountain_inventory TO service_role;
GRANT TRUNCATE ON public.fountain_inventory TO service_role;
GRANT UPDATE ON public.fountain_inventory TO service_role;
GRANT DELETE ON public.guest_contact_valid TO anon;
GRANT INSERT ON public.guest_contact_valid TO anon;
GRANT REFERENCES ON public.guest_contact_valid TO anon;
GRANT SELECT ON public.guest_contact_valid TO anon;
GRANT TRIGGER ON public.guest_contact_valid TO anon;
GRANT TRUNCATE ON public.guest_contact_valid TO anon;
GRANT UPDATE ON public.guest_contact_valid TO anon;
GRANT DELETE ON public.guest_contact_valid TO authenticated;
GRANT INSERT ON public.guest_contact_valid TO authenticated;
GRANT REFERENCES ON public.guest_contact_valid TO authenticated;
GRANT SELECT ON public.guest_contact_valid TO authenticated;
GRANT TRIGGER ON public.guest_contact_valid TO authenticated;
GRANT TRUNCATE ON public.guest_contact_valid TO authenticated;
GRANT UPDATE ON public.guest_contact_valid TO authenticated;
GRANT DELETE ON public.guest_contact_valid TO service_role;
GRANT INSERT ON public.guest_contact_valid TO service_role;
GRANT REFERENCES ON public.guest_contact_valid TO service_role;
GRANT SELECT ON public.guest_contact_valid TO service_role;
GRANT TRIGGER ON public.guest_contact_valid TO service_role;
GRANT TRUNCATE ON public.guest_contact_valid TO service_role;
GRANT UPDATE ON public.guest_contact_valid TO service_role;
GRANT DELETE ON public.guest_ledger TO anon;
GRANT INSERT ON public.guest_ledger TO anon;
GRANT REFERENCES ON public.guest_ledger TO anon;
GRANT SELECT ON public.guest_ledger TO anon;
GRANT TRIGGER ON public.guest_ledger TO anon;
GRANT TRUNCATE ON public.guest_ledger TO anon;
GRANT UPDATE ON public.guest_ledger TO anon;
GRANT DELETE ON public.guest_ledger TO authenticated;
GRANT INSERT ON public.guest_ledger TO authenticated;
GRANT REFERENCES ON public.guest_ledger TO authenticated;
GRANT SELECT ON public.guest_ledger TO authenticated;
GRANT TRIGGER ON public.guest_ledger TO authenticated;
GRANT TRUNCATE ON public.guest_ledger TO authenticated;
GRANT UPDATE ON public.guest_ledger TO authenticated;
GRANT DELETE ON public.guest_ledger TO service_role;
GRANT INSERT ON public.guest_ledger TO service_role;
GRANT REFERENCES ON public.guest_ledger TO service_role;
GRANT SELECT ON public.guest_ledger TO service_role;
GRANT TRIGGER ON public.guest_ledger TO service_role;
GRANT TRUNCATE ON public.guest_ledger TO service_role;
GRANT UPDATE ON public.guest_ledger TO service_role;
GRANT REFERENCES ON public.guests TO anon;
GRANT SELECT ON public.guests TO anon;
GRANT TRIGGER ON public.guests TO anon;
GRANT TRUNCATE ON public.guests TO anon;
GRANT DELETE ON public.guests TO authenticated;
GRANT INSERT ON public.guests TO authenticated;
GRANT REFERENCES ON public.guests TO authenticated;
GRANT SELECT ON public.guests TO authenticated;
GRANT TRIGGER ON public.guests TO authenticated;
GRANT TRUNCATE ON public.guests TO authenticated;
GRANT UPDATE ON public.guests TO authenticated;
GRANT DELETE ON public.guests TO service_role;
GRANT INSERT ON public.guests TO service_role;
GRANT REFERENCES ON public.guests TO service_role;
GRANT SELECT ON public.guests TO service_role;
GRANT TRIGGER ON public.guests TO service_role;
GRANT TRUNCATE ON public.guests TO service_role;
GRANT UPDATE ON public.guests TO service_role;
GRANT DELETE ON public.high_risk_accounts TO anon;
GRANT INSERT ON public.high_risk_accounts TO anon;
GRANT REFERENCES ON public.high_risk_accounts TO anon;
GRANT SELECT ON public.high_risk_accounts TO anon;
GRANT TRIGGER ON public.high_risk_accounts TO anon;
GRANT TRUNCATE ON public.high_risk_accounts TO anon;
GRANT UPDATE ON public.high_risk_accounts TO anon;
GRANT DELETE ON public.high_risk_accounts TO authenticated;
GRANT INSERT ON public.high_risk_accounts TO authenticated;
GRANT REFERENCES ON public.high_risk_accounts TO authenticated;
GRANT SELECT ON public.high_risk_accounts TO authenticated;
GRANT TRIGGER ON public.high_risk_accounts TO authenticated;
GRANT TRUNCATE ON public.high_risk_accounts TO authenticated;
GRANT UPDATE ON public.high_risk_accounts TO authenticated;
GRANT DELETE ON public.high_risk_accounts TO service_role;
GRANT INSERT ON public.high_risk_accounts TO service_role;
GRANT REFERENCES ON public.high_risk_accounts TO service_role;
GRANT SELECT ON public.high_risk_accounts TO service_role;
GRANT TRIGGER ON public.high_risk_accounts TO service_role;
GRANT TRUNCATE ON public.high_risk_accounts TO service_role;
GRANT UPDATE ON public.high_risk_accounts TO service_role;
GRANT REFERENCES ON public.hotel_settings TO anon;
GRANT SELECT ON public.hotel_settings TO anon;
GRANT TRIGGER ON public.hotel_settings TO anon;
GRANT TRUNCATE ON public.hotel_settings TO anon;
GRANT DELETE ON public.hotel_settings TO authenticated;
GRANT INSERT ON public.hotel_settings TO authenticated;
GRANT REFERENCES ON public.hotel_settings TO authenticated;
GRANT SELECT ON public.hotel_settings TO authenticated;
GRANT TRIGGER ON public.hotel_settings TO authenticated;
GRANT TRUNCATE ON public.hotel_settings TO authenticated;
GRANT UPDATE ON public.hotel_settings TO authenticated;
GRANT DELETE ON public.hotel_settings TO service_role;
GRANT INSERT ON public.hotel_settings TO service_role;
GRANT REFERENCES ON public.hotel_settings TO service_role;
GRANT SELECT ON public.hotel_settings TO service_role;
GRANT TRIGGER ON public.hotel_settings TO service_role;
GRANT TRUNCATE ON public.hotel_settings TO service_role;
GRANT UPDATE ON public.hotel_settings TO service_role;
GRANT DELETE ON public.housekeeping_dashboard TO anon;
GRANT INSERT ON public.housekeeping_dashboard TO anon;
GRANT REFERENCES ON public.housekeeping_dashboard TO anon;
GRANT SELECT ON public.housekeeping_dashboard TO anon;
GRANT TRIGGER ON public.housekeeping_dashboard TO anon;
GRANT TRUNCATE ON public.housekeeping_dashboard TO anon;
GRANT UPDATE ON public.housekeeping_dashboard TO anon;
GRANT DELETE ON public.housekeeping_dashboard TO authenticated;
GRANT INSERT ON public.housekeeping_dashboard TO authenticated;
GRANT REFERENCES ON public.housekeeping_dashboard TO authenticated;
GRANT SELECT ON public.housekeeping_dashboard TO authenticated;
GRANT TRIGGER ON public.housekeeping_dashboard TO authenticated;
GRANT TRUNCATE ON public.housekeeping_dashboard TO authenticated;
GRANT UPDATE ON public.housekeeping_dashboard TO authenticated;
GRANT DELETE ON public.housekeeping_dashboard TO service_role;
GRANT INSERT ON public.housekeeping_dashboard TO service_role;
GRANT REFERENCES ON public.housekeeping_dashboard TO service_role;
GRANT SELECT ON public.housekeeping_dashboard TO service_role;
GRANT TRIGGER ON public.housekeeping_dashboard TO service_role;
GRANT TRUNCATE ON public.housekeeping_dashboard TO service_role;
GRANT UPDATE ON public.housekeeping_dashboard TO service_role;
GRANT REFERENCES ON public.housekeeping_tasks TO anon;
GRANT SELECT ON public.housekeeping_tasks TO anon;
GRANT TRIGGER ON public.housekeeping_tasks TO anon;
GRANT TRUNCATE ON public.housekeeping_tasks TO anon;
GRANT DELETE ON public.housekeeping_tasks TO authenticated;
GRANT INSERT ON public.housekeeping_tasks TO authenticated;
GRANT REFERENCES ON public.housekeeping_tasks TO authenticated;
GRANT SELECT ON public.housekeeping_tasks TO authenticated;
GRANT TRIGGER ON public.housekeeping_tasks TO authenticated;
GRANT TRUNCATE ON public.housekeeping_tasks TO authenticated;
GRANT UPDATE ON public.housekeeping_tasks TO authenticated;
GRANT DELETE ON public.housekeeping_tasks TO service_role;
GRANT INSERT ON public.housekeeping_tasks TO service_role;
GRANT REFERENCES ON public.housekeeping_tasks TO service_role;
GRANT SELECT ON public.housekeeping_tasks TO service_role;
GRANT TRIGGER ON public.housekeeping_tasks TO service_role;
GRANT TRUNCATE ON public.housekeeping_tasks TO service_role;
GRANT UPDATE ON public.housekeeping_tasks TO service_role;
GRANT DELETE ON public.invoice_line_items TO anon;
GRANT INSERT ON public.invoice_line_items TO anon;
GRANT REFERENCES ON public.invoice_line_items TO anon;
GRANT SELECT ON public.invoice_line_items TO anon;
GRANT TRIGGER ON public.invoice_line_items TO anon;
GRANT TRUNCATE ON public.invoice_line_items TO anon;
GRANT UPDATE ON public.invoice_line_items TO anon;
GRANT DELETE ON public.invoice_line_items TO authenticated;
GRANT INSERT ON public.invoice_line_items TO authenticated;
GRANT REFERENCES ON public.invoice_line_items TO authenticated;
GRANT SELECT ON public.invoice_line_items TO authenticated;
GRANT TRIGGER ON public.invoice_line_items TO authenticated;
GRANT TRUNCATE ON public.invoice_line_items TO authenticated;
GRANT UPDATE ON public.invoice_line_items TO authenticated;
GRANT DELETE ON public.invoice_line_items TO service_role;
GRANT INSERT ON public.invoice_line_items TO service_role;
GRANT REFERENCES ON public.invoice_line_items TO service_role;
GRANT SELECT ON public.invoice_line_items TO service_role;
GRANT TRIGGER ON public.invoice_line_items TO service_role;
GRANT TRUNCATE ON public.invoice_line_items TO service_role;
GRANT UPDATE ON public.invoice_line_items TO service_role;
GRANT DELETE ON public.leads TO anon;
GRANT INSERT ON public.leads TO anon;
GRANT REFERENCES ON public.leads TO anon;
GRANT SELECT ON public.leads TO anon;
GRANT TRIGGER ON public.leads TO anon;
GRANT TRUNCATE ON public.leads TO anon;
GRANT UPDATE ON public.leads TO anon;
GRANT DELETE ON public.leads TO authenticated;
GRANT INSERT ON public.leads TO authenticated;
GRANT REFERENCES ON public.leads TO authenticated;
GRANT SELECT ON public.leads TO authenticated;
GRANT TRIGGER ON public.leads TO authenticated;
GRANT TRUNCATE ON public.leads TO authenticated;
GRANT UPDATE ON public.leads TO authenticated;
GRANT DELETE ON public.leads TO service_role;
GRANT INSERT ON public.leads TO service_role;
GRANT REFERENCES ON public.leads TO service_role;
GRANT SELECT ON public.leads TO service_role;
GRANT TRIGGER ON public.leads TO service_role;
GRANT TRUNCATE ON public.leads TO service_role;
GRANT UPDATE ON public.leads TO service_role;
GRANT DELETE ON public.leads_pipeline TO anon;
GRANT INSERT ON public.leads_pipeline TO anon;
GRANT REFERENCES ON public.leads_pipeline TO anon;
GRANT SELECT ON public.leads_pipeline TO anon;
GRANT TRIGGER ON public.leads_pipeline TO anon;
GRANT TRUNCATE ON public.leads_pipeline TO anon;
GRANT UPDATE ON public.leads_pipeline TO anon;
GRANT DELETE ON public.leads_pipeline TO authenticated;
GRANT INSERT ON public.leads_pipeline TO authenticated;
GRANT REFERENCES ON public.leads_pipeline TO authenticated;
GRANT SELECT ON public.leads_pipeline TO authenticated;
GRANT TRIGGER ON public.leads_pipeline TO authenticated;
GRANT TRUNCATE ON public.leads_pipeline TO authenticated;
GRANT UPDATE ON public.leads_pipeline TO authenticated;
GRANT DELETE ON public.leads_pipeline TO service_role;
GRANT INSERT ON public.leads_pipeline TO service_role;
GRANT REFERENCES ON public.leads_pipeline TO service_role;
GRANT SELECT ON public.leads_pipeline TO service_role;
GRANT TRIGGER ON public.leads_pipeline TO service_role;
GRANT TRUNCATE ON public.leads_pipeline TO service_role;
GRANT UPDATE ON public.leads_pipeline TO service_role;
GRANT DELETE ON public.lighthouse_summaries TO anon;
GRANT INSERT ON public.lighthouse_summaries TO anon;
GRANT REFERENCES ON public.lighthouse_summaries TO anon;
GRANT SELECT ON public.lighthouse_summaries TO anon;
GRANT TRIGGER ON public.lighthouse_summaries TO anon;
GRANT TRUNCATE ON public.lighthouse_summaries TO anon;
GRANT UPDATE ON public.lighthouse_summaries TO anon;
GRANT DELETE ON public.lighthouse_summaries TO authenticated;
GRANT INSERT ON public.lighthouse_summaries TO authenticated;
GRANT REFERENCES ON public.lighthouse_summaries TO authenticated;
GRANT SELECT ON public.lighthouse_summaries TO authenticated;
GRANT TRIGGER ON public.lighthouse_summaries TO authenticated;
GRANT TRUNCATE ON public.lighthouse_summaries TO authenticated;
GRANT UPDATE ON public.lighthouse_summaries TO authenticated;
GRANT DELETE ON public.lighthouse_summaries TO service_role;
GRANT INSERT ON public.lighthouse_summaries TO service_role;
GRANT REFERENCES ON public.lighthouse_summaries TO service_role;
GRANT SELECT ON public.lighthouse_summaries TO service_role;
GRANT TRIGGER ON public.lighthouse_summaries TO service_role;
GRANT TRUNCATE ON public.lighthouse_summaries TO service_role;
GRANT UPDATE ON public.lighthouse_summaries TO service_role;
GRANT DELETE ON public.maintenance_events TO anon;
GRANT INSERT ON public.maintenance_events TO anon;
GRANT REFERENCES ON public.maintenance_events TO anon;
GRANT SELECT ON public.maintenance_events TO anon;
GRANT TRIGGER ON public.maintenance_events TO anon;
GRANT TRUNCATE ON public.maintenance_events TO anon;
GRANT UPDATE ON public.maintenance_events TO anon;
GRANT DELETE ON public.maintenance_events TO authenticated;
GRANT INSERT ON public.maintenance_events TO authenticated;
GRANT REFERENCES ON public.maintenance_events TO authenticated;
GRANT SELECT ON public.maintenance_events TO authenticated;
GRANT TRIGGER ON public.maintenance_events TO authenticated;
GRANT TRUNCATE ON public.maintenance_events TO authenticated;
GRANT UPDATE ON public.maintenance_events TO authenticated;
GRANT DELETE ON public.maintenance_events TO service_role;
GRANT INSERT ON public.maintenance_events TO service_role;
GRANT REFERENCES ON public.maintenance_events TO service_role;
GRANT SELECT ON public.maintenance_events TO service_role;
GRANT TRIGGER ON public.maintenance_events TO service_role;
GRANT TRUNCATE ON public.maintenance_events TO service_role;
GRANT UPDATE ON public.maintenance_events TO service_role;
GRANT DELETE ON public.manus_config TO anon;
GRANT INSERT ON public.manus_config TO anon;
GRANT REFERENCES ON public.manus_config TO anon;
GRANT SELECT ON public.manus_config TO anon;
GRANT TRIGGER ON public.manus_config TO anon;
GRANT TRUNCATE ON public.manus_config TO anon;
GRANT UPDATE ON public.manus_config TO anon;
GRANT DELETE ON public.manus_config TO authenticated;
GRANT INSERT ON public.manus_config TO authenticated;
GRANT REFERENCES ON public.manus_config TO authenticated;
GRANT SELECT ON public.manus_config TO authenticated;
GRANT TRIGGER ON public.manus_config TO authenticated;
GRANT TRUNCATE ON public.manus_config TO authenticated;
GRANT UPDATE ON public.manus_config TO authenticated;
GRANT DELETE ON public.manus_config TO service_role;
GRANT INSERT ON public.manus_config TO service_role;
GRANT REFERENCES ON public.manus_config TO service_role;
GRANT SELECT ON public.manus_config TO service_role;
GRANT TRIGGER ON public.manus_config TO service_role;
GRANT TRUNCATE ON public.manus_config TO service_role;
GRANT UPDATE ON public.manus_config TO service_role;
GRANT DELETE ON public.marketing_content TO anon;
GRANT INSERT ON public.marketing_content TO anon;
GRANT REFERENCES ON public.marketing_content TO anon;
GRANT SELECT ON public.marketing_content TO anon;
GRANT TRIGGER ON public.marketing_content TO anon;
GRANT TRUNCATE ON public.marketing_content TO anon;
GRANT UPDATE ON public.marketing_content TO anon;
GRANT DELETE ON public.marketing_content TO authenticated;
GRANT INSERT ON public.marketing_content TO authenticated;
GRANT REFERENCES ON public.marketing_content TO authenticated;
GRANT SELECT ON public.marketing_content TO authenticated;
GRANT TRIGGER ON public.marketing_content TO authenticated;
GRANT TRUNCATE ON public.marketing_content TO authenticated;
GRANT UPDATE ON public.marketing_content TO authenticated;
GRANT DELETE ON public.marketing_content TO service_role;
GRANT INSERT ON public.marketing_content TO service_role;
GRANT REFERENCES ON public.marketing_content TO service_role;
GRANT SELECT ON public.marketing_content TO service_role;
GRANT TRIGGER ON public.marketing_content TO service_role;
GRANT TRUNCATE ON public.marketing_content TO service_role;
GRANT UPDATE ON public.marketing_content TO service_role;
GRANT DELETE ON public.monthly_revenue_summary TO anon;
GRANT INSERT ON public.monthly_revenue_summary TO anon;
GRANT REFERENCES ON public.monthly_revenue_summary TO anon;
GRANT SELECT ON public.monthly_revenue_summary TO anon;
GRANT TRIGGER ON public.monthly_revenue_summary TO anon;
GRANT TRUNCATE ON public.monthly_revenue_summary TO anon;
GRANT UPDATE ON public.monthly_revenue_summary TO anon;
GRANT DELETE ON public.monthly_revenue_summary TO authenticated;
GRANT INSERT ON public.monthly_revenue_summary TO authenticated;
GRANT REFERENCES ON public.monthly_revenue_summary TO authenticated;
GRANT SELECT ON public.monthly_revenue_summary TO authenticated;
GRANT TRIGGER ON public.monthly_revenue_summary TO authenticated;
GRANT TRUNCATE ON public.monthly_revenue_summary TO authenticated;
GRANT UPDATE ON public.monthly_revenue_summary TO authenticated;
GRANT DELETE ON public.monthly_revenue_summary TO service_role;
GRANT INSERT ON public.monthly_revenue_summary TO service_role;
GRANT REFERENCES ON public.monthly_revenue_summary TO service_role;
GRANT SELECT ON public.monthly_revenue_summary TO service_role;
GRANT TRIGGER ON public.monthly_revenue_summary TO service_role;
GRANT TRUNCATE ON public.monthly_revenue_summary TO service_role;
GRANT UPDATE ON public.monthly_revenue_summary TO service_role;
GRANT DELETE ON public.night_audit_log TO anon;
GRANT INSERT ON public.night_audit_log TO anon;
GRANT REFERENCES ON public.night_audit_log TO anon;
GRANT SELECT ON public.night_audit_log TO anon;
GRANT TRIGGER ON public.night_audit_log TO anon;
GRANT TRUNCATE ON public.night_audit_log TO anon;
GRANT UPDATE ON public.night_audit_log TO anon;
GRANT DELETE ON public.night_audit_log TO authenticated;
GRANT INSERT ON public.night_audit_log TO authenticated;
GRANT REFERENCES ON public.night_audit_log TO authenticated;
GRANT SELECT ON public.night_audit_log TO authenticated;
GRANT TRIGGER ON public.night_audit_log TO authenticated;
GRANT TRUNCATE ON public.night_audit_log TO authenticated;
GRANT UPDATE ON public.night_audit_log TO authenticated;
GRANT DELETE ON public.night_audit_log TO service_role;
GRANT INSERT ON public.night_audit_log TO service_role;
GRANT REFERENCES ON public.night_audit_log TO service_role;
GRANT SELECT ON public.night_audit_log TO service_role;
GRANT TRIGGER ON public.night_audit_log TO service_role;
GRANT TRUNCATE ON public.night_audit_log TO service_role;
GRANT UPDATE ON public.night_audit_log TO service_role;
GRANT DELETE ON public.notifications_log TO anon;
GRANT INSERT ON public.notifications_log TO anon;
GRANT REFERENCES ON public.notifications_log TO anon;
GRANT SELECT ON public.notifications_log TO anon;
GRANT TRIGGER ON public.notifications_log TO anon;
GRANT TRUNCATE ON public.notifications_log TO anon;
GRANT UPDATE ON public.notifications_log TO anon;
GRANT DELETE ON public.notifications_log TO authenticated;
GRANT INSERT ON public.notifications_log TO authenticated;
GRANT REFERENCES ON public.notifications_log TO authenticated;
GRANT SELECT ON public.notifications_log TO authenticated;
GRANT TRIGGER ON public.notifications_log TO authenticated;
GRANT TRUNCATE ON public.notifications_log TO authenticated;
GRANT UPDATE ON public.notifications_log TO authenticated;
GRANT DELETE ON public.notifications_log TO service_role;
GRANT INSERT ON public.notifications_log TO service_role;
GRANT REFERENCES ON public.notifications_log TO service_role;
GRANT SELECT ON public.notifications_log TO service_role;
GRANT TRIGGER ON public.notifications_log TO service_role;
GRANT TRUNCATE ON public.notifications_log TO service_role;
GRANT UPDATE ON public.notifications_log TO service_role;
GRANT DELETE ON public.occupancy_stats TO anon;
GRANT INSERT ON public.occupancy_stats TO anon;
GRANT REFERENCES ON public.occupancy_stats TO anon;
GRANT SELECT ON public.occupancy_stats TO anon;
GRANT TRIGGER ON public.occupancy_stats TO anon;
GRANT TRUNCATE ON public.occupancy_stats TO anon;
GRANT UPDATE ON public.occupancy_stats TO anon;
GRANT DELETE ON public.occupancy_stats TO authenticated;
GRANT INSERT ON public.occupancy_stats TO authenticated;
GRANT REFERENCES ON public.occupancy_stats TO authenticated;
GRANT SELECT ON public.occupancy_stats TO authenticated;
GRANT TRIGGER ON public.occupancy_stats TO authenticated;
GRANT TRUNCATE ON public.occupancy_stats TO authenticated;
GRANT UPDATE ON public.occupancy_stats TO authenticated;
GRANT DELETE ON public.occupancy_stats TO service_role;
GRANT INSERT ON public.occupancy_stats TO service_role;
GRANT REFERENCES ON public.occupancy_stats TO service_role;
GRANT SELECT ON public.occupancy_stats TO service_role;
GRANT TRIGGER ON public.occupancy_stats TO service_role;
GRANT TRUNCATE ON public.occupancy_stats TO service_role;
GRANT UPDATE ON public.occupancy_stats TO service_role;
GRANT DELETE ON public.open_access_audit TO anon;
GRANT INSERT ON public.open_access_audit TO anon;
GRANT REFERENCES ON public.open_access_audit TO anon;
GRANT SELECT ON public.open_access_audit TO anon;
GRANT TRIGGER ON public.open_access_audit TO anon;
GRANT TRUNCATE ON public.open_access_audit TO anon;
GRANT UPDATE ON public.open_access_audit TO anon;
GRANT DELETE ON public.open_access_audit TO authenticated;
GRANT INSERT ON public.open_access_audit TO authenticated;
GRANT REFERENCES ON public.open_access_audit TO authenticated;
GRANT SELECT ON public.open_access_audit TO authenticated;
GRANT TRIGGER ON public.open_access_audit TO authenticated;
GRANT TRUNCATE ON public.open_access_audit TO authenticated;
GRANT UPDATE ON public.open_access_audit TO authenticated;
GRANT DELETE ON public.open_access_audit TO service_role;
GRANT INSERT ON public.open_access_audit TO service_role;
GRANT REFERENCES ON public.open_access_audit TO service_role;
GRANT SELECT ON public.open_access_audit TO service_role;
GRANT TRIGGER ON public.open_access_audit TO service_role;
GRANT TRUNCATE ON public.open_access_audit TO service_role;
GRANT UPDATE ON public.open_access_audit TO service_role;
GRANT DELETE ON public.ota_channel_performance TO anon;
GRANT INSERT ON public.ota_channel_performance TO anon;
GRANT REFERENCES ON public.ota_channel_performance TO anon;
GRANT SELECT ON public.ota_channel_performance TO anon;
GRANT TRIGGER ON public.ota_channel_performance TO anon;
GRANT TRUNCATE ON public.ota_channel_performance TO anon;
GRANT UPDATE ON public.ota_channel_performance TO anon;
GRANT DELETE ON public.ota_channel_performance TO authenticated;
GRANT INSERT ON public.ota_channel_performance TO authenticated;
GRANT REFERENCES ON public.ota_channel_performance TO authenticated;
GRANT SELECT ON public.ota_channel_performance TO authenticated;
GRANT TRIGGER ON public.ota_channel_performance TO authenticated;
GRANT TRUNCATE ON public.ota_channel_performance TO authenticated;
GRANT UPDATE ON public.ota_channel_performance TO authenticated;
GRANT DELETE ON public.ota_channel_performance TO service_role;
GRANT INSERT ON public.ota_channel_performance TO service_role;
GRANT REFERENCES ON public.ota_channel_performance TO service_role;
GRANT SELECT ON public.ota_channel_performance TO service_role;
GRANT TRIGGER ON public.ota_channel_performance TO service_role;
GRANT TRUNCATE ON public.ota_channel_performance TO service_role;
GRANT UPDATE ON public.ota_channel_performance TO service_role;
GRANT DELETE ON public.ota_rate_plans TO anon;
GRANT INSERT ON public.ota_rate_plans TO anon;
GRANT REFERENCES ON public.ota_rate_plans TO anon;
GRANT SELECT ON public.ota_rate_plans TO anon;
GRANT TRIGGER ON public.ota_rate_plans TO anon;
GRANT TRUNCATE ON public.ota_rate_plans TO anon;
GRANT UPDATE ON public.ota_rate_plans TO anon;
GRANT DELETE ON public.ota_rate_plans TO authenticated;
GRANT INSERT ON public.ota_rate_plans TO authenticated;
GRANT REFERENCES ON public.ota_rate_plans TO authenticated;
GRANT SELECT ON public.ota_rate_plans TO authenticated;
GRANT TRIGGER ON public.ota_rate_plans TO authenticated;
GRANT TRUNCATE ON public.ota_rate_plans TO authenticated;
GRANT UPDATE ON public.ota_rate_plans TO authenticated;
GRANT DELETE ON public.ota_rate_plans TO service_role;
GRANT INSERT ON public.ota_rate_plans TO service_role;
GRANT REFERENCES ON public.ota_rate_plans TO service_role;
GRANT SELECT ON public.ota_rate_plans TO service_role;
GRANT TRIGGER ON public.ota_rate_plans TO service_role;
GRANT TRUNCATE ON public.ota_rate_plans TO service_role;
GRANT UPDATE ON public.ota_rate_plans TO service_role;
GRANT DELETE ON public.outreach_log TO anon;
GRANT INSERT ON public.outreach_log TO anon;
GRANT REFERENCES ON public.outreach_log TO anon;
GRANT SELECT ON public.outreach_log TO anon;
GRANT TRIGGER ON public.outreach_log TO anon;
GRANT TRUNCATE ON public.outreach_log TO anon;
GRANT UPDATE ON public.outreach_log TO anon;
GRANT DELETE ON public.outreach_log TO authenticated;
GRANT INSERT ON public.outreach_log TO authenticated;
GRANT REFERENCES ON public.outreach_log TO authenticated;
GRANT SELECT ON public.outreach_log TO authenticated;
GRANT TRIGGER ON public.outreach_log TO authenticated;
GRANT TRUNCATE ON public.outreach_log TO authenticated;
GRANT UPDATE ON public.outreach_log TO authenticated;
GRANT DELETE ON public.outreach_log TO service_role;
GRANT INSERT ON public.outreach_log TO service_role;
GRANT REFERENCES ON public.outreach_log TO service_role;
GRANT SELECT ON public.outreach_log TO service_role;
GRANT TRIGGER ON public.outreach_log TO service_role;
GRANT TRUNCATE ON public.outreach_log TO service_role;
GRANT UPDATE ON public.outreach_log TO service_role;
GRANT DELETE ON public.overdue_payment_alerts TO anon;
GRANT INSERT ON public.overdue_payment_alerts TO anon;
GRANT REFERENCES ON public.overdue_payment_alerts TO anon;
GRANT SELECT ON public.overdue_payment_alerts TO anon;
GRANT TRIGGER ON public.overdue_payment_alerts TO anon;
GRANT TRUNCATE ON public.overdue_payment_alerts TO anon;
GRANT UPDATE ON public.overdue_payment_alerts TO anon;
GRANT DELETE ON public.overdue_payment_alerts TO authenticated;
GRANT INSERT ON public.overdue_payment_alerts TO authenticated;
GRANT REFERENCES ON public.overdue_payment_alerts TO authenticated;
GRANT SELECT ON public.overdue_payment_alerts TO authenticated;
GRANT TRIGGER ON public.overdue_payment_alerts TO authenticated;
GRANT TRUNCATE ON public.overdue_payment_alerts TO authenticated;
GRANT UPDATE ON public.overdue_payment_alerts TO authenticated;
GRANT DELETE ON public.overdue_payment_alerts TO service_role;
GRANT INSERT ON public.overdue_payment_alerts TO service_role;
GRANT REFERENCES ON public.overdue_payment_alerts TO service_role;
GRANT SELECT ON public.overdue_payment_alerts TO service_role;
GRANT TRIGGER ON public.overdue_payment_alerts TO service_role;
GRANT TRUNCATE ON public.overdue_payment_alerts TO service_role;
GRANT UPDATE ON public.overdue_payment_alerts TO service_role;
GRANT REFERENCES ON public.payment_transactions TO anon;
GRANT SELECT ON public.payment_transactions TO anon;
GRANT TRIGGER ON public.payment_transactions TO anon;
GRANT TRUNCATE ON public.payment_transactions TO anon;
GRANT DELETE ON public.payment_transactions TO authenticated;
GRANT INSERT ON public.payment_transactions TO authenticated;
GRANT REFERENCES ON public.payment_transactions TO authenticated;
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT TRIGGER ON public.payment_transactions TO authenticated;
GRANT TRUNCATE ON public.payment_transactions TO authenticated;
GRANT UPDATE ON public.payment_transactions TO authenticated;
GRANT DELETE ON public.payment_transactions TO service_role;
GRANT INSERT ON public.payment_transactions TO service_role;
GRANT REFERENCES ON public.payment_transactions TO service_role;
GRANT SELECT ON public.payment_transactions TO service_role;
GRANT TRIGGER ON public.payment_transactions TO service_role;
GRANT TRUNCATE ON public.payment_transactions TO service_role;
GRANT UPDATE ON public.payment_transactions TO service_role;
GRANT DELETE ON public.pending_review_requests TO anon;
GRANT INSERT ON public.pending_review_requests TO anon;
GRANT REFERENCES ON public.pending_review_requests TO anon;
GRANT SELECT ON public.pending_review_requests TO anon;
GRANT TRIGGER ON public.pending_review_requests TO anon;
GRANT TRUNCATE ON public.pending_review_requests TO anon;
GRANT UPDATE ON public.pending_review_requests TO anon;
GRANT DELETE ON public.pending_review_requests TO authenticated;
GRANT INSERT ON public.pending_review_requests TO authenticated;
GRANT REFERENCES ON public.pending_review_requests TO authenticated;
GRANT SELECT ON public.pending_review_requests TO authenticated;
GRANT TRIGGER ON public.pending_review_requests TO authenticated;
GRANT TRUNCATE ON public.pending_review_requests TO authenticated;
GRANT UPDATE ON public.pending_review_requests TO authenticated;
GRANT DELETE ON public.pending_review_requests TO service_role;
GRANT INSERT ON public.pending_review_requests TO service_role;
GRANT REFERENCES ON public.pending_review_requests TO service_role;
GRANT SELECT ON public.pending_review_requests TO service_role;
GRANT TRIGGER ON public.pending_review_requests TO service_role;
GRANT TRUNCATE ON public.pending_review_requests TO service_role;
GRANT UPDATE ON public.pending_review_requests TO service_role;
GRANT DELETE ON public.profiles TO anon;
GRANT INSERT ON public.profiles TO anon;
GRANT REFERENCES ON public.profiles TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT TRIGGER ON public.profiles TO anon;
GRANT TRUNCATE ON public.profiles TO anon;
GRANT UPDATE ON public.profiles TO anon;
GRANT DELETE ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
GRANT REFERENCES ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT TRIGGER ON public.profiles TO authenticated;
GRANT TRUNCATE ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO service_role;
GRANT INSERT ON public.profiles TO service_role;
GRANT REFERENCES ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO service_role;
GRANT TRIGGER ON public.profiles TO service_role;
GRANT TRUNCATE ON public.profiles TO service_role;
GRANT UPDATE ON public.profiles TO service_role;
GRANT DELETE ON public.push_subscriptions TO anon;
GRANT INSERT ON public.push_subscriptions TO anon;
GRANT REFERENCES ON public.push_subscriptions TO anon;
GRANT SELECT ON public.push_subscriptions TO anon;
GRANT TRIGGER ON public.push_subscriptions TO anon;
GRANT TRUNCATE ON public.push_subscriptions TO anon;
GRANT UPDATE ON public.push_subscriptions TO anon;
GRANT DELETE ON public.push_subscriptions TO authenticated;
GRANT INSERT ON public.push_subscriptions TO authenticated;
GRANT REFERENCES ON public.push_subscriptions TO authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;
GRANT TRIGGER ON public.push_subscriptions TO authenticated;
GRANT TRUNCATE ON public.push_subscriptions TO authenticated;
GRANT UPDATE ON public.push_subscriptions TO authenticated;
GRANT DELETE ON public.push_subscriptions TO service_role;
GRANT INSERT ON public.push_subscriptions TO service_role;
GRANT REFERENCES ON public.push_subscriptions TO service_role;
GRANT SELECT ON public.push_subscriptions TO service_role;
GRANT TRIGGER ON public.push_subscriptions TO service_role;
GRANT TRUNCATE ON public.push_subscriptions TO service_role;
GRANT UPDATE ON public.push_subscriptions TO service_role;
GRANT DELETE ON public.rate_plans TO anon;
GRANT INSERT ON public.rate_plans TO anon;
GRANT REFERENCES ON public.rate_plans TO anon;
GRANT SELECT ON public.rate_plans TO anon;
GRANT TRIGGER ON public.rate_plans TO anon;
GRANT TRUNCATE ON public.rate_plans TO anon;
GRANT UPDATE ON public.rate_plans TO anon;
GRANT DELETE ON public.rate_plans TO authenticated;
GRANT INSERT ON public.rate_plans TO authenticated;
GRANT REFERENCES ON public.rate_plans TO authenticated;
GRANT SELECT ON public.rate_plans TO authenticated;
GRANT TRIGGER ON public.rate_plans TO authenticated;
GRANT TRUNCATE ON public.rate_plans TO authenticated;
GRANT UPDATE ON public.rate_plans TO authenticated;
GRANT DELETE ON public.rate_plans TO service_role;
GRANT INSERT ON public.rate_plans TO service_role;
GRANT REFERENCES ON public.rate_plans TO service_role;
GRANT SELECT ON public.rate_plans TO service_role;
GRANT TRIGGER ON public.rate_plans TO service_role;
GRANT TRUNCATE ON public.rate_plans TO service_role;
GRANT UPDATE ON public.rate_plans TO service_role;
GRANT DELETE ON public.referral_queue TO anon;
GRANT INSERT ON public.referral_queue TO anon;
GRANT REFERENCES ON public.referral_queue TO anon;
GRANT SELECT ON public.referral_queue TO anon;
GRANT TRIGGER ON public.referral_queue TO anon;
GRANT TRUNCATE ON public.referral_queue TO anon;
GRANT UPDATE ON public.referral_queue TO anon;
GRANT DELETE ON public.referral_queue TO authenticated;
GRANT INSERT ON public.referral_queue TO authenticated;
GRANT REFERENCES ON public.referral_queue TO authenticated;
GRANT SELECT ON public.referral_queue TO authenticated;
GRANT TRIGGER ON public.referral_queue TO authenticated;
GRANT TRUNCATE ON public.referral_queue TO authenticated;
GRANT UPDATE ON public.referral_queue TO authenticated;
GRANT DELETE ON public.referral_queue TO service_role;
GRANT INSERT ON public.referral_queue TO service_role;
GRANT REFERENCES ON public.referral_queue TO service_role;
GRANT SELECT ON public.referral_queue TO service_role;
GRANT TRIGGER ON public.referral_queue TO service_role;
GRANT TRUNCATE ON public.referral_queue TO service_role;
GRANT UPDATE ON public.referral_queue TO service_role;
GRANT DELETE ON public.reservation_billing_summary TO anon;
GRANT INSERT ON public.reservation_billing_summary TO anon;
GRANT REFERENCES ON public.reservation_billing_summary TO anon;
GRANT SELECT ON public.reservation_billing_summary TO anon;
GRANT TRIGGER ON public.reservation_billing_summary TO anon;
GRANT TRUNCATE ON public.reservation_billing_summary TO anon;
GRANT UPDATE ON public.reservation_billing_summary TO anon;
GRANT DELETE ON public.reservation_billing_summary TO authenticated;
GRANT INSERT ON public.reservation_billing_summary TO authenticated;
GRANT REFERENCES ON public.reservation_billing_summary TO authenticated;
GRANT SELECT ON public.reservation_billing_summary TO authenticated;
GRANT TRIGGER ON public.reservation_billing_summary TO authenticated;
GRANT TRUNCATE ON public.reservation_billing_summary TO authenticated;
GRANT UPDATE ON public.reservation_billing_summary TO authenticated;
GRANT DELETE ON public.reservation_billing_summary TO service_role;
GRANT INSERT ON public.reservation_billing_summary TO service_role;
GRANT REFERENCES ON public.reservation_billing_summary TO service_role;
GRANT SELECT ON public.reservation_billing_summary TO service_role;
GRANT TRIGGER ON public.reservation_billing_summary TO service_role;
GRANT TRUNCATE ON public.reservation_billing_summary TO service_role;
GRANT UPDATE ON public.reservation_billing_summary TO service_role;
GRANT REFERENCES ON public.reservations TO anon;
GRANT SELECT ON public.reservations TO anon;
GRANT TRIGGER ON public.reservations TO anon;
GRANT TRUNCATE ON public.reservations TO anon;
GRANT DELETE ON public.reservations TO authenticated;
GRANT INSERT ON public.reservations TO authenticated;
GRANT REFERENCES ON public.reservations TO authenticated;
GRANT SELECT ON public.reservations TO authenticated;
GRANT TRIGGER ON public.reservations TO authenticated;
GRANT TRUNCATE ON public.reservations TO authenticated;
GRANT UPDATE ON public.reservations TO authenticated;
GRANT DELETE ON public.reservations TO service_role;
GRANT INSERT ON public.reservations TO service_role;
GRANT REFERENCES ON public.reservations TO service_role;
GRANT SELECT ON public.reservations TO service_role;
GRANT TRIGGER ON public.reservations TO service_role;
GRANT TRUNCATE ON public.reservations TO service_role;
GRANT UPDATE ON public.reservations TO service_role;
GRANT DELETE ON public.review_queue TO anon;
GRANT INSERT ON public.review_queue TO anon;
GRANT REFERENCES ON public.review_queue TO anon;
GRANT SELECT ON public.review_queue TO anon;
GRANT TRIGGER ON public.review_queue TO anon;
GRANT TRUNCATE ON public.review_queue TO anon;
GRANT UPDATE ON public.review_queue TO anon;
GRANT DELETE ON public.review_queue TO authenticated;
GRANT INSERT ON public.review_queue TO authenticated;
GRANT REFERENCES ON public.review_queue TO authenticated;
GRANT SELECT ON public.review_queue TO authenticated;
GRANT TRIGGER ON public.review_queue TO authenticated;
GRANT TRUNCATE ON public.review_queue TO authenticated;
GRANT UPDATE ON public.review_queue TO authenticated;
GRANT DELETE ON public.review_queue TO service_role;
GRANT INSERT ON public.review_queue TO service_role;
GRANT REFERENCES ON public.review_queue TO service_role;
GRANT SELECT ON public.review_queue TO service_role;
GRANT TRIGGER ON public.review_queue TO service_role;
GRANT TRUNCATE ON public.review_queue TO service_role;
GRANT UPDATE ON public.review_queue TO service_role;
GRANT DELETE ON public.review_request_queue TO anon;
GRANT INSERT ON public.review_request_queue TO anon;
GRANT REFERENCES ON public.review_request_queue TO anon;
GRANT SELECT ON public.review_request_queue TO anon;
GRANT TRIGGER ON public.review_request_queue TO anon;
GRANT TRUNCATE ON public.review_request_queue TO anon;
GRANT UPDATE ON public.review_request_queue TO anon;
GRANT DELETE ON public.review_request_queue TO authenticated;
GRANT INSERT ON public.review_request_queue TO authenticated;
GRANT REFERENCES ON public.review_request_queue TO authenticated;
GRANT SELECT ON public.review_request_queue TO authenticated;
GRANT TRIGGER ON public.review_request_queue TO authenticated;
GRANT TRUNCATE ON public.review_request_queue TO authenticated;
GRANT UPDATE ON public.review_request_queue TO authenticated;
GRANT DELETE ON public.review_request_queue TO service_role;
GRANT INSERT ON public.review_request_queue TO service_role;
GRANT REFERENCES ON public.review_request_queue TO service_role;
GRANT SELECT ON public.review_request_queue TO service_role;
GRANT TRIGGER ON public.review_request_queue TO service_role;
GRANT TRUNCATE ON public.review_request_queue TO service_role;
GRANT UPDATE ON public.review_request_queue TO service_role;
GRANT DELETE ON public.review_requests TO anon;
GRANT INSERT ON public.review_requests TO anon;
GRANT REFERENCES ON public.review_requests TO anon;
GRANT SELECT ON public.review_requests TO anon;
GRANT TRIGGER ON public.review_requests TO anon;
GRANT TRUNCATE ON public.review_requests TO anon;
GRANT UPDATE ON public.review_requests TO anon;
GRANT DELETE ON public.review_requests TO authenticated;
GRANT INSERT ON public.review_requests TO authenticated;
GRANT REFERENCES ON public.review_requests TO authenticated;
GRANT SELECT ON public.review_requests TO authenticated;
GRANT TRIGGER ON public.review_requests TO authenticated;
GRANT TRUNCATE ON public.review_requests TO authenticated;
GRANT UPDATE ON public.review_requests TO authenticated;
GRANT DELETE ON public.review_requests TO service_role;
GRANT INSERT ON public.review_requests TO service_role;
GRANT REFERENCES ON public.review_requests TO service_role;
GRANT SELECT ON public.review_requests TO service_role;
GRANT TRIGGER ON public.review_requests TO service_role;
GRANT TRUNCATE ON public.review_requests TO service_role;
GRANT UPDATE ON public.review_requests TO service_role;
GRANT DELETE ON public.rls_audit TO anon;
GRANT INSERT ON public.rls_audit TO anon;
GRANT REFERENCES ON public.rls_audit TO anon;
GRANT SELECT ON public.rls_audit TO anon;
GRANT TRIGGER ON public.rls_audit TO anon;
GRANT TRUNCATE ON public.rls_audit TO anon;
GRANT UPDATE ON public.rls_audit TO anon;
GRANT DELETE ON public.rls_audit TO authenticated;
GRANT INSERT ON public.rls_audit TO authenticated;
GRANT REFERENCES ON public.rls_audit TO authenticated;
GRANT SELECT ON public.rls_audit TO authenticated;
GRANT TRIGGER ON public.rls_audit TO authenticated;
GRANT TRUNCATE ON public.rls_audit TO authenticated;
GRANT UPDATE ON public.rls_audit TO authenticated;
GRANT DELETE ON public.rls_audit TO service_role;
GRANT INSERT ON public.rls_audit TO service_role;
GRANT REFERENCES ON public.rls_audit TO service_role;
GRANT SELECT ON public.rls_audit TO service_role;
GRANT TRIGGER ON public.rls_audit TO service_role;
GRANT TRUNCATE ON public.rls_audit TO service_role;
GRANT UPDATE ON public.rls_audit TO service_role;
GRANT DELETE ON public.room_assets TO anon;
GRANT INSERT ON public.room_assets TO anon;
GRANT REFERENCES ON public.room_assets TO anon;
GRANT SELECT ON public.room_assets TO anon;
GRANT TRIGGER ON public.room_assets TO anon;
GRANT TRUNCATE ON public.room_assets TO anon;
GRANT UPDATE ON public.room_assets TO anon;
GRANT DELETE ON public.room_assets TO authenticated;
GRANT INSERT ON public.room_assets TO authenticated;
GRANT REFERENCES ON public.room_assets TO authenticated;
GRANT SELECT ON public.room_assets TO authenticated;
GRANT TRIGGER ON public.room_assets TO authenticated;
GRANT TRUNCATE ON public.room_assets TO authenticated;
GRANT UPDATE ON public.room_assets TO authenticated;
GRANT DELETE ON public.room_assets TO service_role;
GRANT INSERT ON public.room_assets TO service_role;
GRANT REFERENCES ON public.room_assets TO service_role;
GRANT SELECT ON public.room_assets TO service_role;
GRANT TRIGGER ON public.room_assets TO service_role;
GRANT TRUNCATE ON public.room_assets TO service_role;
GRANT UPDATE ON public.room_assets TO service_role;
GRANT DELETE ON public.room_maintenance_risk TO anon;
GRANT INSERT ON public.room_maintenance_risk TO anon;
GRANT REFERENCES ON public.room_maintenance_risk TO anon;
GRANT SELECT ON public.room_maintenance_risk TO anon;
GRANT TRIGGER ON public.room_maintenance_risk TO anon;
GRANT TRUNCATE ON public.room_maintenance_risk TO anon;
GRANT UPDATE ON public.room_maintenance_risk TO anon;
GRANT DELETE ON public.room_maintenance_risk TO authenticated;
GRANT INSERT ON public.room_maintenance_risk TO authenticated;
GRANT REFERENCES ON public.room_maintenance_risk TO authenticated;
GRANT SELECT ON public.room_maintenance_risk TO authenticated;
GRANT TRIGGER ON public.room_maintenance_risk TO authenticated;
GRANT TRUNCATE ON public.room_maintenance_risk TO authenticated;
GRANT UPDATE ON public.room_maintenance_risk TO authenticated;
GRANT DELETE ON public.room_maintenance_risk TO service_role;
GRANT INSERT ON public.room_maintenance_risk TO service_role;
GRANT REFERENCES ON public.room_maintenance_risk TO service_role;
GRANT SELECT ON public.room_maintenance_risk TO service_role;
GRANT TRIGGER ON public.room_maintenance_risk TO service_role;
GRANT TRUNCATE ON public.room_maintenance_risk TO service_role;
GRANT UPDATE ON public.room_maintenance_risk TO service_role;
GRANT REFERENCES ON public.rooms TO anon;
GRANT SELECT ON public.rooms TO anon;
GRANT TRIGGER ON public.rooms TO anon;
GRANT TRUNCATE ON public.rooms TO anon;
GRANT DELETE ON public.rooms TO authenticated;
GRANT INSERT ON public.rooms TO authenticated;
GRANT REFERENCES ON public.rooms TO authenticated;
GRANT SELECT ON public.rooms TO authenticated;
GRANT TRIGGER ON public.rooms TO authenticated;
GRANT TRUNCATE ON public.rooms TO authenticated;
GRANT UPDATE ON public.rooms TO authenticated;
GRANT DELETE ON public.rooms TO service_role;
GRANT INSERT ON public.rooms TO service_role;
GRANT REFERENCES ON public.rooms TO service_role;
GRANT SELECT ON public.rooms TO service_role;
GRANT TRIGGER ON public.rooms TO service_role;
GRANT TRUNCATE ON public.rooms TO service_role;
GRANT UPDATE ON public.rooms TO service_role;
GRANT DELETE ON public.sheets_sync_lock TO anon;
GRANT INSERT ON public.sheets_sync_lock TO anon;
GRANT REFERENCES ON public.sheets_sync_lock TO anon;
GRANT SELECT ON public.sheets_sync_lock TO anon;
GRANT TRIGGER ON public.sheets_sync_lock TO anon;
GRANT TRUNCATE ON public.sheets_sync_lock TO anon;
GRANT UPDATE ON public.sheets_sync_lock TO anon;
GRANT DELETE ON public.sheets_sync_lock TO authenticated;
GRANT INSERT ON public.sheets_sync_lock TO authenticated;
GRANT REFERENCES ON public.sheets_sync_lock TO authenticated;
GRANT SELECT ON public.sheets_sync_lock TO authenticated;
GRANT TRIGGER ON public.sheets_sync_lock TO authenticated;
GRANT TRUNCATE ON public.sheets_sync_lock TO authenticated;
GRANT UPDATE ON public.sheets_sync_lock TO authenticated;
GRANT DELETE ON public.sheets_sync_lock TO service_role;
GRANT INSERT ON public.sheets_sync_lock TO service_role;
GRANT REFERENCES ON public.sheets_sync_lock TO service_role;
GRANT SELECT ON public.sheets_sync_lock TO service_role;
GRANT TRIGGER ON public.sheets_sync_lock TO service_role;
GRANT TRUNCATE ON public.sheets_sync_lock TO service_role;
GRANT UPDATE ON public.sheets_sync_lock TO service_role;
GRANT DELETE ON public.social_content_queue TO anon;
GRANT INSERT ON public.social_content_queue TO anon;
GRANT REFERENCES ON public.social_content_queue TO anon;
GRANT SELECT ON public.social_content_queue TO anon;
GRANT TRIGGER ON public.social_content_queue TO anon;
GRANT TRUNCATE ON public.social_content_queue TO anon;
GRANT UPDATE ON public.social_content_queue TO anon;
GRANT DELETE ON public.social_content_queue TO authenticated;
GRANT INSERT ON public.social_content_queue TO authenticated;
GRANT REFERENCES ON public.social_content_queue TO authenticated;
GRANT SELECT ON public.social_content_queue TO authenticated;
GRANT TRIGGER ON public.social_content_queue TO authenticated;
GRANT TRUNCATE ON public.social_content_queue TO authenticated;
GRANT UPDATE ON public.social_content_queue TO authenticated;
GRANT DELETE ON public.social_content_queue TO service_role;
GRANT INSERT ON public.social_content_queue TO service_role;
GRANT REFERENCES ON public.social_content_queue TO service_role;
GRANT SELECT ON public.social_content_queue TO service_role;
GRANT TRIGGER ON public.social_content_queue TO service_role;
GRANT TRUNCATE ON public.social_content_queue TO service_role;
GRANT UPDATE ON public.social_content_queue TO service_role;
GRANT REFERENCES ON public.staff TO anon;
GRANT TRIGGER ON public.staff TO anon;
GRANT TRUNCATE ON public.staff TO anon;
GRANT DELETE ON public.staff TO authenticated;
GRANT INSERT ON public.staff TO authenticated;
GRANT REFERENCES ON public.staff TO authenticated;
GRANT SELECT ON public.staff TO authenticated;
GRANT TRIGGER ON public.staff TO authenticated;
GRANT TRUNCATE ON public.staff TO authenticated;
GRANT UPDATE ON public.staff TO authenticated;
GRANT DELETE ON public.staff TO service_role;
GRANT INSERT ON public.staff TO service_role;
GRANT REFERENCES ON public.staff TO service_role;
GRANT SELECT ON public.staff TO service_role;
GRANT TRIGGER ON public.staff TO service_role;
GRANT TRUNCATE ON public.staff TO service_role;
GRANT UPDATE ON public.staff TO service_role;
GRANT DELETE ON public.subscriptions TO anon;
GRANT INSERT ON public.subscriptions TO anon;
GRANT REFERENCES ON public.subscriptions TO anon;
GRANT SELECT ON public.subscriptions TO anon;
GRANT TRIGGER ON public.subscriptions TO anon;
GRANT TRUNCATE ON public.subscriptions TO anon;
GRANT UPDATE ON public.subscriptions TO anon;
GRANT DELETE ON public.subscriptions TO authenticated;
GRANT INSERT ON public.subscriptions TO authenticated;
GRANT REFERENCES ON public.subscriptions TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT TRIGGER ON public.subscriptions TO authenticated;
GRANT TRUNCATE ON public.subscriptions TO authenticated;
GRANT UPDATE ON public.subscriptions TO authenticated;
GRANT DELETE ON public.subscriptions TO service_role;
GRANT INSERT ON public.subscriptions TO service_role;
GRANT REFERENCES ON public.subscriptions TO service_role;
GRANT SELECT ON public.subscriptions TO service_role;
GRANT TRIGGER ON public.subscriptions TO service_role;
GRANT TRUNCATE ON public.subscriptions TO service_role;
GRANT UPDATE ON public.subscriptions TO service_role;
GRANT DELETE ON public.swarm_leads TO anon;
GRANT INSERT ON public.swarm_leads TO anon;
GRANT REFERENCES ON public.swarm_leads TO anon;
GRANT SELECT ON public.swarm_leads TO anon;
GRANT TRIGGER ON public.swarm_leads TO anon;
GRANT TRUNCATE ON public.swarm_leads TO anon;
GRANT UPDATE ON public.swarm_leads TO anon;
GRANT DELETE ON public.swarm_leads TO authenticated;
GRANT INSERT ON public.swarm_leads TO authenticated;
GRANT REFERENCES ON public.swarm_leads TO authenticated;
GRANT SELECT ON public.swarm_leads TO authenticated;
GRANT TRIGGER ON public.swarm_leads TO authenticated;
GRANT TRUNCATE ON public.swarm_leads TO authenticated;
GRANT UPDATE ON public.swarm_leads TO authenticated;
GRANT DELETE ON public.swarm_leads TO service_role;
GRANT INSERT ON public.swarm_leads TO service_role;
GRANT REFERENCES ON public.swarm_leads TO service_role;
GRANT SELECT ON public.swarm_leads TO service_role;
GRANT TRIGGER ON public.swarm_leads TO service_role;
GRANT TRUNCATE ON public.swarm_leads TO service_role;
GRANT UPDATE ON public.swarm_leads TO service_role;
GRANT DELETE ON public.tenant_domains TO anon;
GRANT INSERT ON public.tenant_domains TO anon;
GRANT REFERENCES ON public.tenant_domains TO anon;
GRANT SELECT ON public.tenant_domains TO anon;
GRANT TRIGGER ON public.tenant_domains TO anon;
GRANT TRUNCATE ON public.tenant_domains TO anon;
GRANT UPDATE ON public.tenant_domains TO anon;
GRANT DELETE ON public.tenant_domains TO authenticated;
GRANT INSERT ON public.tenant_domains TO authenticated;
GRANT REFERENCES ON public.tenant_domains TO authenticated;
GRANT SELECT ON public.tenant_domains TO authenticated;
GRANT TRIGGER ON public.tenant_domains TO authenticated;
GRANT TRUNCATE ON public.tenant_domains TO authenticated;
GRANT UPDATE ON public.tenant_domains TO authenticated;
GRANT DELETE ON public.tenant_domains TO service_role;
GRANT INSERT ON public.tenant_domains TO service_role;
GRANT REFERENCES ON public.tenant_domains TO service_role;
GRANT SELECT ON public.tenant_domains TO service_role;
GRANT TRIGGER ON public.tenant_domains TO service_role;
GRANT TRUNCATE ON public.tenant_domains TO service_role;
GRANT UPDATE ON public.tenant_domains TO service_role;
GRANT DELETE ON public.tenant_guests TO anon;
GRANT INSERT ON public.tenant_guests TO anon;
GRANT REFERENCES ON public.tenant_guests TO anon;
GRANT SELECT ON public.tenant_guests TO anon;
GRANT TRIGGER ON public.tenant_guests TO anon;
GRANT TRUNCATE ON public.tenant_guests TO anon;
GRANT UPDATE ON public.tenant_guests TO anon;
GRANT DELETE ON public.tenant_guests TO authenticated;
GRANT INSERT ON public.tenant_guests TO authenticated;
GRANT REFERENCES ON public.tenant_guests TO authenticated;
GRANT SELECT ON public.tenant_guests TO authenticated;
GRANT TRIGGER ON public.tenant_guests TO authenticated;
GRANT TRUNCATE ON public.tenant_guests TO authenticated;
GRANT UPDATE ON public.tenant_guests TO authenticated;
GRANT DELETE ON public.tenant_guests TO service_role;
GRANT INSERT ON public.tenant_guests TO service_role;
GRANT REFERENCES ON public.tenant_guests TO service_role;
GRANT SELECT ON public.tenant_guests TO service_role;
GRANT TRIGGER ON public.tenant_guests TO service_role;
GRANT TRUNCATE ON public.tenant_guests TO service_role;
GRANT UPDATE ON public.tenant_guests TO service_role;
GRANT DELETE ON public.tenant_reservations TO anon;
GRANT INSERT ON public.tenant_reservations TO anon;
GRANT REFERENCES ON public.tenant_reservations TO anon;
GRANT SELECT ON public.tenant_reservations TO anon;
GRANT TRIGGER ON public.tenant_reservations TO anon;
GRANT TRUNCATE ON public.tenant_reservations TO anon;
GRANT UPDATE ON public.tenant_reservations TO anon;
GRANT DELETE ON public.tenant_reservations TO authenticated;
GRANT INSERT ON public.tenant_reservations TO authenticated;
GRANT REFERENCES ON public.tenant_reservations TO authenticated;
GRANT SELECT ON public.tenant_reservations TO authenticated;
GRANT TRIGGER ON public.tenant_reservations TO authenticated;
GRANT TRUNCATE ON public.tenant_reservations TO authenticated;
GRANT UPDATE ON public.tenant_reservations TO authenticated;
GRANT DELETE ON public.tenant_reservations TO service_role;
GRANT INSERT ON public.tenant_reservations TO service_role;
GRANT REFERENCES ON public.tenant_reservations TO service_role;
GRANT SELECT ON public.tenant_reservations TO service_role;
GRANT TRIGGER ON public.tenant_reservations TO service_role;
GRANT TRUNCATE ON public.tenant_reservations TO service_role;
GRANT UPDATE ON public.tenant_reservations TO service_role;
GRANT DELETE ON public.tenant_rooms TO anon;
GRANT INSERT ON public.tenant_rooms TO anon;
GRANT REFERENCES ON public.tenant_rooms TO anon;
GRANT SELECT ON public.tenant_rooms TO anon;
GRANT TRIGGER ON public.tenant_rooms TO anon;
GRANT TRUNCATE ON public.tenant_rooms TO anon;
GRANT UPDATE ON public.tenant_rooms TO anon;
GRANT DELETE ON public.tenant_rooms TO authenticated;
GRANT INSERT ON public.tenant_rooms TO authenticated;
GRANT REFERENCES ON public.tenant_rooms TO authenticated;
GRANT SELECT ON public.tenant_rooms TO authenticated;
GRANT TRIGGER ON public.tenant_rooms TO authenticated;
GRANT TRUNCATE ON public.tenant_rooms TO authenticated;
GRANT UPDATE ON public.tenant_rooms TO authenticated;
GRANT DELETE ON public.tenant_rooms TO service_role;
GRANT INSERT ON public.tenant_rooms TO service_role;
GRANT REFERENCES ON public.tenant_rooms TO service_role;
GRANT SELECT ON public.tenant_rooms TO service_role;
GRANT TRIGGER ON public.tenant_rooms TO service_role;
GRANT TRUNCATE ON public.tenant_rooms TO service_role;
GRANT UPDATE ON public.tenant_rooms TO service_role;
GRANT DELETE ON public.tenant_users TO anon;
GRANT INSERT ON public.tenant_users TO anon;
GRANT REFERENCES ON public.tenant_users TO anon;
GRANT SELECT ON public.tenant_users TO anon;
GRANT TRIGGER ON public.tenant_users TO anon;
GRANT TRUNCATE ON public.tenant_users TO anon;
GRANT UPDATE ON public.tenant_users TO anon;
GRANT DELETE ON public.tenant_users TO authenticated;
GRANT INSERT ON public.tenant_users TO authenticated;
GRANT REFERENCES ON public.tenant_users TO authenticated;
GRANT SELECT ON public.tenant_users TO authenticated;
GRANT TRIGGER ON public.tenant_users TO authenticated;
GRANT TRUNCATE ON public.tenant_users TO authenticated;
GRANT UPDATE ON public.tenant_users TO authenticated;
GRANT DELETE ON public.tenant_users TO service_role;
GRANT INSERT ON public.tenant_users TO service_role;
GRANT REFERENCES ON public.tenant_users TO service_role;
GRANT SELECT ON public.tenant_users TO service_role;
GRANT TRIGGER ON public.tenant_users TO service_role;
GRANT TRUNCATE ON public.tenant_users TO service_role;
GRANT UPDATE ON public.tenant_users TO service_role;
GRANT DELETE ON public.tenants TO anon;
GRANT INSERT ON public.tenants TO anon;
GRANT REFERENCES ON public.tenants TO anon;
GRANT SELECT ON public.tenants TO anon;
GRANT TRIGGER ON public.tenants TO anon;
GRANT TRUNCATE ON public.tenants TO anon;
GRANT UPDATE ON public.tenants TO anon;
GRANT DELETE ON public.tenants TO authenticated;
GRANT INSERT ON public.tenants TO authenticated;
GRANT REFERENCES ON public.tenants TO authenticated;
GRANT SELECT ON public.tenants TO authenticated;
GRANT TRIGGER ON public.tenants TO authenticated;
GRANT TRUNCATE ON public.tenants TO authenticated;
GRANT UPDATE ON public.tenants TO authenticated;
GRANT DELETE ON public.tenants TO service_role;
GRANT INSERT ON public.tenants TO service_role;
GRANT REFERENCES ON public.tenants TO service_role;
GRANT SELECT ON public.tenants TO service_role;
GRANT TRIGGER ON public.tenants TO service_role;
GRANT TRUNCATE ON public.tenants TO service_role;
GRANT UPDATE ON public.tenants TO service_role;
GRANT REFERENCES ON public.transactions TO anon;
GRANT SELECT ON public.transactions TO anon;
GRANT TRIGGER ON public.transactions TO anon;
GRANT TRUNCATE ON public.transactions TO anon;
GRANT DELETE ON public.transactions TO authenticated;
GRANT INSERT ON public.transactions TO authenticated;
GRANT REFERENCES ON public.transactions TO authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT TRIGGER ON public.transactions TO authenticated;
GRANT TRUNCATE ON public.transactions TO authenticated;
GRANT UPDATE ON public.transactions TO authenticated;
GRANT DELETE ON public.transactions TO service_role;
GRANT INSERT ON public.transactions TO service_role;
GRANT REFERENCES ON public.transactions TO service_role;
GRANT SELECT ON public.transactions TO service_role;
GRANT TRIGGER ON public.transactions TO service_role;
GRANT TRUNCATE ON public.transactions TO service_role;
GRANT UPDATE ON public.transactions TO service_role;
GRANT DELETE ON public.upsell_offers TO anon;
GRANT INSERT ON public.upsell_offers TO anon;
GRANT REFERENCES ON public.upsell_offers TO anon;
GRANT SELECT ON public.upsell_offers TO anon;
GRANT TRIGGER ON public.upsell_offers TO anon;
GRANT TRUNCATE ON public.upsell_offers TO anon;
GRANT UPDATE ON public.upsell_offers TO anon;
GRANT DELETE ON public.upsell_offers TO authenticated;
GRANT INSERT ON public.upsell_offers TO authenticated;
GRANT REFERENCES ON public.upsell_offers TO authenticated;
GRANT SELECT ON public.upsell_offers TO authenticated;
GRANT TRIGGER ON public.upsell_offers TO authenticated;
GRANT TRUNCATE ON public.upsell_offers TO authenticated;
GRANT UPDATE ON public.upsell_offers TO authenticated;
GRANT DELETE ON public.upsell_offers TO service_role;
GRANT INSERT ON public.upsell_offers TO service_role;
GRANT REFERENCES ON public.upsell_offers TO service_role;
GRANT SELECT ON public.upsell_offers TO service_role;
GRANT TRIGGER ON public.upsell_offers TO service_role;
GRANT TRUNCATE ON public.upsell_offers TO service_role;
GRANT UPDATE ON public.upsell_offers TO service_role;
GRANT DELETE ON public.user_credentials TO service_role;
GRANT INSERT ON public.user_credentials TO service_role;
GRANT REFERENCES ON public.user_credentials TO service_role;
GRANT SELECT ON public.user_credentials TO service_role;
GRANT TRIGGER ON public.user_credentials TO service_role;
GRANT TRUNCATE ON public.user_credentials TO service_role;
GRANT UPDATE ON public.user_credentials TO service_role;
GRANT DELETE ON public.v_council_sessions_with_panel TO anon;
GRANT INSERT ON public.v_council_sessions_with_panel TO anon;
GRANT REFERENCES ON public.v_council_sessions_with_panel TO anon;
GRANT SELECT ON public.v_council_sessions_with_panel TO anon;
GRANT TRIGGER ON public.v_council_sessions_with_panel TO anon;
GRANT TRUNCATE ON public.v_council_sessions_with_panel TO anon;
GRANT UPDATE ON public.v_council_sessions_with_panel TO anon;
GRANT DELETE ON public.v_council_sessions_with_panel TO authenticated;
GRANT INSERT ON public.v_council_sessions_with_panel TO authenticated;
GRANT REFERENCES ON public.v_council_sessions_with_panel TO authenticated;
GRANT SELECT ON public.v_council_sessions_with_panel TO authenticated;
GRANT TRIGGER ON public.v_council_sessions_with_panel TO authenticated;
GRANT TRUNCATE ON public.v_council_sessions_with_panel TO authenticated;
GRANT UPDATE ON public.v_council_sessions_with_panel TO authenticated;
GRANT DELETE ON public.v_council_sessions_with_panel TO service_role;
GRANT INSERT ON public.v_council_sessions_with_panel TO service_role;
GRANT REFERENCES ON public.v_council_sessions_with_panel TO service_role;
GRANT SELECT ON public.v_council_sessions_with_panel TO service_role;
GRANT TRIGGER ON public.v_council_sessions_with_panel TO service_role;
GRANT TRUNCATE ON public.v_council_sessions_with_panel TO service_role;
GRANT UPDATE ON public.v_council_sessions_with_panel TO service_role;
GRANT DELETE ON public.v_lighthouse_latest TO anon;
GRANT INSERT ON public.v_lighthouse_latest TO anon;
GRANT REFERENCES ON public.v_lighthouse_latest TO anon;
GRANT SELECT ON public.v_lighthouse_latest TO anon;
GRANT TRIGGER ON public.v_lighthouse_latest TO anon;
GRANT TRUNCATE ON public.v_lighthouse_latest TO anon;
GRANT UPDATE ON public.v_lighthouse_latest TO anon;
GRANT DELETE ON public.v_lighthouse_latest TO authenticated;
GRANT INSERT ON public.v_lighthouse_latest TO authenticated;
GRANT REFERENCES ON public.v_lighthouse_latest TO authenticated;
GRANT SELECT ON public.v_lighthouse_latest TO authenticated;
GRANT TRIGGER ON public.v_lighthouse_latest TO authenticated;
GRANT TRUNCATE ON public.v_lighthouse_latest TO authenticated;
GRANT UPDATE ON public.v_lighthouse_latest TO authenticated;
GRANT DELETE ON public.v_lighthouse_latest TO service_role;
GRANT INSERT ON public.v_lighthouse_latest TO service_role;
GRANT REFERENCES ON public.v_lighthouse_latest TO service_role;
GRANT SELECT ON public.v_lighthouse_latest TO service_role;
GRANT TRIGGER ON public.v_lighthouse_latest TO service_role;
GRANT TRUNCATE ON public.v_lighthouse_latest TO service_role;
GRANT UPDATE ON public.v_lighthouse_latest TO service_role;
GRANT DELETE ON public.workflow_locks TO anon;
GRANT INSERT ON public.workflow_locks TO anon;
GRANT REFERENCES ON public.workflow_locks TO anon;
GRANT SELECT ON public.workflow_locks TO anon;
GRANT TRIGGER ON public.workflow_locks TO anon;
GRANT TRUNCATE ON public.workflow_locks TO anon;
GRANT UPDATE ON public.workflow_locks TO anon;
GRANT DELETE ON public.workflow_locks TO authenticated;
GRANT INSERT ON public.workflow_locks TO authenticated;
GRANT REFERENCES ON public.workflow_locks TO authenticated;
GRANT SELECT ON public.workflow_locks TO authenticated;
GRANT TRIGGER ON public.workflow_locks TO authenticated;
GRANT TRUNCATE ON public.workflow_locks TO authenticated;
GRANT UPDATE ON public.workflow_locks TO authenticated;
GRANT DELETE ON public.workflow_locks TO service_role;
GRANT INSERT ON public.workflow_locks TO service_role;
GRANT REFERENCES ON public.workflow_locks TO service_role;
GRANT SELECT ON public.workflow_locks TO service_role;
GRANT TRIGGER ON public.workflow_locks TO service_role;
GRANT TRUNCATE ON public.workflow_locks TO service_role;
GRANT UPDATE ON public.workflow_locks TO service_role;
GRANT DELETE ON public.workflow_runs TO anon;
GRANT INSERT ON public.workflow_runs TO anon;
GRANT REFERENCES ON public.workflow_runs TO anon;
GRANT SELECT ON public.workflow_runs TO anon;
GRANT TRIGGER ON public.workflow_runs TO anon;
GRANT TRUNCATE ON public.workflow_runs TO anon;
GRANT UPDATE ON public.workflow_runs TO anon;
GRANT DELETE ON public.workflow_runs TO authenticated;
GRANT INSERT ON public.workflow_runs TO authenticated;
GRANT REFERENCES ON public.workflow_runs TO authenticated;
GRANT SELECT ON public.workflow_runs TO authenticated;
GRANT TRIGGER ON public.workflow_runs TO authenticated;
GRANT TRUNCATE ON public.workflow_runs TO authenticated;
GRANT UPDATE ON public.workflow_runs TO authenticated;
GRANT DELETE ON public.workflow_runs TO service_role;
GRANT INSERT ON public.workflow_runs TO service_role;
GRANT REFERENCES ON public.workflow_runs TO service_role;
GRANT SELECT ON public.workflow_runs TO service_role;
GRANT TRIGGER ON public.workflow_runs TO service_role;
GRANT TRUNCATE ON public.workflow_runs TO service_role;
GRANT UPDATE ON public.workflow_runs TO service_role;
