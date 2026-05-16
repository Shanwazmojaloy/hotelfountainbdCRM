// ─────────────────────────────────────────────────────────────────────────────
// DealAlert Agent  —  /api/agents/deal-alert
// Called by CEOAuditor when deal score >= 7
//
// Sends Shan an instant email with the full deal brief:
//   - Company + contact details
//   - Lead's reply verbatim
//   - CEO audit score + reasoning
//   - Recommended next action
//
// Auth: all DB ops via SECURITY DEFINER RPCs (anon key — no sb_secret_* needed)
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TENANT        = process.env.NEXT_PUBLIC_TENANT_ID    || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SHAN_EMAIL    = process.env.ALERT_EMAIL              || 'ahmedshanwaz5@gmail.com';
const SHAN_NAME     = process.env.ALERT_NAME               || 'Hotel Owner';
const SENDER_NAME   = `Lumea Deal Bot — ${process.env.HOTEL_NAME || 'Hotel Fountain'}`;
const SENDER_EMAIL  = process.env.HOTEL_SENDER_EMAIL       || 'hotellfountainbd@gmail.com';

interface DealAlertPayload {
  log_id:         string;
  lead_id:        string;
  company_name:   string;
  contact_name?:  string;
  contact_email?: string;
  reply_text:     string;
  score:          number;
  reasoning:      string;
  signals:        string[];
  next_action:    string;
}

