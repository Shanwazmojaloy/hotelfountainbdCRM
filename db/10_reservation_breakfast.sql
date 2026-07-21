-- 10_reservation_breakfast.sql -- "Breakfast included" flag on a booking (2026-07-21).
-- Additive boolean; reservations already carries the crm_tenant grants + tenant_isolation
-- policy, so the new column needs no extra grants. Front Office sets it on a booking; the POS
-- surfaces it on Charge-to-Room so staff know to comp the guest's breakfast.
alter table public.reservations add column if not exists breakfast_included boolean not null default false;
