// Native push for the Lumea mobile app via Expo Push API.
// Parallel to send-push (web/VAPID). Reads expo_push_tokens with service role.
const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SR     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty */ }

    const rec = (body.record as Record<string, unknown>) || {};
    const title = (body.title as string) || 'Lumea CRM';
    const fallback = `${(rec.guest_name as string) || 'A guest'}${rec.room_type ? ' \u00b7 ' + rec.room_type : ''}${rec.check_in ? ' \u00b7 ' + String(rec.check_in).slice(0, 10) : ''}`.trim();
    const message = (body.body as string) || fallback || 'New activity needs attention.';
    const url = (body.url as string) || '/(tabs)/dashboard';

    // explicit tokens win; otherwise load all tenant tokens
    let tokens: string[] = Array.isArray(body.tokens) ? (body.tokens as string[]) : [];
    if (!tokens.length) {
      const r = await fetch(`${SB_URL}/rest/v1/expo_push_tokens?tenant_id=eq.${TENANT}&select=token`, {
        headers: { apikey: SR, Authorization: 'Bearer ' + SR },
      });
      const rows = await r.json();
      if (Array.isArray(rows)) tokens = rows.map((x: { token: string }) => x.token).filter(Boolean);
    }
    if (!tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: 'no tokens' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const messages = tokens.map((t) => ({ to: t, sound: 'default', title, body: message, data: { url } }));
    const dead: string[] = [];
    let sent = 0;

    for (const batch of chunk(messages, 100)) {
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(batch),
      });
      const json = await resp.json().catch(() => ({}));
      const data = (json?.data ?? []) as Array<{ status: string; details?: { error?: string } }>;
      data.forEach((d, i) => {
        if (d.status === 'ok') sent++;
        else if (d.details?.error === 'DeviceNotRegistered') dead.push(batch[i].to);
      });
    }

    for (const t of dead) {
      await fetch(`${SB_URL}/rest/v1/expo_push_tokens?token=eq.${encodeURIComponent(t)}`, {
        method: 'DELETE', headers: { apikey: SR, Authorization: 'Bearer ' + SR },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent, dead: dead.length, total: tokens.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
