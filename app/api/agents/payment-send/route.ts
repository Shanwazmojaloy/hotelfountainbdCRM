// ─────────────────────────────────────────────────────────────────────────────
// PaymentSend Agent  —  /api/agents/payment-send
// Called by deal-alert when a lead scores ≥7 (deal_ready)
//
// Sends Brevo payment instruction email directly to the LEAD (not Shan).
// Marks lead status as 'payment_pending' in Supabase.
//
// Body: { lead_id, company_name, contact_name?, contact_email?, plan? }
// Auth: CRON_SECRET Bearer token
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TENANT       = process.env.NEXT_PUBLIC_TENANT_ID   || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_NAME  = 'Shan | Lumea';
const SENDER_EMAIL = process.env.HOTEL_SENDER_EMAIL      || 'hotellfountainbd@gmail.com';
// replies@fountainbd.com → MX → inbound handler → /api/agents/reply-intake
const REPLY_EMAIL  = process.env.REPLY_EMAIL             || 'replies@fountainbd.com';

interface PaymentSendPayload {
  lead_id:        string;
  company_name:   string;
  contact_name?:  string;
  contact_email?: string;
  plan?:          'starter' | 'growth' | 'full';
}

const PLANS = {
  starter: { setup: '৳15,000', monthly: '৳1,500', label: 'Starter' },
  growth:  { setup: '৳25,000', monthly: '৳3,500', label: 'Growth'  },
  full:    { setup: '৳40,000', monthly: '৳7,000', label: 'Full'    },
};

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

