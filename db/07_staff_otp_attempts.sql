-- Migration: add otp_attempts counter to staff for brute-force lockout
alter table public.staff
  add column if not exists otp_attempts integer not null default 0;
