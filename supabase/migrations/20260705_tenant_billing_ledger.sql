-- Lumea — tenant billing ledger (manual-invoicing substrate; NO payment gateway).
-- Migration: 20260705_tenant_billing_ledger.sql (applied to prod 2026-07-05)
--
-- Admin/service-role only. RLS enabled with NO policies → anon, authenticated,
-- AND crm_tenant are all denied by default (verified: has_table_privilege false
-- for crm_tenant). A hotel must never see billing via its tenant JWT; only the
-- service role (admin) reads/writes this.
--
-- Deliberately NO payment-gateway integration: manual bKash/bank invoicing is
-- the model for the first clients. This is the record-keeping substrate only —
-- pricing snapshots, invoice status, payment references entered by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_billing (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period         TEXT NOT NULL,                 -- 'YYYY-MM' billing period
  plan_tier      TEXT NOT NULL,                 -- snapshot at issue time
  amount_due     NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'BDT',
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','overdue','waived','void')),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at         DATE,
  paid_at        TIMESTAMPTZ,
  payment_method TEXT,                          -- 'bkash' | 'bank' | 'cash' | …
  payment_ref    TEXT,                          -- trx id / bank ref, manual entry
  notes          TEXT,
  UNIQUE (tenant_id, period)                    -- one invoice per tenant per month
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_status ON public.tenant_billing (status);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_tenant ON public.tenant_billing (tenant_id);

ALTER TABLE public.tenant_billing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_billing FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.plan_pricing (
  plan_tier      TEXT PRIMARY KEY CHECK (plan_tier IN ('starter','growth','full')),
  monthly_price  NUMERIC(12,2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'BDT',
  description    TEXT
);
ALTER TABLE public.plan_pricing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.plan_pricing FROM PUBLIC, anon, authenticated;

INSERT INTO public.plan_pricing (plan_tier, monthly_price, description) VALUES
  ('starter', 0, 'PLACEHOLDER — set real price. Basic CRM, single property.'),
  ('growth',  0, 'PLACEHOLDER — set real price. + agents, marketing, reports.'),
  ('full',    0, 'PLACEHOLDER — set real price. Everything + priority support.')
ON CONFLICT (plan_tier) DO NOTHING;

COMMIT;
