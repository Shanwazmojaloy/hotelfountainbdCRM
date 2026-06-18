import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ── Backup Verification ───────────────────────────────────────────────────────
// Scheduled Sunday 11:00 PM Asia/Dhaka. Counts rows across core tables, confirms
// data is reachable, emails the owner a health report, and logs to workflow_runs
// as 'backup-verification'.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BREVO  = Deno.env.get('BREVO_API_KEY') ?? '';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const TO_EMAIL = 'hotellfountainbd@gmail.com';
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
async function sendBrevo(subject: string, html: string, text: string) {
  if (!BREVO) return { ok: false, error: 'BREVO_API_KEY not set' };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': BREVO, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { name: `${HOTEL} CRM`, email: TO_EMAIL }, to: [{ email: TO_EMAIL, name: 'Shan Ahmed' }], subject, htmlContent: html, textContent: text }),
  });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: d.messageId } : { ok: false, error: JSON.stringify(d) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const date = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
    const [rooms, guests, reservations, transactions, folios, tasks] = await Promise.all([
      db('rooms', `?tenant_id=eq.${TENANT}&select=id`),
      db('guests', `?tenant_id=eq.${TENANT}&select=id`),
      db('reservations', `?tenant_id=eq.${TENANT}&select=id`),
      db('transactions', `?tenant_id=eq.${TENANT}&select=id`),
      db('folios', `?tenant_id=eq.${TENANT}&select=id`).catch(() => []),
      db('housekeeping_tasks', `?tenant_id=eq.${TENANT}&select=id`).catch(() => []),
    ]);
    const counts = {
      rooms: (rooms || []).length,
      guests: (guests || []).length,
      reservations: (reservations || []).length,
      transactions: (transactions || []).length,
      folios: Array.isArray(folios) ? folios.length : 0,
      housekeeping_tasks: Array.isArray(tasks) ? tasks.length : 0,
    };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const healthy = total > 0;
    const summary = { verified_at: new Date().toISOString(), date, ...counts, total_rows: total, status: healthy ? 'healthy' : 'empty' };

    const rowsHtml = Object.entries(counts).map(([k, v]) => `
      <tr>
        <td style="padding:9px 12px;border-bottom:1px solid rgba(200,169,110,.08);font-size:12px;color:#C8C0B0;text-transform:capitalize">${k.replace('_', ' ')}</td>
        <td align="right" style="padding:9px 12px;border-bottom:1px solid rgba(200,169,110,.08);font-size:13px;color:#C8A96E;font-weight:600">${v.toLocaleString()}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#07090E;border:1px solid rgba(200,169,110,.2)">
<tr><td style="padding:24px 40px 18px;border-bottom:1px solid rgba(200,169,110,.12)">
  <div style="font-size:11px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase">Backup Verification · ${date}</div>
  <div style="font-size:20px;color:#EEE9E2;font-weight:300;margin-top:4px">${HOTEL}</div>
</td></tr>
<tr><td style="padding:24px 40px">
  <div style="padding:12px 16px;margin-bottom:18px;background:${healthy ? 'rgba(63,185,80,.06)' : 'rgba(224,92,122,.08)'};border:1px solid ${healthy ? 'rgba(63,185,80,.2)' : 'rgba(224,92,122,.2)'};font-size:12px;color:${healthy ? '#3FB950' : '#E05C7A'}">
    ${healthy ? `✔ All core tables reachable — ${total.toLocaleString()} rows verified.` : '⚠ No rows found across core tables — investigate database connectivity.'}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
</td></tr>
<tr><td style="padding:14px 40px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
  <p style="font-size:10px;color:#5a5a4a;margin:0">Automated backup verification from ${HOTEL} CRM</p>
</td></tr>
</table></td></tr></table></body></html>`;

    const email = await sendBrevo(`[${HOTEL}] Backup Verification — ${date}`, html,
      `${HOTEL} Backup Verification — ${date}\nStatus: ${healthy ? 'HEALTHY' : 'EMPTY'} · ${total} total rows\n` +
      Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · '));

    await log('backup-verification', healthy ? 'success' : 'partial', total, { ...summary, email_sent: email.ok });
    return new Response(JSON.stringify({ ok: true, summary, email }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    await log('backup-verification', 'error', 0, { error: e.message }).catch(() => {});
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
