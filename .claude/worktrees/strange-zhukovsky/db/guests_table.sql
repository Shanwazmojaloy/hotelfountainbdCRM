create table if not exists public.guests (
  id uuid not null default gen_random_uuid(),
  name text not null,
  email text null,
  phone text null,
  id_type text null,
  id_number text null,
  address text null,
  city text null,
  country text null,
  preferences text null,
  id_image_url text null,
  outstanding_balance integer not null default 0,
  id_card text null,
  tenant_id uuid null,
  constraint guests_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_guests_phone
  on public.guests using btree (phone) tablespace pg_default;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'sync_guests_webhook'
  ) then
    create trigger sync_guests_webhook
    after insert or delete or update on public.guests
    for each row execute function sync_to_google_sheets_trigger();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_guests_updated_at'
  ) then
    create trigger trg_guests_updated_at
    before update on public.guests
    for each row execute function handle_updated_at();
  end if;
end $$;
