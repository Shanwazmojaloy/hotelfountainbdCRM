import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID') ?? '';
const API_TOKEN   = Deno.env.get('GREEN_API_TOKEN') ?? '';

function formatChatId(to: string): string {
  // Strip leading + and append @c.us
  const digits = to.startsWith('+') ? to.slice(1) : to;
  return `${digits}@c.us`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = await req.json();

    // Diagnostics mode: {check: true}
    if (body.check === true) {
      return new Response(
        JSON.stringify({
          green_api_configured: Boolean(INSTANCE_ID && API_TOKEN),
          instance_id_set: Boolean(INSTANCE_ID),
          api_token_set: Boolean(API_TOKEN),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { to, message } = body;
    if (!to || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, message' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!INSTANCE_ID || !API_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Green API not configured. Set GREEN_API_INSTANCE_ID and GREEN_API_TOKEN in Supabase secrets.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const chatId = formatChatId(to);
    const url = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;

    const gaResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    });

    const gaJson = await gaResp.json();

    if (!gaResp.ok) {
      return new Response(
        JSON.stringify({ error: 'Green API error', details: gaJson }),
        { status: gaResp.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, idMessage: gaJson.idMessage, chatId }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
