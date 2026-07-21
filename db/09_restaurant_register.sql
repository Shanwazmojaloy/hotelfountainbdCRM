-- ============================================================================
-- 09_restaurant_register.sql  -- Lumea Restaurant POS: register / shift (cash drawer)
-- Hotel Fountain BD CRM. Created 2026-07-21.
--
-- One OPEN shift per tenant at a time. Open with an opening float; close with a counted
-- cash amount -> the app computes expected cash (float + cash sales during the shift) and
-- the variance. Uses the crm_tenant RLS pattern (grants + tenant_isolation policy) so the
-- CRM API role can read/write -- see the folios/transactions pattern. Apply on prod
-- (owner-approved, additive, RLS-locked).
-- ============================================================================

create table if not exists public.restaurant_register_shifts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default coalesce(current_tenant_id(), '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'::uuid),
  status             text not null default 'OPEN',           -- OPEN | CLOSED
  opening_float_bdt  numeric(12,2) not null default 0,
  opened_by_id       bigint,
  opened_by_name     text,
  opened_at          timestamptz not null default now(),
  expected_cash_bdt  numeric(12,2),                           -- float + cash sales during shift (set at close)
  counted_cash_bdt   numeric(12,2),                           -- physically counted (entered at close)
  variance_bdt       numeric(12,2),                           -- counted - expected
  closed_by_id       bigint,
  closed_by_name     text,
  closed_at          timestamptz,
  fiscal_day         text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint rrs_status_chk check (status in ('OPEN','CLOSED')),
  constraint rrs_float_nonneg check (opening_float_bdt >= 0)
);

-- at most ONE open register per tenant
create unique index if not exists uq_rrs_one_open on public.restaurant_register_shifts (tenant_id) where status = 'OPEN';
create index if not exists idx_rrs_tenant_day on public.restaurant_register_shifts (tenant_id, fiscal_day);

-- reuse the shared touch-updated_at trigger fn from 08_restaurant_pos.sql
drop trigger if exists trg_rrs_touch on public.restaurant_register_shifts;
create trigger trg_rrs_touch before update on public.restaurant_register_shifts
  for each row execute function public.restaurant_touch_updated_at();

-- RLS: crm_tenant pattern (grants + tenant_isolation), mirrors folios/restaurant_orders
alter table public.restaurant_register_shifts enable row level security;
revoke all on public.restaurant_register_shifts from anon, public;
grant select, insert, update, delete on public.restaurant_register_shifts to crm_tenant, authenticated, service_role;
drop policy if exists tenant_isolation on public.restaurant_register_shifts;
create policy tenant_isolation on public.restaurant_register_shifts for all using (tenant_id = current_tenant_id());
