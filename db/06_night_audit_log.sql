-- 06_night_audit_log.sql
-- Night-audit "Closing Complete" snapshot table. APPLIED LIVE 2026-06-09 to Bridge Booking
-- (mynwfkgksqqwlqowlscj) via migration `create_night_audit_log`. Kept here for the record.
--
-- One canonical close row per tenant/day (upserted). closed_at is the cutoff the Reports
-- "fresh" post-close view uses to show only NEW collections (tx.created_at > closed_at),
-- NEW check-ins/outs (movement date > audit_date), and current outstanding dues.
--
-- SECURITY: tenant-scoped SELECT only (browser via current_tenant_id() GUC). NO insert/update
-- policy — writes go exclusively through the service-role route /api/crm/close-day.

create table if not exists public.night_audit_log (
  id uuid default gen_random_uuid() primary key,
  audit_date date not null,
  closed_at timestamptz not null default now(),
  closed_by text,
  total_checkins integer default 0,
  total_checkouts integer default 0,
  total_collections numeric(14,2) default 0,
  carried_over_dues numeric(14,2) default 0,
  rooms_occupied integer default 0,
  rooms_vacant integer default 0,
  notes text,
  tenant_id uuid,
  status text default 'closed' check (status in ('closed','reopened'))
);

create unique index if not exists uq_nal_tenant_date on public.night_audit_log(tenant_id, audit_date);
create index if not exists idx_nal_tenant_date on public.night_audit_log(tenant_id, audit_date desc, closed_at desc);

alter table public.night_audit_log enable row level security;

drop policy if exists nal_tenant_read on public.night_audit_log;
create policy nal_tenant_read on public.night_audit_log
  for select using (tenant_id = current_tenant_id() or tenant_id is null);
