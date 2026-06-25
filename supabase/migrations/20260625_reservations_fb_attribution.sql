-- 20260625_reservations_fb_attribution.sql
-- Meta CAPI attribution columns on reservations (additive, nullable, RLS-neutral).
--   fbp / fbc           : Meta browser click-attribution cookies captured at booking time
--                         (/api/book), reused to send a settled server-side Purchase later.
--   fb_purchase_sent_at : idempotency stamp so the CRM payment path fires Purchase exactly once.
-- Writes happen via the service role only (public booking + CRM payment routes); anon has no
-- INSERT/UPDATE on reservations, so no policy/grant change is required. SECURITY INVOKER N/A
-- (table columns, not a view). No backfill needed.

alter table public.reservations
  add column if not exists fbp text,
  add column if not exists fbc text,
  add column if not exists fb_purchase_sent_at timestamptz;

comment on column public.reservations.fbp is 'Meta _fbp cookie captured at website booking (CAPI attribution).';
comment on column public.reservations.fbc is 'Meta _fbc cookie captured at website booking (CAPI attribution).';
comment on column public.reservations.fb_purchase_sent_at is 'Set when the settled CAPI Purchase was sent; prevents double-fire.';
