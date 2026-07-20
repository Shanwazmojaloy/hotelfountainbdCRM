import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ── Competitor Monitor ────────────────────────────────────────────────────────
// Scheduled 06:00 AM Asia/Dhaka. Pulls own occupancy/pricing and (if a Gemini key
// is set) an AI snapshot of nearby Nikunja/airport hotel rates, emails the owner,
// and logs to workflow_runs as 'competitor-monitor'.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BREVO  = Deno.env.get('BREVO_API_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_EMAIL = 'hotellfountainbd@gmail.com';
const TO_EMAIL = 'shanwazahmed@fountainbd.com';
const HOTEL = 'Hotel Fountain BD';
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function db(table: string, q = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${q}`, { headers: H });
  return r.json();
}
async function log(name: string, status: string, records: number, summary: object) {
  await fetch(`${SB_URL}/rest/v1/workflow_runs`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ workflow_name: name, status, records_processed: records, summary, tenant_id: TENANT })
  }).catch(() => {});
}
async function gemini(prompt: string): Promise<string> {
  if (!GEMINI_KEY) return '';
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1200 } }) }
    );
    if (!r.ok) return '';
    const d = await r.json();
    const parts: Array<{ text?: string }> = d.candidates?.[0]?.content?.parts ?? [];
    return parts.find((p) => p.text)?.text ?? '';
  } catch { return ''; }
}
async function sendBrevo(subject: string, html: string, text: string) {
  if (!BREVO) return { ok: false, error: 'BREVO_API_KEY not set' };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': BREVO, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { name: `${HOTEL} CRM`, email: SENDER_EMAIL }, to: [{ email: TO_EMAIL, name: 'Shan Ahmed' }], subject, htmlContent: html, textContent: text }),
  });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: d.messageId } : { ok: false, error: JSON.stringify(d) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const date = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
    const rooms = await db('rooms', `?tenant_id=eq.${TENANT}&select=room_number,status,price,category`);
    const occupied = (rooms || []).filter((r: any) => r.status === 'OCCUPIED').length;
    const total = (rooms || []).length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const prices = (rooms || []).map((r: any) => +r.price || 0).filter((p: number) => p > 0);
    const avgRate = prices.length ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length) : 0;

    const intel = await gemini(
      `You are a revenue-management analyst for Hotel Fountain, a 4-star hotel in Nikunja 2, Dhaka, 5 min from Hazrat Shahjalal International Airport. ` +
      `Our average room rate is about ৳${avgRate}/night and today's occupancy is ${occupancyRate}%. ` +
      `Give a concise competitor pricing snapshot (3-5 bullet points) of comparable airport/Nikunja Dhaka hotels and ONE pricing recommendation for today. Plain text, no markdown headings.`
    );
    const intelHtml = intel
      ? intel.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
      : 'AI competitor snapshot unavailable (no GEMINI_API_KEY). Showing internal pricing only.';

    const summary = { date, occupied, total, occupancy_rate: occupancyRate, avg_rate: avgRate, ai_used: !!intel };

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#07090E;border:1px solid rgba(200,169,110,.2)">
<tr><td style="padding:24px 40px 18px;border-bottom:1px solid rgba(200,169,110,.12)">
  <div style="font-size:11px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase">Competitor Monitor · ${date}</div>
  <div style="font-size:20px;color:#EEE9E2;font-weight:300;margin-top:4px">${HOTEL}</div>
</td></tr>
<tr><td style="padding:28px 40px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
      <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Our Avg Rate</div>
      <div style="font-size:26px;color:#C8A96E;font-weight:300;margin-top:4px">৳${avgRate.toLocaleString()}</div>
    </td>
    <td style="width:16px"></td>
    <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
      <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Occupancy</div>
      <div style="font-size:26px;color:#EEE9E2;font-weight:300;margin-top:4px">${occupancyRate}%</div>
    </td>
  </tr></table>
  <div style="margin-top:18px;padding:16px 18px;background:rgba(88,166,255,.04);border:1px solid rgba(88,166,255,.15);font-size:12px;color:#C8C0B0;line-height:1.7">
    <div style="font-size:10px;color:#58A6FF;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Market Snapshot</div>
    ${intelHtml}
  </div>
</td></tr>
<tr><td style="padding:14px 40px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
  <p style="font-size:10px;color:#5a5a4a;margin:0">Automated competitor monitor from ${HOTEL} CRM</p>
</td></tr>
</table></td></tr></table></body></html>`;

    const email = await sendBrevo(`[${HOTEL}] Competitor Monitor — ${date}`, html,
      `${HOTEL} Competitor Monitor — ${date}\nOur avg rate: ৳${avgRate} · Occupancy: ${occupancyRate}%\n\n${intel || 'AI snapshot unavailable.'}`);

    await log('competitor-monitor', 'success', total, { ...summary, email_sent: email.ok });
    return new Response(JSON.stringify({ ok: true, summary, email }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    await log('competitor-monitor', 'error', 0, { error: e.message }).catch(() => {});
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
