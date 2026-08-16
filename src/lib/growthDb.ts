// ─────────────────────────────────────────────────────────────────────────────
// Hotel Growth OS — client for the SALES database.
//
// This is a DIFFERENT Supabase project from the hotel CRM on purpose. That
// database holds guest PII and money; this one holds our own B2B prospect list.
// Keeping them apart means a mistake in the sales module can never reach a
// guest record, and a future SaaS customer can never be handed a connection
// string that also sees our pipeline.
//
// Access rules:
//   - Server-side ONLY. The service key must never reach the browser bundle.
//   - anon/authenticated have NO grants on that project (RLS on, zero policies),
//     so a leaked publishable key reads nothing. The grant is the defence, not
//     the policy — see the C3 lockdown note in the CRM.
//   - Every read/write goes through /api/growth, which is owner/admin gated.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const GROWTH_URL = process.env.GROWTH_SUPABASE_URL || '';
const GROWTH_KEY = process.env.GROWTH_SUPABASE_SERVICE_KEY || '';

export function growthConfigured(): boolean {
  return Boolean(GROWTH_URL && GROWTH_KEY);
}

let cached: SupabaseClient | null = null;

export function growthDb(): SupabaseClient | null {
  if (!growthConfigured()) return null;
  if (!cached) {
    cached = createClient(GROWTH_URL, GROWTH_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

// Status vocabulary — kept in one place so the API, the UI and the DB CHECK
// constraint cannot drift apart.
export const PROSPECT_STATUSES = [
  'new', 'researching', 'contacted', 'replied', 'demo_booked',
  'demo_done', 'proposal_sent', 'negotiating', 'won', 'lost', 'unqualified',
] as const;

export const ACTIVITY_TYPES = ['call', 'whatsapp', 'email', 'meeting', 'demo', 'note', 'site_visit'] as const;

export const ACTIVITY_OUTCOMES = [
  'connected', 'no_answer', 'wrong_number', 'interested', 'not_interested',
  'callback', 'bounced', 'delivered', 'opened', 'clicked', 'replied', 'sent',
] as const;

export const DEAL_PLANS = ['starter', 'growth', 'managed'] as const;
export const DEAL_STAGES = ['proposal', 'negotiation', 'won', 'lost'] as const;

// Published pricing. The UI pre-fills a deal from these; the numbers stay
// editable because a real quote depends on room count.
export const PLAN_PRICING: Record<string, { mrr: number; setup: number; label: string }> = {
  starter: { mrr: 5000, setup: 50000, label: 'Starter' },
  growth: { mrr: 15000, setup: 50000, label: 'Growth' },
  managed: { mrr: 30000, setup: 50000, label: 'Managed Growth' },
};
