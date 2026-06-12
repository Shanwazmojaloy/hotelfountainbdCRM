-- ─────────────────────────────────────────────────────────────────────────────
-- Hotel Fountain BD — Corporate Lead Pipeline
-- Migration: 20260512_corporate_leads.sql
-- Tables: corporate_leads, outreach_log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS corporate_leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8',
  company_name     TEXT NOT NULL,
  contact_name     TEXT,
  contact_title    TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  company_address  TEXT,
  company_website  TEXT,
  industry         TEXT,
  icp_score        TEXT DEFAULT 'good'    CHECK (icp_score    IN ('strong','good','partial')),
  priority         TEXT DEFAULT 'med'     CHECK (priority     IN ('high','med','low')),
  status           TEXT DEFAULT 'pending' CHECK (status       IN (
                     'pending','contacted','replied','audited',
                     'deal_ready','closed_won','not_interested')),
  last_contacted_at TIMESTAMPTZ,
  deal_score        INTEGER,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL DEFAULT '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8',
  lead_id             UUID REFERENCES corporate_leads(id) ON DELETE CASCADE,
  direction           TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  channel             TEXT NOT NULL DEFAULT 'email',
  subject             TEXT,
  body                TEXT,
  sent_at             TIMESTAMPTZ DEFAULT NOW(),
  -- CEO audit fields
  deal_score          INTEGER,
  deal_score_reason   TEXT,
  ceo_next_action     TEXT,
  is_deal_ready       BOOLEAN DEFAULT FALSE,
  audited_at          TIMESTAMPTZ,
  -- Alert tracking
  alert_sent          BOOLEAN DEFAULT FALSE,
  alert_sent_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_corporate_leads_status   ON corporate_leads(status);
CREATE INDEX IF NOT EXISTS idx_corporate_leads_tenant   ON corporate_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_log_lead_id     ON outreach_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_log_direction   ON outreach_log(direction);
CREATE INDEX IF NOT EXISTS idx_outreach_log_deal_ready  ON outreach_log(is_deal_ready) WHERE is_deal_ready = TRUE;

-- RLS
ALTER TABLE corporate_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_log    ENABLE ROW LEVEL SECURITY;

-- Service role full access (agents use service role key)
CREATE POLICY "service_role_all_leads"  ON corporate_leads  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_log"    ON outreach_log     FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA — 10 Dhaka corporate leads (Nikunja 2 / Airport corridor)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO corporate_leads
  (company_name, contact_name, contact_title, contact_email, company_address, company_website, industry, icp_score, priority)
VALUES
  ('DESCO',                    NULL,             'Head of Administration',        'info@desco.org.bd',          'Plot 22/B, Kobi Forrukh Soroni, Nikunja-2, Dhaka-1229',              'desco.org.bd',           'Utility / Engineering',   'strong',  'high'),
  ('Kazi IT Center Ltd.',      NULL,             'Admin & Operations Manager',    'admin@kaziitcenter.com',     'House 1/B, Road 12, Nikunja-2, Khilkhet, Dhaka-1229',               'kaziitcenter.com',       'BPO / IT Services',       'strong',  'high'),
  ('Universal IT',             NULL,             'HR & Admin Manager',            NULL,                         'Nikunja-2, Khilkhet, Dhaka-1229',                                   'universalit.com.bd',     'BPO / Contact Center',    'strong',  'high'),
  ('Walton Hi-Tech Industries',NULL,             'Procurement & Admin',           NULL,                         'Nikunja-2, Khilkhet, Dhaka-1229',                                   'waltonbd.com',           'Electronics / Manufacturing','strong','high'),
  ('Workspace Infotech Ltd.',  NULL,             'Office Manager',                NULL,                         'House 16, Road 12, Nikunja-2, Dhaka',                               'workspaceit.com',        'Software Engineering',    'good',    'med'),
  ('LinkTech IT',              NULL,             'HR / Admin Manager',            NULL,                         'House 07, Road 18, Nikunja-2, Dhaka-1229',                          'linktechit.com',         'IT Services',             'good',    'med'),
  ('Riseup Labs',              NULL,             'Admin Manager',                 NULL,                         'Floor 14, Tropical Alauddin Tower, Sector 3, Uttara, Dhaka-1230',   'riseuplabs.com',         'Mobile / AI',             'good',    'med'),
  ('Banglalink (VEON Group)',  NULL,             'Travel & Accommodation Coord.', NULL,                         'S.B. Plaza, Plot 37, Sector 3, Uttara, Dhaka-1230',                 'banglalink.net',         'Telecom',                 'good',    'med'),
  ('Grameenphone (Telenor)',   NULL,             'Corporate Travel Manager',      NULL,                         'GP House, Basundhara, Baridhara, Dhaka-1229',                       'grameenphone.com',       'Telecom',                 'partial', 'med'),
  ('Brainstation 23',          NULL,             'HR / Admin Manager',            NULL,                         'Dhaka (multiple offices)',                                          'brainstation23.com',     'SaaS / Fintech',          'partial', 'med')
ON CONFLICT DO NOTHING;
