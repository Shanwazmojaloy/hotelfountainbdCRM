import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Brevo Bounce Webhook — Supabase Edge Function (2026-06-24, Fix #2)
// Captures Brevo delivery events that NEVER reach Gmail and auto-quarantines the
// matching corporate_leads row so the outreach-bot stops re-sending to dead
// mailboxes (e.g. valid domain + dead inbox, which the MX guard cannot catch).
//
// Auth: custom shared-secret via ?key=<INTERNAL_CRON_TOKEN> (Brevo cannot send a
// Supabase JWT, so verify_jwt is false and we check the token ourselves).
// Register in Brevo: Transactional > Settings > Webhook, events = hard_bounce,
// blocked, invalid_email, error. URL:
//   https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/brevo-bounce-webhook?key=<INTERNAL_CRON_TOKEN>

const TENANT = Deno.env.get("TENANT_ID") || "46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8";
const HARD_EVENTS = new Set(["hard_bounce", "invalid_email", "blocked", "error"]);

function authorized(req: Request): boolean {
  const expected = Deno.env.get("INTERNAL_CRON_TOKEN") || Deno.env.get("CRON_SECRET");
  if (!expected) return false; // fail closed
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("x-webhook-key");
  return key === expected;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch { payload = {}; }
  // Brevo may send a single event object or (rarely) an array.
  const events: Array<Record<string, unknown>> = Array.isArray(payload) ? payload as any[] : [payload as Record<string, unknown>];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const handled: Array<Record<string, unknown>> = [];
  for (const ev of events) {
    const event = String(ev?.event ?? "").toLowerCase();
    const email = String(ev?.email ?? "").toLowerCase().trim();
    if (!email) continue;
    if (!HARD_EVENTS.has(event)) { handled.push({ email, event, action: "ignored" }); continue; }

    const reason = String(ev?.reason ?? ev?.["message-id"] ?? "").slice(0, 140);
    const { data, error } = await supabase
      .from("corporate_leads")
      .update({
        status: "bounced_invalid",
        notes: `[BREVO-${event.toUpperCase()} ${new Date().toISOString().slice(0,16)}: ${reason}]`,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", TENANT)
      .ilike("contact_email", email)
      .neq("status", "bounced_invalid")
      .select("id");
    handled.push({ email, event, action: error ? `error:${error.message}` : `quarantined:${(data?.length ?? 0)}` });
  }

  return new Response(JSON.stringify({ ok: true, received: events.length, handled }), { headers: { "Content-Type": "application/json" } });
});
