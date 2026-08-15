import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendMail } from '../_shared/mailer.ts';

// ── Morning Briefing ──────────────────────────────────────────────────────────
// Scheduled 07:00 AM Asia/Dhaka. Emails the owner the day's operational snapshot
// and logs to workflow_runs as 'morning-briefing' so the CRM Settings dot lights.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BREVO  = Deno.env.get('BREVO_API_KEY') ?? '';
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
async function sendBrevo(subject: string, html: string, text: string) {
  if (!BREVO) return { ok: false, error: 'BREVO_API_KEY not set' };
  // Resend via the shared mailer. Audit 2026-08-15 H-12.
  return await sendMail({ to: TO_EMAIL, subject, html, text, fromName: `${HOTEL} CRM`, fromEmail: SENDER_EMAIL });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const date = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
    const rooms = await db('rooms', `?tenant_id=eq.${TENANT}&select=room_number,status,category,price`);
    const reservations = await db('reservations', `?tenant_id=eq.${TENANT}&status=eq.CHECKED_IN&select=guest_ids,room_ids,check_in,check_out,paid_amount,total_amount`);
    const transactions = await db('transactions', `?tenant_id=eq.${TENANT}&fiscal_day=eq.${date}&select=amount,type`);

    const todayRevenue = (transactions || []).reduce((a: number, t: any) => a + (+t.amount || 0), 0);
    const occupied = (rooms || []).filter((r: any) => r.status === 'OCCUPIED').length;
    const dirty = (rooms || []).filter((r: any) => r.status === 'DIRTY').length;
    const available = (rooms || []).filter((r: any) => r.status === 'AVAILABLE').length;
    const totalRooms = (rooms || []).length;
    const inHouse = (reservations || []).length;
    const summary = { date, today_revenue: todayRevenue, occupied, dirty, available, in_house: inHouse, total_rooms: totalRooms };

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#07090E;border:1px solid rgba(200,169,110,.2)">
<tr><td style="padding:24px 40px 18px;border-bottom:1px solid rgba(200,169,110,.12)">
  <div style="font-size:11px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase">Morning Briefing · ${date}</div>
  <div style="font-size:20px;color:#EEE9E2;font-weight:300;margin-top:4px">${HOTEL}</div>
</td></tr>
<tr><td style="padding:28px 40px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
      <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">In-House Guests</div>
      <div style="font-size:28px;color:#C8A96E;font-weight:300;margin-top:4px">${inHouse}</div>
      <div style="font-size:11px;color:#9A907C;margin-top:4px">${occupied} / ${totalRooms} rooms occupied</div>
    </td>
    <td style="width:16px"></td>
    <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
      <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Rooms Available</div>
      <div style="font-size:28px;color:#3FB950;font-weight:300;margin-top:4px">${available}</div>
      <div style="font-size:11px;color:#9A907C;margin-top:4px">${dirty} need housekeeping</div>
    </td>
  </tr></table>
  <div style="margin-top:18px;padding:14px 18px;background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.1);font-size:12px;color:#9A907C">
    Revenue booked so far today: <strong style="color:#C8A96E">৳${todayRevenue.toLocaleString()}</strong>
  </div>
</td></tr>
<tr><td style="padding:14px 40px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
  <p style="font-size:10px;color:#5a5a4a;margin:0">Automated morning briefing from ${HOTEL} CRM</p>
</td></tr>
</table></td></tr></table></body></html>`;

    const email = await sendBrevo(`[${HOTEL}] Morning Briefing — ${date}`, html,
      `${HOTEL} Morning Briefing — ${date}\nIn-house: ${inHouse} · Occupied: ${occupied}/${totalRooms} · Available: ${available} · Dirty: ${dirty}\nRevenue today: ৳${todayRevenue.toLocaleString()}`);

    await log('morning-briefing', 'success', (transactions || []).length, { ...summary, email_sent: email.ok });
    return new Response(JSON.stringify({ ok: true, summary, email }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    await log('morning-briefing', 'error', 0, { error: e.message }).catch(() => {});
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
