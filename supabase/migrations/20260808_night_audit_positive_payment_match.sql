-- APPLIED TO PROD 2026-08-08 (Supabase migration: night_audit_positive_payment_match).
-- Committed so a clean re-apply reproduces production exactly.
--
-- execute_nightly_audit(): two money-rule corrections.
--
-- 1. total_collections used an EXCLUSION-ONLY filter (`type !~* 'balance carried
--    forward'`) -- the anti-pattern the house rules blacklist, because it lets
--    CHARGES count as cash collected. Measured across 60 closed days: 40 days
--    overstated, 376,500 BDT total (Stay Extension +1/+2 nights, Restaurant
--    charges, and [VOID-DUP] voided duplicates). Replaced with the SAME positive
--    match the printed Daily Performance Report uses (Reports.jsx REAL_PAY +
--    notBCF) so the closed snapshot, the PDF and the night-audit email agree by
--    construction. See also the PARITY BLOCK in src/workflows/close-day-chain.ts.
--
-- 2. carried_over_dues counted EVERY non-cancelled reservation, including future
--    RESERVED/PENDING bookings that are only part-prepaid. Canonical rule
--    (src/lib/dues.js, owner decision 2026-06-12): dues = RECEIVABLES ONLY =
--    CHECKED_IN / CHECKED_OUT. The column is stored but not rendered in the UI,
--    so this correction has no visual blast radius.
--
-- Parameter DEFAULTS are preserved verbatim -- CREATE OR REPLACE cannot drop them
-- (ERROR 42P13: "cannot remove parameter defaults from existing function") and
-- callers rely on them.
--
-- Historical night_audit_log rows are NOT rewritten here: those figures stay as
-- they were locked at close. Backup taken: _backup_night_audit_log_2026_08_08 (60 rows).
-- Unchanged: SECURITY DEFINER, `SET search_path = public, pg_temp`, and grants
-- (postgres / service_role / crm_tenant EXECUTE; NO anon, NO authenticated).

