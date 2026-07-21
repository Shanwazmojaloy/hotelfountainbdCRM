-- ============================================================================
-- 08_restaurant_pos.sql  -- Lumea Restaurant / POS module (Phase 2 schema)
-- Hotel Fountain BD CRM. Created 2026-07-21.
--
-- Reservation-centric + folio-synced:
--   * A "Charge to Room" POS order posts ONE row into public.folios
--     (category='Restaurant', amount=grand_total, reservation_id, room_number),
--     which the existing recalcResTotal path folds into reservations.total_amount
--     and thus the guest's master bill. folios -> reservations is ON DELETE CASCADE,
--     so a cascade-deleted reservation also removes its F&B folio line (no orphan).
--   * Walk-in / Dine-in F&B stays in restaurant_orders only (independent F&B revenue),
--     keeping hotel PMS revenue clean.
--
-- Security baseline (lumea-security): RLS ON for every table, SECURITY INVOKER trigger
-- with pinned search_path, anon/authenticated/public revoked -> service-role API routes
-- are the sole read/write path (mirrors transactions/folios). No SECURITY DEFINER.
--
-- Money = numeric(12,2) in BDT, matching folios.amount / reservations.total_amount.
-- Apply on a Supabase PREVIEW BRANCH first (owner gate: P2 = HOLD for prod).
-- ============================================================================

begin;

-- ---- human-readable order number (POS-0001 ...) -----------------------------
create sequence if not exists public.restaurant_order_no_seq;

-- ---- 1. menu catalog --------------------------------------------------------
create table if not exists public.restaurant_menu_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default coalesce(current_tenant_id(), '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid),
  name         text not null,
  category     text not null,                         -- Breakfast | Main Course | Drinks | Snacks | Desserts ...
  price_bdt    numeric(12,2) not null default 0,      -- unit price
  vat_rate     numeric(5,2)  not null default 0,      -- percentage e.g. 5 or 15
  is_available boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint restaurant_menu_price_nonneg check (price_bdt >= 0),
  constraint restaurant_menu_vat_range   check (vat_rate >= 0 and vat_rate <= 100)
);

-- ---- 2. order header --------------------------------------------------------
create table if not exists public.restaurant_orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default coalesce(current_tenant_id(), '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid),
  order_no            text not null default ('POS-' || lpad(nextval('public.restaurant_order_no_seq')::text, 4, '0')),
  order_type          text not null,                  -- ROOM | DINE_IN | WALK_IN
  reservation_id      uuid references public.reservations(id) on delete cascade,
  room_number         text,
  guest_id            uuid,                            -- soft link (no hard FK)
  table_no            text,
  subtotal_bdt        numeric(12,2) not null default 0,
  vat_bdt             numeric(12,2) not null default 0,
  service_charge_bdt  numeric(12,2) not null default 0,
  discount_bdt        numeric(12,2) not null default 0,
  grand_total_bdt     numeric(12,2) not null default 0,
  payment_status      text not null default 'PENDING',-- PENDING | PAID | POSTED_TO_ROOM | VOID
  payment_method      text,                            -- Cash | Card | bKash | Nagad | Room
  folio_id            uuid references public.folios(id) on delete set null,  -- the posted room-charge line
  fiscal_day          text,                            -- open business day (mirrors transactions.fiscal_day)
  status              text not null default 'OPEN',    -- OPEN | FIRED | READY | SERVED | CLOSED | VOID  (KOT flow)
  created_by_id       bigint,
  created_by_name     text,
  voided_by_id        bigint,
  voided_reason       text,
  idempotency_key     uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint restaurant_orders_type_chk    check (order_type in ('ROOM','DINE_IN','WALK_IN')),
  constraint restaurant_orders_paystat_chk check (payment_status in ('PENDING','PAID','POSTED_TO_ROOM','VOID')),
  constraint restaurant_orders_status_chk  check (status in ('OPEN','FIRED','READY','SERVED','CLOSED','VOID')),
  -- integrity: a ROOM order MUST anchor to a reservation (no orphan room charges)
  constraint restaurant_orders_room_needs_res check (order_type <> 'ROOM' or reservation_id is not null),
  constraint restaurant_orders_totals_nonneg check (
    subtotal_bdt >= 0 and vat_bdt >= 0 and service_charge_bdt >= 0
    and discount_bdt >= 0 and grand_total_bdt >= 0
  )
);

-- ---- 3. order line items ----------------------------------------------------
create table if not exists public.restaurant_order_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default coalesce(current_tenant_id(), '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid),
  order_id       uuid not null references public.restaurant_orders(id) on delete cascade,
  menu_item_id   uuid references public.restaurant_menu_items(id) on delete set null,
  name           text not null,                        -- snapshot at sale time (price/name may drift later)
  qty            numeric(10,2) not null default 1,
  unit_price_bdt numeric(12,2) not null default 0,
  vat_rate       numeric(5,2)  not null default 0,
  line_total_bdt numeric(12,2) not null default 0,     -- unit_price_bdt * qty (pre-VAT)
  notes          text,                                 -- kitchen notes / modifiers
  created_at     timestamptz not null default now(),
  constraint restaurant_order_items_qty_pos check (qty > 0)
);