// ── HTML email builder ────────────────────────────────────────────────────────
function buildPaymentHtml(p: PaymentSendPayload, plan: (typeof PLANS)['starter']): string {
  const firstName = p.contact_name?.split(' ')[0] ?? 'there';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:40px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border:1px solid #EAE6DD">

  <!-- HEADER -->
  <tr><td style="background:#1A1209;padding:32px 40px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#C8A96E;margin-bottom:8px">LUMEA AI HOTEL CRM</div>
    <div style="font-size:22px;color:#FFFFFF;font-weight:300">Your Lumea subscription is ready</div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:36px 40px">
    <p style="font-size:15px;color:#2D2D2D;line-height:1.7;margin:0 0 24px">
      Hi ${firstName},<br/><br/>
      Thank you for your interest in Lumea. Your spot on the
      <strong>${plan.label}</strong> plan is reserved. Here's how to
      activate your hotel dashboard today:
    </p>

    <!-- PLAN BOX -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F8F6F0;border:1px solid #EAE6DD;margin-bottom:28px">
      <tr><td style="padding:20px 24px">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;
          color:#9A907C;margin-bottom:12px">Your Plan — ${plan.label}</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#5D5346">One-time Setup Fee</td>
            <td style="font-size:15px;font-weight:700;color:#1A1209;text-align:right;
              font-family:'Courier New',monospace">${plan.setup}</td>
          </tr>
          <tr><td style="height:8px" colspan="2"></td></tr>
          <tr>
            <td style="font-size:13px;color:#5D5346">Monthly Subscription</td>
            <td style="font-size:15px;font-weight:700;color:#1A1209;text-align:right;
              font-family:'Courier New',monospace">${plan.monthly}/mo</td>
          </tr>
          <tr><td style="height:12px" colspan="2"></td></tr>
          <tr><td colspan="2"
            style="border-top:1px solid #EAE6DD;padding-top:12px;
              font-size:12px;color:#C8A96E;font-weight:600">
            ✓ First month FREE — you only pay the setup fee today
          </td></tr>
        </table>
      </td></tr>
    </table>

    <!-- PAYMENT OPTIONS HEADER -->
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;
      color:#9A907C;margin-bottom:16px">Payment Options</div>

    <!-- bKash -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#E8F5E9;border:1px solid #C8E6C9;margin-bottom:12px">
      <tr><td style="padding:16px 20px">
        <div style="font-size:12px;font-weight:700;color:#2E7D32;margin-bottom:6px">
          🟢 bKash — fastest (5-minute activation)
        </div>
        <div style="font-size:13px;color:#1B5E20;font-family:'Courier New',monospace;line-height:1.8">
          Send Money → <strong>01322-840799</strong><br/>
          Reference: ${p.company_name} ${plan.label}
        </div>
      </td></tr>
    </table>

    <!-- Bank -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#FFF8E1;border:1px solid #FFE082;margin-bottom:12px">
      <tr><td style="padding:16px 20px">
        <div style="font-size:12px;font-weight:700;color:#F57F17;margin-bottom:6px">
          🏦 Bank Transfer (EBL)
        </div>
        <div style="font-size:12px;color:#5D4037;font-family:'Courier New',monospace;line-height:1.8">
          Bank: Eastern Bank PLC (EBL)<br/>
          A/C: 1241440007466<br/>
          Routing: 095260918<br/>
          Reference: Lumea - ${p.company_name}
        </div>
      </td></tr>
    </table>

    <!-- Nagad -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F3E5F5;border:1px solid #CE93D8;margin-bottom:28px">
      <tr><td style="padding:16px 20px">
        <div style="font-size:12px;font-weight:700;color:#6A1B9A;margin-bottom:6px">
          💜 Nagad
        </div>
        <div style="font-size:12px;color:#4A148C;font-family:'Courier New',monospace">
          01322-840799<br/>
          Reference: ${p.company_name} Lumea
        </div>
      </td></tr>
    </table>

    <p style="font-size:14px;color:#2D2D2D;line-height:1.7;margin:0 0 20px">
      After payment, <strong>reply to this email or WhatsApp the screenshot</strong>
      to <strong>01322-840799</strong>.<br/>
      Your dashboard goes live within <strong>24 hours</strong>
      (usually within the hour).
    </p>

    <p style="font-size:13px;color:#7A7060;line-height:1.7;margin:0">
      Questions? Just reply to this email.<br/><br/>
      — Shan Ahmed<br/>
      Founder, Lumea<br/>
      <a href="tel:01322840799" style="color:#C8A96E">01322-840799</a>
    </p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#F8F6F0;padding:20px 40px;border-top:1px solid #EAE6DD">
    <div style="font-size:11px;color:#9A907C;text-align:center">
      Lumea AI Hotel CRM · Dhaka, Bangladesh<br/>
      <a href="https://lumea.fountainbd.com" style="color:#C8A96E">lumea.fountainbd.com</a>
    </div>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: PaymentSendPayload;
  try {
    payload = await req.json() as PaymentSendPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.lead_id || !payload.company_name) {
    return NextResponse.json({ error: 'Missing required: lead_id, company_name' }, { status: 400 });
  }

  // ── Resolve contact email if not provided ─────────────────────────────────
  let contactEmail = payload.contact_email;
  if (!contactEmail) {
    const res = await sbRpc('get_lead_contact_email', { p_lead_id: payload.lead_id });
    if (res.ok) {
      const data = await res.json().catch(() => null) as Array<{ contact_email?: string }> | null;
      contactEmail = Array.isArray(data) ? (data[0]?.contact_email ?? '') : '';
    }
  }

  if (!contactEmail) {
    return NextResponse.json({
      error: 'No contact email found for this lead — update the lead record first',
    }, { status: 422 });
  }

  const planKey = (payload.plan ?? 'starter') as keyof typeof PLANS;
  const plan    = PLANS[planKey] ?? PLANS.starter;

  // ── Send payment instructions email ───────────────────────────────────────
  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': (process.env.BREVO_API_KEY || '').trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: SENDER_NAME,  email: SENDER_EMAIL },
      to:          [{ email: contactEmail, name: payload.contact_name ?? payload.company_name }],
      replyTo:     { name: SENDER_NAME,  email: REPLY_EMAIL },
      subject:     'Your Lumea CRM is ready — payment details inside',
      htmlContent: buildPaymentHtml(payload, plan),
      textContent: [
        `Hi ${payload.contact_name?.split(' ')[0] ?? 'there'},`,
        '',
        `Thank you for your interest in Lumea.`,
        '',
        `Plan: ${plan.label}`,
        `Setup (one-time): ${plan.setup}`,
        `Monthly: ${plan.monthly}/mo`,
        `First month FREE — you only pay setup today.`,
        '',
        `PAYMENT OPTIONS:`,
        `• bKash: 01322-840799 (Send Money)`,
        `  Reference: ${payload.company_name} ${plan.label}`,
        `• Bank (EBL): A/C 1241440007466 | Routing 095260918`,
        `  Reference: Lumea - ${payload.company_name}`,
        `• Nagad: 01322-840799`,
        '',
        `After payment, reply to this email or WhatsApp 01322-840799 with your screenshot.`,
        `Activation within 24 hours.`,
        '',
        `— Shan | Lumea | 01322-840799`,
      ].join('\n'),
    }),
  });

  const emailOk = brevoRes.ok;

  // ── Update lead status → payment_pending ──────────────────────────────────
  if (emailOk) {
    await sbRpc('intake_mark_lead_payment_pending', { p_lead_id: payload.lead_id });
  }

  // ── Log to notifications_log ──────────────────────────────────────────────
  await sbRpc('deal_log_notification', {
    p_tenant_id:    TENANT,
    p_workflow:     'payment-send',
    p_body:         `Payment instructions sent to ${contactEmail} for ${payload.company_name} (${plan.label} plan). Email: ${emailOk ? 'sent' : 'failed'}`,
    p_status:       emailOk ? 'success' : 'error',
    p_triggered_by: 'agent:deal-alert',
  });

  return NextResponse.json({
    ok:        emailOk,
    agent:     'payment-send',
    sent_to:   contactEmail,
    company:   payload.company_name,
    plan:      planKey,
    timestamp: new Date().toISOString(),
  });
}