// ── Supabase RPC helper ───────────────────────────────────────────────────────
function sbRpc(rpcName: string, params: Record<string, unknown>) {
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  const SB_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return fetch(`${SB_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
}

function scoreColor(score: number): string {
  if (score >= 9) return '#22c55e';
  if (score >= 7) return '#f59e0b';
  return '#6b7280';
}

function buildAlertHtml(p: DealAlertPayload): string {
  const signalsList = (p.signals ?? []).map(s => `<li style="padding:4px 0;color:#EEE9E2;font-size:13px">${s}</li>`).join('');
  const color = scoreColor(p.score);
  const now = new Date().toLocaleString('en-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'full', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0F14;padding:40px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#07090E;border:1px solid rgba(200,169,110,.25)">

  <!-- HEADER ALERT BANNER -->
  <tr><td style="background:linear-gradient(135deg,#1a1200,#2a1e00);padding:28px 40px;border-bottom:2px solid ${color}">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${color};margin-bottom:8px">🔥 Deal-Ready Lead Detected</div>
    <div style="font-size:26px;color:#EEE9E2;font-weight:300">${p.company_name}</div>
    <div style="font-size:12px;color:#9A907C;margin-top:4px">${p.contact_name ? `Contact: ${p.contact_name}` : 'Contact: Unknown'} · ${now}</div>
  </td></tr>

  <!-- SCORE BLOCK -->
  <tr><td style="padding:28px 40px;border-bottom:1px solid rgba(200,169,110,.1)">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:120px;text-align:center;background:rgba(0,0,0,.3);border:2px solid ${color};padding:20px 0">
          <div style="font-size:42px;font-weight:700;color:${color};line-height:1">${p.score}</div>
          <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#9A907C;margin-top:4px">CEO SCORE</div>
          <div style="font-size:10px;color:#9A907C">/ 10</div>
        </td>
        <td style="padding-left:24px;vertical-align:top">
          <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9A907C;margin-bottom:8px">CEO Reasoning</div>
          <div style="font-size:14px;color:#C8BFB0;line-height:1.75">${p.reasoning}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- BUYING SIGNALS -->
  ${signalsList ? `<tr><td style="padding:20px 40px;border-bottom:1px solid rgba(200,169,110,.08)">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#22c55e;margin-bottom:10px">✔ Buying Signals</div>
    <ul style="margin:0;padding-left:18px">${signalsList}</ul>
  </td></tr>` : ''}

  <!-- REPLY VERBATIM -->
  <tr><td style="padding:20px 40px;border-bottom:1px solid rgba(200,169,110,.08)">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9A907C;margin-bottom:10px">Their Reply</div>
    <div style="background:rgba(200,169,110,.04);border-left:3px solid ${color};padding:16px 20px;font-size:13px;color:#C8BFB0;line-height:1.8;white-space:pre-wrap">${p.reply_text.substring(0, 800)}${p.reply_text.length > 800 ? '...' : ''}</div>
  </td></tr>

  <!-- NEXT ACTION -->
  <tr><td style="padding:20px 40px;border-bottom:1px solid rgba(200,169,110,.08)">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#C8A96E;margin-bottom:10px">→ Recommended Next Action</div>
    <div style="background:rgba(200,169,110,.08);border:1px solid rgba(200,169,110,.2);padding:16px 20px;font-size:14px;color:#EEE9E2;font-weight:500">${p.next_action}</div>
  </td></tr>

  <!-- CTA BUTTONS -->
  <tr><td style="padding:28px 40px">
    <div style="margin-bottom:12px">
      <a href="mailto:${p.contact_email ?? ''}?subject=Re: ${process.env.HOTEL_NAME || 'Hotel Fountain'} Corporate Partnership"
         style="display:inline-block;background:#C8A96E;color:#07090E;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;padding:12px 28px">
        Reply Now →
      </a>
    </div>
    <div style="font-size:11px;color:#6a6a5a">
      This alert was generated automatically by the Lumea CEO Auditor agent.<br/>
      Score threshold: 7/10. This lead scored <strong style="color:${color}">${p.score}/10</strong>.
    </div>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

function buildAlertText(p: DealAlertPayload): string {
  return [
    `🔥 DEAL-READY LEAD: ${p.company_name}`,
    `CEO Score: ${p.score}/10`,
    ``,
    `REASONING: ${p.reasoning}`,
    ``,
    `BUYING SIGNALS:`,
    ...(p.signals ?? []).map(s => `  ✔ ${s}`),
    ``,
    `THEIR REPLY:`,
    `---`,
    p.reply_text.substring(0, 600),
    `---`,
    ``,
    `NEXT ACTION: ${p.next_action}`,
    ``,
    `— Lumea CEO Auditor Agent · ${process.env.HOTEL_NAME || 'Hotel Fountain BD'}`,
  ].join('\n');
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: DealAlertPayload;
  try {
    payload = await req.json() as DealAlertPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Send alert email to Shan ──────────────────────────────────────────────
  const subject = `🔥 Deal-Ready: ${payload.company_name} — Score ${payload.score}/10`;

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': (process.env.BREVO_API_KEY || '').trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: SENDER_NAME,  email: SENDER_EMAIL },
      to:          [{ email: SHAN_EMAIL, name: SHAN_NAME }],
      replyTo:     { name: SENDER_NAME,  email: SENDER_EMAIL },
      subject,
      htmlContent: buildAlertHtml(payload),
      textContent: buildAlertText(payload),
    }),
  });

  const emailOk  = brevoRes.ok;
  const brevoOut = await brevoRes.json().catch(() => ({})) as Record<string, unknown>;

  // ── Mark alert sent via SECURITY DEFINER RPC ──────────────────────────────
  if (emailOk) {
    await sbRpc('deal_mark_alert_sent', {
      p_log_id:       payload.log_id,
      p_alert_sent_at: new Date().toISOString(),
    });
  }

  // ── Log to notifications_log via SECURITY DEFINER RPC ────────────────────
  await sbRpc('deal_log_notification', {
    p_tenant_id:    TENANT,
    p_workflow:     'deal-alert',
    p_body:         `Deal-ready alert sent for ${payload.company_name} (score ${payload.score}/10). Email: ${emailOk ? 'sent' : 'failed'}`,
    p_status:       emailOk ? 'success' : 'error',
    p_triggered_by: 'agent:ceo-auditor',
  });

  return NextResponse.json({
    ok:         emailOk,
    agent:      'deal-alert',
    company:    payload.company_name,
    score:      payload.score,
    alerted_to: SHAN_EMAIL,
    messageId:  brevoOut.messageId ?? null,
    timestamp:  new Date().toISOString(),
  });
}
