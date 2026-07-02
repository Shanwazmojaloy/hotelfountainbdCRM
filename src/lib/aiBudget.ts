// ─────────────────────────────────────────────────────────────────────────────
// Lumea — per-tenant AI token budget (Phase A, G5)
//
// Pairs with supabase/migrations/20260702_tenant_ai_usage.sql. FAIL-OPEN by
// design: if the migration hasn't run, the DB is unreachable, or the tenant has
// no cap set (ai_daily_token_cap NULL), AI calls proceed unrestricted — this
// layer must never take down a business flow. It only blocks when a cap is
// explicitly set AND today's usage has reached it.
//
// Usage in an AI route:
//   const budget = await checkAiBudget();            // home tenant, or pass a tenant id
//   if (!budget.allowed) { /* degrade: heuristic fallback / 429 */ }
//   ... call Anthropic ...
//   recordAiUsage(undefined, data.usage);            // fire-and-forget
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const HOME_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const dhakaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function svc() {
  return createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface AiBudget {
  allowed: boolean;
  used: number;        // tokens_in + tokens_out consumed today
  cap: number | null;  // null = unlimited
}

export async function checkAiBudget(tenantId: string = HOME_TENANT): Promise<AiBudget> {
  if (!SB_SERVICE_KEY) return { allowed: true, used: 0, cap: null };
  try {
    const sb = svc();
    const day = dhakaToday();
    const [capRes, useRes] = await Promise.all([
      sb.from('tenants').select('ai_daily_token_cap').eq('id', tenantId).limit(1),
      sb.from('tenant_ai_usage').select('tokens_in, tokens_out').eq('tenant_id', tenantId).eq('usage_day', day).limit(1),
    ]);
    // Column/table missing (migration not applied) surfaces as an error → fail open.
    if (capRes.error || useRes.error) return { allowed: true, used: 0, cap: null };
    const cap = capRes.data?.[0]?.ai_daily_token_cap ?? null;
    const u = useRes.data?.[0];
    const used = u ? (Number(u.tokens_in) || 0) + (Number(u.tokens_out) || 0) : 0;
    return { allowed: cap == null || used < cap, used, cap };
  } catch {
    return { allowed: true, used: 0, cap: null };
  }
}

/** Fire-and-forget accumulation of an Anthropic response's `usage` block. Never throws. */
export function recordAiUsage(
  tenantId: string = HOME_TENANT,
  usage?: { input_tokens?: number; output_tokens?: number } | null,
): void {
  if (!SB_SERVICE_KEY || !usage) return;
  try {
    void svc()
      .rpc('consume_ai_budget', {
        p_tenant_id: tenantId,
        p_tokens_in: Number(usage.input_tokens) || 0,
        p_tokens_out: Number(usage.output_tokens) || 0,
      })
      .then(({ error }) => {
        if (error) console.warn('[aiBudget] usage not recorded:', error.message);
      });
  } catch { /* never block the caller on telemetry */ }
}
