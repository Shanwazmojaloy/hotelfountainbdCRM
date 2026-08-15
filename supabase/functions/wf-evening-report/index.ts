import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendMail } from '../_shared/mailer.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

const SB_URL  = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TENANT  = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const TO_EMAIL = 'shanwazahmed@fountainbd.com';
// gmail.com is NOT a verified Resend domain - a live invoke on 2026-08-15 returned
// "The gmail.com domain is not verified". fountainbd.com is verified. (H-12)
const SENDER_EMAIL = Deno.env.get('CRM_FROM_EMAIL') ?? 'reservations@fountainbd.com';
const HOTEL   = 'Hotel Fountain BD';

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

function dhakaRange() {
  // Dhaka = UTC+6. Build today's UTC start/end.
  const now = new Date();
  const dhakaMs = now.getTime() + 6 * 3600000;
  const dhakaDate = new Date(dhakaMs).toISOString().slice(0, 10);
  return {
    date: dhakaDate,
    start: new Date(`${dhakaDate}T00:00:00+06:00`).toISOString(),
    end:   new Date(`${dhakaDate}T23:59:59+06:00`).toISOString(),
  };
}

async function dbGet(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`DB ${r.status}: ${await r.text()}`);
  return r.json();
}

async function logRun(status: string, records: number, summary: object) {
  await fetch(`${SB_URL}/rest/v1/workflow_runs`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      workflow_name: 'evening-revenue',
      status,
      records_processed: records,
      summary,
      tenant_id: TENANT,
    }),
  }).catch(() => {});
}

Deno.serve(async (req: Request) => {
  let mailResult: { ok: boolean; error?: string } | null = null;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { date, start, end } = dhakaRange();

    // Revenue from transactions today
    const txs = await dbGet(
      `transactions?tenant_id=eq.${TENANT}&created_at=gte.${start}&created_at=lte.${end}&select=amount,type`
    );
    const revenue = (txs ?? []).reduce((a: number, t: any) => a + (+t.amount || 0), 0);

    // Occupied rooms via reservations
    const checkedIn = await dbGet(
      `reservations?tenant_id=eq.${TENANT}&status=eq.CHECKED_IN&select=id`
    );
    const occupied = (checkedIn ?? []).length;

    // Was a hardcoded 24. The rooms table holds 28 for this tenant (and 33 across
    // all tenants), so the literal understated the denominator and overstated
    // occupancy by ~17%. Count the real inventory, scoped to the tenant.
    const roomRows = await dbGet(`rooms?tenant_id=eq.${TENANT}&select=id`);
    const totalRooms = (roomRows ?? []).length;
    const occupancyPct = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    const summary = {
      date,
      revenue,
      transactions: (txs ?? []).length,
      occupied,
      total_rooms: totalRooms,
      occupancy_pct: occupancyPct,
    };

    // Always attempt the send; the shared mailer reports a missing RESEND_API_KEY in
    // its return value rather than silently skipping. Was `if (BREVO)`, which quietly
    // did nothing whenever that (dead) key was absent. Audit 2026-08-15 H-12.
    {
      const subject = `[${HOTEL}] Evening Report — ${date}`;
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#07090E;border:1px solid rgba(200,169,110,.2)">
<tr><td style="padding:24px 40px 18px;border-bottom:1px solid rgba(200,169,110,.12)">
  <div style="font-size:11px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase">Evening Revenue Report · ${date}</div>
  <div style="font-size:20px;color:#EEE9E2;font-weight:300;margin-top:4px">${HOTEL}</div>
</td></tr>
<tr><td style="padding:28px 40px">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
        <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Today's Revenue</div>
        <div style="font-size:28px;color:#C8A96E;font-weight:300;margin-top:4px">৳${revenue.toLocaleString()}</div>
        <div style="font-size:11px;color:#9A907C;margin-top:4px">${(txs ?? []).length} transaction${(txs ?? []).length !== 1 ? 's' : ''}</div>
      </td>
      <td style="width:16px"></td>
      <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
        <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Occupancy</div>
        <div style="font-size:28px;color:#EEE9E2;font-weight:300;margin-top:4px">${occupancyPct}%</div>
        <div style="font-size:11px;color:#9A907C;margin-top:4px">${occupied} / ${totalRooms} rooms</div>
      </td>
    </tr>
  </table>
</td></tr>
<tr><td style="padding:14px 40px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
  <p style="font-size:10px;color:#5a5a4a;margin:0">Automated report from ${HOTEL} CRM</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

      // Resend via the shared mailer, and the result is KEPT. This used to be a
      // fire-and-forget fetch to Brevo with `.catch(() => {})`, followed by an
      // unconditional logRun('success') -- so the CRM health dot stayed green while
      // the report was delivered to nobody. Audit 2026-08-15 H-12.
      mailResult = await sendMail({
        to: TO_EMAIL,
        subject,
        html,
        text: `${HOTEL} Evening Report — ${date}\nRevenue: ৳${revenue.toLocaleString()} (${(txs ?? []).length} txns)\nOccupancy: ${occupancyPct}% (${occupied}/${totalRooms} rooms)`,
        fromName: `${HOTEL} CRM`,
        fromEmail: SENDER_EMAIL,
      });
      if (!mailResult.ok) console.error('[wf-evening-report] send failed:', mailResult.error);
    }

    // 'success' only when the mail actually went. 'partial' means the figures were
    // computed but the owner never saw them -- a state worth alerting on.
    await logRun(
      mailResult === null || mailResult.ok ? 'success' : 'partial',
      (txs ?? []).length,
      mailResult === null ? summary : { ...summary, email_sent: mailResult.ok, email_error: mailResult.error ?? null },
    );
    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    await logRun('error', 0, { error: e.message });
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
