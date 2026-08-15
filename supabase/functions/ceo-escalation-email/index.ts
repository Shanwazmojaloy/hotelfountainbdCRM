import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const TO_EMAIL = 'ahmedshanwaz5@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const body = await req.json();
    const { company, subject, message, deal_value, agent, priority } = body;
    const priorityEmoji = priority === 'CRITICAL' ? '🚨' : priority === 'HIGH' ? '🔥' : '📋';

    const emailHtml = `<!DOCTYPE html><html><head><style>
body{font-family:Arial,sans-serif;background:#F9F7F2;margin:0;padding:20px}
.wrap{max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.hdr{background:#1A1816;color:#C5A059;padding:24px;text-align:center}
.hdr h1{margin:0;font-size:20px;letter-spacing:1px;font-family:Georgia,serif}
.hdr p{margin:4px 0 0;color:#888;font-size:13px}
.bdy{padding:24px}
.badge{display:inline-block;background:#C5A059;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:16px}
.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:4px}
.val{font-size:15px;color:#2D2A26;font-weight:500;margin-bottom:16px}
.deal{background:#F4F1EA;border-left:3px solid #C5A059;padding:12px 16px;border-radius:0 4px 4px 0;margin:16px 0}
.amt{font-size:26px;font-weight:700;color:#C5A059;font-family:monospace}
.btn{display:block;background:#C5A059;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;font-size:15px}
.ftr{background:#F4F1EA;padding:16px 24px;text-align:center;font-size:12px;color:#888}
</style></head><body>
<div class="wrap">
<div class="hdr"><h1>🏨 HOTEL FOUNTAIN BD</h1><p>Lumea CRM — ${subject}</p></div>
<div class="bdy">
<div class="badge">${priorityEmoji} ${priority ?? 'NORMAL'}</div>
<div class="lbl">From Agent</div><div class="val">${agent ?? 'lumea-visual'}</div>
<div class="lbl">Subject</div><div class="val">${subject}</div>
${deal_value && Number(deal_value) > 0 ? `<div class="deal"><div class="lbl">Value</div><div class="amt">৳${Number(deal_value).toLocaleString()}</div></div>` : ''}
<div class="lbl">Details</div><div class="val" style="white-space:pre-wrap">${message}</div>
<a href="https://supabase.com/dashboard/project/mynwfkgksqqwlqowlscj" class="btn">→ Open Lumea Dashboard</a>
</div>
<div class="ftr">Lumea CRM — Hotel Fountain BD | Nikunja-02, Dhaka 1229<br/>Automated alert. Action required.</div>
</div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Lumea CRM <onboarding@resend.dev>',
        to: [TO_EMAIL],
        subject: `${priorityEmoji} [LUMEA] ${subject}`,
        html: emailHtml
      })
    });

    const data = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: data }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, id: data.id }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
