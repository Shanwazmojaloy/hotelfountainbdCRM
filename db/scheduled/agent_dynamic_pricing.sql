CREATE OR REPLACE FUNCTION public.agent_dynamic_pricing()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_day text; v_month integer; v_mult numeric; v_season text; v_occ numeric;
BEGIN
  v_day:=TRIM(TO_CHAR(CURRENT_DATE,'Day'));
  v_month:=EXTRACT(MONTH FROM CURRENT_DATE);
  SELECT ROUND(COUNT(CASE WHEN status='OCCUPIED' THEN 1 END)::numeric/NULLIF(COUNT(*),0)*100,1)
  INTO v_occ FROM rooms WHERE tenant_id = fountain_tenant_id();

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
    fountain_tenant_id()
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
