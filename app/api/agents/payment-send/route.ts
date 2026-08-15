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
import { sendMail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TENANT       = process.env.NEXT_PUBLIC_TENANT_ID   || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_NAME  = 'Shan | Lumea';
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
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
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
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
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

  // ── CLAIM the send (atomic, once per lead) ────────────────────────────────
  // This route emails the hotel's bKash number and EBL account 1241440007466. Two
  // things used to be wrong at once (audit 2026-08-15 H-8 / M-16):
  //
  //   1. No send-once guard. intake_mark_lead_payment_pending ran AFTER the send and
  //      its result was never read, so ceo-auditor's GET re-audit path — or any retry
  //      of reply-intake-poll, which only marks messages \Seen after its whole loop —
  //      re-sent banking details to the same prospect on every pass.
  //
  //   2. payload.contact_email won. That value originates in an SMTP `From:` header
  //      (reply-intake), which nothing authenticates: no SPF, no DKIM, no ARC check
  //      anywhere in this codebase. A caller could therefore choose the recipient.
  //
  // claim_payment_send() fixes both in one statement: UPDATE ... WHERE payment_sent_at
  // IS NULL RETURNING contact_email. The first caller to take the row gets the address
  // — read from the database, not the request — and everyone after gets zero rows.
  const claimRes = await sbRpc('claim_payment_send', { p_lead_id: payload.lead_id });
  if (!claimRes.ok) {
    console.error('[payment-send] claim failed:', claimRes.status, await claimRes.text().catch(() => ''));
    return NextResponse.json({ error: 'Could not claim this lead for sending' }, { status: 502 });
  }
  const claimRows = await claimRes.json().catch(() => null) as
    Array<{ contact_email?: string; company_name?: string; contact_name?: string }> | null;
  const claim = Array.isArray(claimRows) ? claimRows[0] : null;

  if (!claim?.contact_email) {
    // Zero rows means: already sent, or the lead has no address on file. Either way
    // this is a normal outcome, not an error — and it must NOT send.
    console.warn('[payment-send] no claim for lead', payload.lead_id, '— already sent or no contact email');
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Payment instructions were already sent for this lead, or it has no contact email on file.',
    });
  }

  const contactEmail = claim.contact_email;

  const planKey = (payload.plan ?? 'starter') as keyof typeof PLANS;
  const plan    = PLANS[planKey] ?? PLANS.starter;

  // ── Send payment instructions email ───────────────────────────────────────
  let emailOk = false;
  try {
    await sendMail({
      to: contactEmail,
      fromName: SENDER_NAME,
      replyTo: REPLY_EMAIL,
      subject: 'Your Lumea CRM is ready — payment details inside',
      html: buildPaymentHtml(payload, plan),
      text: [
        `Hi ${(claim.contact_name || payload.contact_name)?.split(' ')[0] ?? 'there'},`,
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
    });
    emailOk = true;
  } catch (e) {
    console.error('[payment-send] SMTP send error:', e);
  }

  // ── Update lead status → payment_pending ──────────────────────────────────
  if (emailOk) {
    // payment_sent_at was already set by the claim above; this only advances the
    // human-facing pipeline status.
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
