// Server-side helper that invokes a Supabase Edge Function workflow.
// Used by the /api/agents/* cron routes so Vercel Cron can fire the same
// edge functions the CRM Settings "Run" buttons call.
//
// The anon key is the public client key (already embedded in crm.html); it is
// safe to use here. Override via SUPABASE_URL / SUPABASE_ANON_KEY env vars.

const BASE =
  process.env.SUPABASE_URL ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';

const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bndma2drc3Fxd2xxb3dsc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODc3OTMsImV4cCI6MjA4NTQ2Mzc5M30.J6-Oc_oAoPDUAytj03e8wh50lIHLIXzmFhuwizTRiow';

export interface TriggerResult {
  status: number;
  ok: boolean;
  data: unknown;
}

export async function triggerEdgeFunction(
  slug: string,
  body: Record<string, unknown> = {},
): Promise<TriggerResult> {
  const r = await fetch(`${BASE}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}