CREATE OR REPLACE FUNCTION public.execute_nightly_audit(
  target_tenant_id uuid,
  p_audit_date date DEFAULT CURRENT_DATE,
  p_closed_by text DEFAULT 'night-audit-engine'::text,
  p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_date_txt text := to_char(p_audit_date,'YYYY-MM-DD');
  v_vat_rate numeric(5,2); v_checkins int; v_checkouts int; v_occupied int; v_vacant int;
  v_collections numeric(14,2); v_carried_dues numeric(14,2);
  v_room_net numeric(14,2); v_sc_accrued numeric(14,2); v_vat_accrued numeric(14,2);
  v_discrepancies jsonb; v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=target_tenant_id) THEN
    RAISE EXCEPTION 'Unknown tenant %', target_tenant_id USING ERRCODE='22023'; END IF;
  SELECT COALESCE(NULLIF(hs.value,'')::numeric,15) INTO v_vat_rate FROM public.hotel_settings hs
    WHERE hs.key='vat_rate' AND hs.tenant_id=target_tenant_id;
  v_vat_rate := COALESCE(v_vat_rate,15);

  SELECT count(*) FILTER (WHERE to_char(res.check_in  AT TIME ZONE 'UTC','YYYY-MM-DD')=v_date_txt),
         count(*) FILTER (WHERE to_char(res.check_out AT TIME ZONE 'UTC','YYYY-MM-DD')=v_date_txt)
    INTO v_checkins, v_checkouts
  FROM public.reservations res
  WHERE res.tenant_id=target_tenant_id AND res.status <> 'CANCELLED';

  -- POSITIVE payment match -- mirrors Reports.jsx REAL_PAY + notBCF exactly.
  -- Charges (Stay Extension, Restaurant, ...) and [VOID-DUP] rows are NOT money in.
  SELECT COALESCE(SUM(tx.amount),0)::numeric(14,2) INTO v_collections
  FROM public.transactions tx
  WHERE tx.tenant_id=target_tenant_id
    AND COALESCE(tx.type,'') ~* 'payment|settlement|advance|deposit|bkash|nagad|bank\s*transfer|cash|card'
    AND COALESCE(tx.type,'') !~ '^\[VOID-DUP\]'
    AND COALESCE(tx.type,'') !~* 'balance carried forward'
    AND COALESCE(NULLIF(tx.fiscal_day,''), to_char(tx.created_at AT TIME ZONE 'UTC','YYYY-MM-DD'))=v_date_txt;

  -- RECEIVABLES ONLY (owner decision 2026-06-12).
  SELECT COALESCE(SUM(GREATEST(0, res.total_amount - COALESCE(res.discount_amount,res.discount,0) - COALESCE(res.paid_amount,0))),0)::numeric(14,2)
    INTO v_carried_dues
  FROM public.reservations res
  WHERE res.tenant_id=target_tenant_id AND res.status <> 'CANCELLED'
    AND upper(res.status) IN ('CHECKED_IN','CHECKED_OUT');

  SELECT count(*) FILTER (WHERE upper(coalesce(rm.status,''))='OCCUPIED'),
         count(*) FILTER (WHERE upper(coalesce(rm.status,'')) IN ('AVAILABLE','CLEAN','VACANT'))
    INTO v_occupied, v_vacant FROM public.rooms rm WHERE rm.tenant_id=target_tenant_id;

  SELECT COALESCE(SUM(gl.amount_bdt) FILTER (WHERE gl.entry_type::text='ROOM_CHARGE'),0)::numeric(14,2),
         COALESCE(SUM(gl.amount_bdt) FILTER (WHERE gl.entry_type::text='SERVICE_CHARGE'),0)::numeric(14,2),
         COALESCE(SUM(gl.amount_bdt) FILTER (WHERE gl.entry_type::text='TAX'),0)::numeric(14,2)
    INTO v_room_net, v_sc_accrued, v_vat_accrued
  FROM public.guest_ledger gl
  WHERE gl.tenant_id=target_tenant_id AND gl.transaction_date=p_audit_date AND gl.is_voided=false;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reservation_id',res.id,'guest_name',res.guest_name,
            'check_out',res.check_out,'issue','checked_in_past_checkout')),'[]'::jsonb)
    INTO v_discrepancies
  FROM public.reservations res
  WHERE res.tenant_id=target_tenant_id AND res.status='CHECKED_IN'
    AND res.check_out IS NOT NULL AND res.check_out::date < p_audit_date;

  INSERT INTO public.night_audit_log AS nal (
    tenant_id, audit_date, closed_at, closed_by, notes,
    total_checkins, total_checkouts, total_collections, carried_over_dues,
    rooms_occupied, rooms_vacant, vat_rate_used, room_revenue_net, sc_accrued,
    vat_accrued, discrepancies, status)
  VALUES (target_tenant_id, p_audit_date, now(), p_closed_by, p_notes,
    v_checkins, v_checkouts, v_collections, v_carried_dues,
    v_occupied, v_vacant, v_vat_rate, v_room_net, v_sc_accrued,
    v_vat_accrued, v_discrepancies, 'closed')
  ON CONFLICT (tenant_id, audit_date) DO UPDATE SET
    closed_at=EXCLUDED.closed_at, closed_by=EXCLUDED.closed_by, notes=EXCLUDED.notes,
    total_checkins=EXCLUDED.total_checkins, total_checkouts=EXCLUDED.total_checkouts,
    total_collections=EXCLUDED.total_collections, carried_over_dues=EXCLUDED.carried_over_dues,
    rooms_occupied=EXCLUDED.rooms_occupied, rooms_vacant=EXCLUDED.rooms_vacant,
    vat_rate_used=EXCLUDED.vat_rate_used, room_revenue_net=EXCLUDED.room_revenue_net,
    sc_accrued=EXCLUDED.sc_accrued, vat_accrued=EXCLUDED.vat_accrued,
    discrepancies=EXCLUDED.discrepancies, status=EXCLUDED.status;

  v_result := jsonb_build_object('success',true,'tenant_id',target_tenant_id,'audit_date',p_audit_date,
    'checkins',v_checkins,'checkouts',v_checkouts,'rooms_occupied',v_occupied,'rooms_vacant',v_vacant,
    'collections',v_collections,'carried_over_dues',v_carried_dues,'room_revenue_net',v_room_net,
    'service_charge_accrued',v_sc_accrued,'vat_accrued',v_vat_accrued,'vat_rate_used',v_vat_rate,
    'discrepancy_count',jsonb_array_length(v_discrepancies),'discrepancies',v_discrepancies);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.audit_logs (tenant_id, event_type, result, error, payload_summary)
  VALUES (target_tenant_id,'night_audit','failure',SQLERRM,
          jsonb_build_object('audit_date',p_audit_date,'sqlstate',SQLSTATE,'closed_by',p_closed_by));
  RETURN jsonb_build_object('success',false,'tenant_id',target_tenant_id,'audit_date',p_audit_date,
          'error',SQLERRM,'sqlstate',SQLSTATE);
END;
$function$;
