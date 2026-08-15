import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyRetention Agent  —  Supabase Edge Function (v3, white-label)
// Auth: Bearer <CRON_SECRET>  (Vercel manual trigger)
//    OR Bearer <INTERNAL_CRON_TOKEN>  (pg_cron scheduled)
// All hotel identity sourced from Supabase secrets (set per client).
// ─────────────────────────────────────────────────────────────────────────────

const TENANT     = Deno.env.get("TENANT_ID")  || "46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8";
const HOTEL_NAME = Deno.env.get("HOTEL_NAME") || "Hotel Fountain";

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return (
    auth === `Bearer ${Deno.env.get("CRON_SECRET")}` ||
    auth === `Bearer ${Deno.env.get("INTERNAL_CRON_TOKEN")}`
  );
}

function sbHeaders(key: string) {
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
  };
}

async function dbGet(base: string, key: string, table: string, query: string) {
  const res = await fetch(`${base}/${table}?${query}`, { headers: sbHeaders(key) });
  if (!res.ok) throw new Error(`GET ${table} failed: ${await res.text()}`);
  return res.json();
}

async function dbPost(base: string, key: string, table: string, body: object) {
  const res = await fetch(`${base}/${table}`, {
    method: "POST", headers: sbHeaders(key), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${table} failed: ${await res.text()}`);
}

async function dbPatch(base: string, key: string, table: string, filter: string, body: object) {
  const res = await fetch(`${base}/${table}?${filter}`, {
    method: "PATCH", headers: sbHeaders(key), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} failed: ${await res.text()}`);
}

Deno.serve(async (req: Request) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const BASE = `${Deno.env.get("SUPABASE_URL")}/rest/v1`;
  const KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let guests: Record<string,unknown>[];
  try {
    guests = await dbGet(BASE, KEY, "guests",
      `select=id,name,email,phone,total_stays,last_contacted,marketing_opt_out` +
      `&tenant_id=eq.${TENANT}` +
      `&total_stays=gte.1` +
      `&or=(last_contacted.is.null,last_contacted.lt.${thirtyDaysAgo})` +
      `&marketing_opt_out=eq.false`
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const queued: Array<Record<string,unknown>> = [];

  for (const guest of guests ?? []) {
    let stays: Record<string,unknown>[] = [];
    try {
      stays = await dbGet(BASE, KEY, "reservations",
        `select=check_in,check_out,room_type,total_amount` +
        `&tenant_id=eq.${TENANT}&guest_id=eq.${guest.id}&order=check_out.desc&limit=2`
      );
    } catch { stays = []; }

    const ltv = stays.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const lastStay = stays[0]?.check_out as string | null ?? null;
    const daysSinceStay = lastStay
      ? Math.floor((Date.now() - new Date(lastStay).getTime()) / 86400000)
      : 999;

    const tier =
      (guest.total_stays as number) >= 5 || ltv > 50000 ? "VIP"
      : daysSinceStay > 90 ? "Lapsed"
      : "Regular";

    const channel = tier === "VIP" ? "email+sms" : tier === "Lapsed" ? "sms" : "email";
    const message =
      tier === "VIP"
        ? `Dear ${guest.name}, as one of our most valued guests, we'd love to welcome you back to ${HOTEL_NAME}. Enjoy a complimentary room upgrade on your next stay. Book via WhatsApp or call us directly.`
        : tier === "Lapsed"
        ? `Dear ${guest.name}, we miss you at ${HOTEL_NAME}! Return this month and enjoy a special discount. Reply YES for details.`
        : `Dear ${guest.name}, thank you for choosing ${HOTEL_NAME}. We hope to see you again soon — your preferred room is ready for you.`;

    try {
      await dbPost(BASE, KEY, "review_queue", {
        tenant_id: TENANT, type: "retention_outreach", guest_id: guest.id,
        content: message, tier, channel, status: "pending_approval",
        auto_send: false, created_at: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }

    try {
      await dbPatch(BASE, KEY, "guests", `id=eq.${guest.id}`, {
        last_contacted: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }

    queued.push({ guest: guest.name, tier, channel });
  }

  try {
    await dbPost(BASE, KEY, "notifications_log", {
      tenant_id: TENANT, workflow: "guest-retention",
      body: `Retention run complete: ${queued.length} drafts queued for approval.`,
      status: "success", triggered_by: "cron:weekly-retention",
    });
  } catch { /* non-fatal */ }

  return new Response(
    JSON.stringify({ ok: true, queued_count: queued.length, guests: queued }),
    { headers: { "Content-Type": "application/json" } }
  );
});
