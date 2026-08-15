import webpush from 'npm:web-push@3.6.7';

// SECURITY 2026-08-15: a live token was hardcoded here and is redacted in this repo.
// Rotate it, set the env var in Supabase Edge Function secrets, then redeploy.
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SR     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_READY = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
// Was called unconditionally with the keys hardcoded above. web-push throws on
// empty keys, which would take the whole function down at boot instead of
// returning a diagnosable error.
if (VAPID_READY) webpush.setVapidDetails('mailto:hotellfountainbd@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!VAPID_READY) return new Response(JSON.stringify({ error: 'VAPID keys are not configured' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty */ }

    // Accept a Supabase DB-webhook payload ({type,table,record}) or a direct payload.
    const rec = (body.record as Record<string, unknown>) || {};
    const title = (body.title as string) || 'New Website Booking';
    const fallback = `${(rec.guest_name as string) || 'A guest'}${rec.room_type ? ' · ' + rec.room_type : ''}${rec.check_in ? ' · ' + String(rec.check_in).slice(0, 10) : ''}`.trim();
    const msg = (body.body as string) || fallback || 'A new booking request needs confirmation.';
    const url = (body.url as string) || '/crm.html';

    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?tenant_id=eq.${TENANT}&select=*`, {
      headers: { apikey: SR, Authorization: 'Bearer ' + SR },
    });
    const subs = await r.json();
    if (!Array.isArray(subs)) {
      return new Response(JSON.stringify({ error: 'could not load subscriptions', detail: subs }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const payload = JSON.stringify({ title, body: msg, url });
    let sent = 0;
    const dead: string[] = [];
    await Promise.all(subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }));

    for (const ep of dead) {
      await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
        method: 'DELETE', headers: { apikey: SR, Authorization: 'Bearer ' + SR },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent, dead: dead.length, total: subs.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
