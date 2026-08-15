import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendMail } from '../_shared/mailer.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

const SB_URL   = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TENANT   = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_EMAIL = Deno.env.get('CRM_FROM_EMAIL') ?? 'reservations@fountainbd.com';  // gmail.com is NOT a verified Resend domain - verified by live invoke 2026-08-15 (H-12)
const TO_EMAIL = 'shanwazahmed@fountainbd.com';
const HOTEL    = 'Hotel Fountain BD';

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function dbGet(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`DB ${r.status}: ${await r.text()}`);
  return r.json();
}

async function logRun(workflowName: string, status: string, records: number, summary: object) {
  await fetch(`${SB_URL}/rest/v1/workflow_runs`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ workflow_name: workflowName, status, records_processed: records, summary, tenant_id: TENANT }),
  }).catch(() => {});
}

Deno.serve(async (req: Request) => {
  let mailResult: { ok: boolean; error?: string } | null = null;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // Parse mode BEFORE try so catch block has access
  let mode = 'weekly';
  try { const b = await req.json(); mode = b?.mode || 'weekly'; } catch { /* default weekly */ }

  const workflowName = mode === 'monthly' ? 'monthly-report' : 'weekly-summary';
  const label        = mode === 'monthly' ? 'Monthly Report' : 'Weekly Summary';

  try {
    const now      = new Date();
    const dhakaMs  = now.getTime() + 6 * 3600000;
    const dhakaDate = new Date(dhakaMs).toISOString().slice(0, 10);

    let periodStart: string;
    if (mode === 'monthly') {
      const d = new Date(dhakaMs);
      periodStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    } else {
      periodStart = new Date(dhakaMs - 7 * 86400000).toISOString().slice(0, 10);
    }

    const startUtc = new Date(`${periodStart}T00:00:00+06:00`).toISOString();
    const endUtc   = new Date(`${dhakaDate}T23:59:59+06:00`).toISOString();

    const txs = await dbGet(
      `transactions?tenant_id=eq.${TENANT}&created_at=gte.${startUtc}&created_at=lte.${endUtc}&select=amount,type`
    );
    const revenue = (txs ?? []).reduce((a: number, t: any) => a + (+t.amount || 0), 0);

    const reservations = await dbGet(
      `reservations?tenant_id=eq.${TENANT}&check_in=gte.${periodStart}&check_in=lte.${dhakaDate}&select=id,status`
    );
    const checkins = (reservations ?? []).filter((r: any) => ['CHECKED_IN','CHECKED_OUT'].includes(r.status)).length;
    const pending  = (reservations ?? []).filter((r: any) => r.status === 'RESERVED').length;

    const summary = { mode, period_start: periodStart, period_end: dhakaDate, revenue,
      transactions: (txs ?? []).length, reservations: (reservations ?? []).length, checkins, pending };

    // Always attempt the send; a missing key surfaces in mailResult, not as a silent
    // skip. Was `if (BREVO)`. Audit 2026-08-15 H-12.
    {
      const subject = `[${HOTEL}] ${label} — ${periodStart} to ${dhakaDate}`;
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#07090E;border:1px solid rgba(200,169,110,.2)">
<tr><td style="padding:24px 40px 18px;border-bottom:1px solid rgba(200,169,110,.12)">
  <div style="font-size:11px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase">${label} · ${periodStart} → ${dhakaDate}</div>
  <div style="font-size:20px;color:#EEE9E2;font-weight:300;margin-top:4px">${HOTEL}</div>
</td></tr>
<tr><td style="padding:28px 40px">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12);width:48%">
  <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Period Revenue</div>
  <div style="font-size:26px;color:#C8A96E;font-weight:300;margin-top:4px">৳${revenue.toLocaleString()}</div>
  <div style="font-size:11px;color:#9A907C;margin-top:4px">${(txs ?? []).length} transactions</div>
</td><td style="width:16px"></td>
<td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12);width:48%">
  <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Reservations</div>
  <div style="font-size:26px;color:#EEE9E2;font-weight:300;margin-top:4px">${(reservations ?? []).length}</div>
  <div style="font-size:11px;color:#9A907C;margin-top:4px">${checkins} stayed · ${pending} upcoming</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:14px 40px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
  <p style="font-size:10px;color:#5a5a4a;margin:0">Automated report from ${HOTEL} CRM</p>
</td></tr></table></td></tr></table></body></html>`;

      // Resend via the shared mailer, result kept. Audit 2026-08-15 H-12.
      mailResult = await sendMail({
        to: TO_EMAIL,
        subject,
        html,
        text: `${HOTEL} ${label}\n${periodStart} → ${dhakaDate}\nRevenue: ৳${revenue.toLocaleString()} (${(txs ?? []).length} txns)\nReservations: ${(reservations ?? []).length} (${checkins} stayed, ${pending} upcoming)`,
        fromName: `${HOTEL} CRM`,
        fromEmail: SENDER_EMAIL,
      });
      if (!mailResult.ok) console.error('[wf-period-reports] send failed:', mailResult.error);
    }

    await logRun(
      workflowName,
      mailResult === null || mailResult.ok ? 'success' : 'partial',
      (txs ?? []).length,
      mailResult === null ? summary : { ...summary, email_sent: mailResult.ok, email_error: mailResult.error ?? null },
    );
    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    await logRun(workflowName, 'error', 0, { error: e.message });
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