-- ---- indexes ----------------------------------------------------------------
create index if not exists idx_rest_menu_tenant_cat  on public.restaurant_menu_items (tenant_id, category);
create index if not exists idx_rest_orders_tenant_day on public.restaurant_orders (tenant_id, fiscal_day);
create index if not exists idx_rest_orders_res        on public.restaurant_orders (reservation_id);
create index if not exists idx_rest_orders_status     on public.restaurant_orders (status);
create index if not exists idx_rest_items_order       on public.restaurant_order_items (order_id);
-- dup-prevention on retried POST (mirrors transactions idempotency pattern)
create unique index if not exists uq_rest_orders_idem
  on public.restaurant_orders (idempotency_key) where idempotency_key is not null;

-- ---- updated_at trigger (SECURITY INVOKER, pinned search_path) ---------------
create or replace function public.restaurant_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.restaurant_touch_updated_at() from public, anon, authenticated;

drop trigger if exists trg_rest_menu_touch on public.restaurant_menu_items;
create trigger trg_rest_menu_touch before update on public.restaurant_menu_items
  for each row execute function public.restaurant_touch_updated_at();

drop trigger if exists trg_rest_orders_touch on public.restaurant_orders;
create trigger trg_rest_orders_touch before update on public.restaurant_orders
  for each row execute function public.restaurant_touch_updated_at();

-- ---- RLS: fail-closed. service_role (API routes) is the sole access path -----
alter table public.restaurant_menu_items  enable row level security;
alter table public.restaurant_orders      enable row level security;
alter table public.restaurant_order_items enable row level security;

-- No permissive policies for anon/authenticated: with RLS on and no policy, those
-- roles get zero rows / zero writes (secure default). service_role bypasses RLS.
revoke all on public.restaurant_menu_items  from anon, authenticated, public;
revoke all on public.restaurant_orders      from anon, authenticated, public;
revoke all on public.restaurant_order_items from anon, authenticated, public;

grant select, insert, update, delete on public.restaurant_menu_items  to service_role;
grant select, insert, update, delete on public.restaurant_orders      to service_role;
grant select, insert, update, delete on public.restaurant_order_items to service_role;
grant usage on sequence public.restaurant_order_no_seq to service_role;

-- ---- atomic order creation --------------------------------------------------
-- Header + line items + (for ROOM) the folios charge line commit as ONE unit, so a
-- mid-write failure can never orphan an order or half-charge a room. Totals are computed
-- upstream by the service-role route (the trust boundary) and passed in; this function only
-- guarantees atomicity. The reservation's canonical total is re-synced by the route
-- (recalcResTotalServer) AFTER a successful ROOM order.
create or replace function public.fn_pos_create_order(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order    public.restaurant_orders;
  v_item     jsonb;
  v_folio_id uuid;
  v_tenant   uuid := (p->>'tenant_id')::uuid;
begin
  insert into public.restaurant_orders (
    tenant_id, order_type, reservation_id, room_number, guest_id, table_no,
    subtotal_bdt, vat_bdt, service_charge_bdt, discount_bdt, grand_total_bdt,
    payment_status, payment_method, fiscal_day, status,
    created_by_id, created_by_name, idempotency_key
  ) values (
    v_tenant, p->>'order_type', nullif(p->>'reservation_id','')::uuid,
    p->>'room_number', nullif(p->>'guest_id','')::uuid, p->>'table_no',
    (p->>'subtotal_bdt')::numeric, (p->>'vat_bdt')::numeric, (p->>'service_charge_bdt')::numeric,
    (p->>'discount_bdt')::numeric, (p->>'grand_total_bdt')::numeric,
    p->>'payment_status', p->>'payment_method', p->>'fiscal_day', coalesce(p->>'status','OPEN'),
    nullif(p->>'created_by_id','')::bigint, p->>'created_by_name', nullif(p->>'idempotency_key','')::uuid
  ) returning * into v_order;

  for v_item in select elem from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) as t(elem)
  loop
    insert into public.restaurant_order_items (
      tenant_id, order_id, menu_item_id, name, qty, unit_price_bdt, vat_rate, line_total_bdt, notes
    ) values (
      v_tenant, v_order.id, nullif(v_item->>'menu_item_id','')::uuid,
      coalesce(v_item->>'name','Item'), (v_item->>'qty')::numeric,
      (v_item->>'unit_price_bdt')::numeric, coalesce((v_item->>'vat_rate')::numeric, 0),
      (v_item->>'line_total_bdt')::numeric, v_item->>'notes'
    );
  end loop;

  if p->>'order_type' = 'ROOM' and nullif(p->>'reservation_id','') is not null then
    insert into public.folios (tenant_id, room_number, reservation_id, description, category, amount, added_by_id, added_by_name)
    values (v_tenant, p->>'room_number', (p->>'reservation_id')::uuid,
            'Restaurant ' || v_order.order_no, 'Restaurant', (p->>'grand_total_bdt')::numeric,
            nullif(p->>'created_by_id','')::bigint, p->>'created_by_name')
    returning id into v_folio_id;
    update public.restaurant_orders set folio_id = v_folio_id where id = v_order.id;
  end if;

  return jsonb_build_object('id', v_order.id, 'order_no', v_order.order_no,
                            'grand_total_bdt', v_order.grand_total_bdt, 'folio_id', v_folio_id);
end;
$$;

revoke all on function public.fn_pos_create_order(jsonb) from public, anon, authenticated;
grant execute on function public.fn_pos_create_order(jsonb) to service_role;

commit;
