-- ─────────────────────────────────────────────────────────────────────────────
-- Lumea — Multi-Tenant Registry
-- Migration: 20260515_tenants.sql
--
-- Creates the tenants table that drives single-deployment subdomain routing.
-- Each row represents one hotel property. Hotel identity env vars (HOTEL_NAME,
-- HOTEL_ADDRESS, etc.) move here so one Vercel deployment serves all tenants.
--
-- Secrets (brevo_api_key, gmail_app_password, facebook_page_token,
-- anthropic_api_key) are stored here and only readable via service role key.
-- NO anon RLS policy is added — client-side code never reads tenants directly.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. TENANTS TABLE ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenants (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT        NOT NULL UNIQUE,         -- subdomain: grandpalace → grandpalace.lumea.app
  plan_tier             TEXT        NOT NULL DEFAULT 'starter'
                                    CHECK (plan_tier IN ('starter', 'growth', 'full')),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Hotel Identity (replaces env vars) ──────────────────────────────────
  hotel_name            TEXT        NOT NULL,
  hotel_location        TEXT        NOT NULL DEFAULT '',     -- short display string
  hotel_address         TEXT        NOT NULL DEFAULT '',
  hotel_phone           TEXT        NOT NULL DEFAULT '',
  hotel_whatsapp        TEXT        NOT NULL DEFAULT '',     -- digits only, no +
  hotel_city            TEXT        NOT NULL DEFAULT '',
  hotel_room_count      INT         NOT NULL DEFAULT 24,
  hotel_description     TEXT        NOT NULL DEFAULT '',     -- used by CEO Auditor prompt
  hotel_email           TEXT        NOT NULL DEFAULT '',     -- verified Brevo sender
  sender_name           TEXT        NOT NULL DEFAULT '',     -- "Shan Ahmed — Hotel Fountain BD"
  alert_email           TEXT        NOT NULL DEFAULT '',     -- receives system alerts
  alert_name            TEXT        NOT NULL DEFAULT '',

  -- ── Secrets (service role read only) ────────────────────────────────────
  brevo_api_key         TEXT,
  gmail_user            TEXT,
  gmail_app_password    TEXT,
  facebook_page_token   TEXT,
  facebook_page_id      TEXT,
  anthropic_api_key     TEXT,
  cron_secret           TEXT        DEFAULT encode(gen_random_bytes(32), 'hex')
);

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
-- Intentionally NO anon policy — tenants config is server-side only.
-- Service role bypasses RLS by default (Supabase default behaviour).

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Authenticated users can only read their own tenant row (for future admin panel)
CREATE POLICY "tenant_self_read"
  ON public.tenants FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Deny all mutations from client (server-side only via service role)
CREATE POLICY "tenant_no_client_write"
  ON public.tenants FOR ALL
  USING (false);

-- ── 3. ENFORCE tenant_id ON EXISTING TABLES ─────────────────────────────────
-- All tables already have tenant_id uuid columns (NULL for Hotel Fountain BD).
-- Add FK constraint + NOT NULL going forward (existing NULLs exempted via CHECK).

-- rooms
ALTER TABLE bgqs_raw.rooms
  ADD CONSTRAINT rooms_tenant_id_fk
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
  NOT VALID; -- NOT VALID = skips existing NULL rows, validates new inserts only

-- guests
ALTER TABLE bgqs_raw.guests
  ADD CONSTRAINT guests_tenant_id_fk
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
  NOT VALID;

-- reservations
ALTER TABLE bgqs_raw.reservations
  ADD CONSTRAINT reservations_tenant_id_fk
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
  NOT VALID;

-- transactions
ALTER TABLE bgqs_raw.transactions
  ADD CONSTRAINT transactions_tenant_id_fk
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
  NOT VALID;

-- corporate_leads
ALTER TABLE public.corporate_leads
  ADD CONSTRAINT leads_tenant_id_fk
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
  NOT VALID;

-- ── 4. RLS POLICIES: TENANT ISOLATION ───────────────────────────────────────
-- Replaces the old static tenant_id check with dynamic per-request isolation.
-- App sets app.current_tenant_id via SET LOCAL before any query.

-- Helper: current tenant from request context
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

-- rooms RLS
DROP POLICY IF EXISTS "tenant_isolation" ON bgqs_raw.rooms;
CREATE POLICY "tenant_isolation" ON bgqs_raw.rooms
  USING (tenant_id = public.current_tenant_id() OR tenant_id IS NULL);

-- guests RLS
DROP POLICY IF EXISTS "tenant_isolation" ON bgqs_raw.guests;
CREATE POLICY "tenant_isolation" ON bgqs_raw.guests
  USING (tenant_id = public.current_tenant_id() OR tenant_id IS NULL);

-- reservations RLS
DROP POLICY IF EXISTS "tenant_isolation" ON bgqs_raw.reservations;
CREATE POLICY "tenant_isolation" ON bgqs_raw.reservations
  USING (tenant_id = public.current_tenant_id() OR tenant_id IS NULL);

-- transactions RLS
DROP POLICY IF EXISTS "tenant_isolation" ON bgqs_raw.transactions;
CREATE POLICY "tenant_isolation" ON bgqs_raw.transactions
  USING (tenant_id = public.current_tenant_id() OR tenant_id IS NULL);

-- corporate_leads RLS
DROP POLICY IF EXISTS "tenant_isolation" ON public.corporate_leads;
CREATE POLICY "tenant_isolation" ON public.corporate_leads
  USING (tenant_id = public.current_tenant_id());

-- ── 5. SEED: Hotel Fountain BD ───────────────────────────────────────────────
-- Preserve the existing UUID so no existing data breaks.

INSERT INTO public.tenants (
  id,
  slug,
  plan_tier,
  hotel_name,
  hotel_location,
  hotel_address,
  hotel_phone,
  hotel_whatsapp,
  hotel_city,
  hotel_room_count,
  hotel_description,
  hotel_email,
  sender_name,
  alert_email,
  alert_name
) VALUES (
  '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8',
  'hotelfountainbd',
  'growth',
  'Hotel Fountain BD',
  'Nikunja 2 · Dhaka · Airport Corridor',
  'House-05, Road-02, Nikunja-02, Dhaka-1229',
  '+880 1322-840799',
  '8801322840799',
  'Dhaka',
  24,
  'Hotel Fountain BD, a boutique 24-room hotel in Nikunja 2, Dhaka',
  'hotellfountainbd@gmail.com',
  'Shan Ahmed — Hotel Fountain BD',
  'ahmedshanwaz5@gmail.com',
  'Shan'
) ON CONFLICT (id) DO NOTHING;

-- Backfill existing NULL tenant_id rows to Hotel Fountain BD
UPDATE bgqs_raw.rooms        SET tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8' WHERE tenant_id IS NULL;
UPDATE bgqs_raw.guests       SET tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8' WHERE tenant_id IS NULL;
UPDATE bgqs_raw.reservations SET tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8' WHERE tenant_id IS NULL;
UPDATE bgqs_raw.transactions SET tenant_id = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8' WHERE tenant_id IS NULL;

COMMIT;

-- ✓ EXPECT: 1 tenant row
SELECT id, slug, hotel_name, plan_tier FROM public.tenants;
