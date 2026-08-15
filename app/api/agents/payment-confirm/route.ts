// ─────────────────────────────────────────────────────────────────────────────
// PaymentConfirm Agent  —  /api/agents/payment-confirm
//
// Shan's activation link, embedded in the deal-alert email.
// When Shan sees a payment screenshot (bKash/bank/Nagad), he opens this link.
//
// URL format:
//   /api/agents/payment-confirm?t=<single-use-uuid>
//
// Flow:
//   GET  → peek the nonce (no side effects) and render a confirmation screen
//   POST → consume the nonce ATOMICALLY, then:
//            1. call /api/admin/onboard-tenant internally (idempotent — 409 OK)
//            2. send the activation email to the client
//            3. update lead status → 'activated'
//            4. return the success page
//
// SECURITY — rewritten 2026-08-15 (audit C-6). Two defects were fixed together:
//
//   1. Auth was `?token=<ADMIN_SECRET>`, i.e. the platform Bearer token for
//      /api/admin/onboard-tenant and /api/admin/logs, emailed in plaintext and
//      therefore retained by Brevo, Gmail, Vercel access logs and browser history,
//      with no expiry. It is now a single-use, 14-day nonce scoped to ONE lead,
//      resolved server-side via consume_activation_token().
//
//   2. The side effect (tenant creation + "your dashboard is live" email to the
//      prospect) ran on GET. Any link scanner, mail-security prefetch or accidental
//      browser prefetch activated the tenant BEFORE payment was confirmed. The side
//      effect now requires an explicit POST from the confirmation screen.
//
// The activation payload is no longer carried in the URL, so it can no longer be
// edited in the address bar between the email and the click.
// ─────────────────────────────────────────────────────────────────────────────
import { logEvent } from '@/lib/audit';
import { sendMail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SENDER_NAME  = 'Shan | Lumea';
const SENDER_EMAIL = process.env.HOTEL_SENDER_EMAIL || 'hotellfountainbd@gmail.com';
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL || 'https://fountainbd.com';
const TENANT       = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  growth:  'Growth',
  full:    'Full',
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

// ── Activation email to client ────────────────────────────────────────────────
function buildActivationHtml(
  hotelName: string,
  slug: string,
  contactEmail: string,
  planLabel: string,
  contactName: string,
): string {
  const firstName  = contactName.split(' ')[0] || contactName || hotelName;
  const subdomain  = `${slug}.fountainbd.com`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:40px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0"
  style="max-width:580px;background:#FFFFFF;border:1px solid #EAE6DD">

  <!-- HEADER -->
  <tr><td style="background:#1A1209;padding:32px 40px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;
      color:#22c55e;margin-bottom:8px">✓ PAYMENT CONFIRMED</div>
    <div style="font-size:22px;color:#FFFFFF;font-weight:300">
      Your Lumea dashboard is live
    </div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:36px 40px">
    <p style="font-size:15px;color:#2D2D2D;line-height:1.7;margin:0 0 28px">
      Assalamu Alaikum ${firstName},<br/><br/>
      Payment confirmed. Your Lumea CRM for <strong>${hotelName}</strong>
      is live and ready to use.
    </p>

    <!-- DASHBOARD LINK -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F8F6F0;border:2px solid #C8A96E;margin-bottom:28px">
      <tr><td style="padding:24px;text-align:center">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;
          color:#9A907C;margin-bottom:12px">Your Dashboard</div>
        <a href="https://${subdomain}"
          style="font-size:18px;color:#C8A96E;font-weight:700;text-decoration:none">
          https://${subdomain}
        </a>
      </td></tr>
    </table>

    <!-- CREDENTIALS -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F0F7FF;border:1px solid #BBDEFB;margin-bottom:28px">
      <tr><td style="padding:20px 24px">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;
          color:#1565C0;margin-bottom:12px">Login Credentials</div>
        <div style="font-size:14px;color:#0D47A1;font-family:'Courier New',monospace;line-height:2">
          Email: <strong>${contactEmail}</strong><br/>
          Temp Password: <strong>Lumea@2026</strong>
        </div>
        <div style="font-size:11px;color:#5C6BC0;margin-top:10px">
          ⚠ Change your password after first login
        </div>
      </td></tr>
    </table>

    <!-- FIRST STEPS -->
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;
      color:#9A907C;margin-bottom:14px">First Steps</div>
    <ol style="margin:0 0 28px;padding-left:20px">
      <li style="font-size:13px;color:#2D2D2D;padding:5px 0">
        Log in and change your password
      </li>
      <li style="font-size:13px;color:#2D2D2D;padding:5px 0">
        Add your room types under <strong>Settings → Rooms</strong>
      </li>
      <li style="font-size:13px;color:#2D2D2D;padding:5px 0">
        Create your first reservation
      </li>
    </ol>

    <p style="font-size:13px;color:#7A7060;line-height:1.7;margin:0">
      I'll call you within 24 hours for a 30-minute onboarding walkthrough.<br/><br/>
      Any questions? Reply to this email or WhatsApp:<br/>
      <a href="https://wa.me/8801322840799"
        style="color:#C8A96E;font-weight:700">01322-840799</a><br/><br/>
      — Shan Ahmed<br/>
      Founder, Lumea
    </p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#F8F6F0;padding:20px 40px;border-top:1px solid #EAE6DD">
    <div style="font-size:11px;color:#9A907C;text-align:center">
      Lumea AI Hotel CRM · Dhaka, Bangladesh<br/>
      Plan: ${planLabel} ·
      <a href="https://lumea.fountainbd.com" style="color:#C8A96E">
        lumea.fountainbd.com
      </a>
    </div>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ── Success page for Shan's browser ──────────────────────────────────────────
function shanSuccessPage(
  hotelName: string,
  slug: string,
  planLabel: string,
  contactName: string,
  tenantOk: boolean,
  emailOk: boolean,
): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Client Activated — Lumea</title>
<style>
  * { box-sizing:border-box }
  body { font-family:'Helvetica Neue',sans-serif;background:#0D0F14;color:#EEE9E2;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0 }
  .card { background:#111318;border:1px solid rgba(200,169,110,.25);
    padding:40px;max-width:460px;width:100%;text-align:center }
  .icon { font-size:52px;margin-bottom:16px }
  h1 { color:#C8A96E;font-weight:300;margin:0 0 6px;font-size:22px }
  .sub { color:#9A907C;font-size:13px;margin:0 0 28px }
  .row { display:flex;justify-content:space-between;padding:10px 0;
    border-bottom:1px solid rgba(200,169,110,.08);font-size:13px }
  .row:last-child { border-bottom:none }
  .label { color:#9A907C }
  .val { color:#EEE9E2;font-weight:500 }
  .ok   { color:#22c55e }
  .fail { color:#ef4444 }
  .note { margin-top:24px;font-size:11px;color:#6a6a5a;line-height:1.6 }
</style>
</head><body>
<div class="card">
  <div class="icon">${tenantOk && emailOk ? '✅' : '⚠️'}</div>
  <h1>${hotelName}</h1>
  <div class="sub">${slug}.fountainbd.com · ${planLabel}</div>

  <div class="row">
    <span class="label">Tenant created</span>
    <span class="val ${tenantOk ? 'ok' : 'fail'}">${tenantOk ? 'Yes ✓' : 'Failed ✗'}</span>
  </div>
  <div class="row">
    <span class="label">Activation email sent</span>
    <span class="val ${emailOk ? 'ok' : 'fail'}">${emailOk ? 'Yes ✓' : 'Failed ✗'}</span>
  </div>
  <div class="row">
    <span class="label">Lead status</span>
    <span class="val ok">ACTIVATED ✓</span>
  </div>

  <div class="note">
    Next: schedule the 30-min onboarding call with<br/>
    <strong style="color:#C8A96E">${contactName || hotelName}</strong>
  </div>
</div>
</body></html>`;
}

// ── Activation payload, resolved server-side from the nonce ───────────────────
interface ActivationPayload {
  lead_id?:       string;
  plan?:          string;
  slug?:          string;
  hotel_name?:    string;
  contact_email?: string;
  contact_name?:  string;
  hotel_city?:    string;
  room_count?:    number;
}

// ── Token helpers (service-role only; activation_tokens is REVOKEd from everyone else) ──
function tokenRpc(fn: string, params: Record<string, unknown>) {
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SB_KEY) return Promise.resolve(null);
  return fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── The actual activation. Only ever reached from POST. ───────────────────────
async function runActivation(payload: ActivationPayload, requestId: string | null): Promise<Response> {
  const lead_id       = payload.lead_id       ?? '';
  const plan          = payload.plan          ?? 'starter';
  const slug          = payload.slug          ?? '';
  const hotel_name    = payload.hotel_name    ?? '';
  const contact_email = payload.contact_email ?? '';
  const contact_name  = payload.contact_name  ?? '';
  const hotel_city    = payload.hotel_city    ?? 'Dhaka';
  const room_count    = Number(payload.room_count ?? 24);

  if (!slug || !hotel_name || !contact_email) {
    return new Response('Activation payload incomplete: slug, hotel_name and contact_email are required', { status: 400 });
  }

  const planLabel = PLAN_LABELS[plan] ?? 'Starter';

  // ── Step 1: Create tenant (idempotent — 409 treated as success) ───────────
  let tenantOk = false;
  try {
    const onboardRes = await fetch(new URL('/api/admin/onboard-tenant', APP_URL).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        slug,
        hotel_name,
        hotel_location:  hotel_city,
        hotel_address:   '',
        hotel_phone:     '',
        hotel_email:     contact_email,
        sender_name:     contact_name || hotel_name,
        alert_email:     contact_email,
        alert_name:      contact_name || hotel_name,
        plan_tier:       plan,
        hotel_city,
        hotel_room_count: isNaN(room_count) ? 24 : room_count,
      }),
    });
    // 409 = slug already exists → treat as success (idempotent re-confirm)
    tenantOk = onboardRes.ok || onboardRes.status === 409;
    if (!onboardRes.ok && onboardRes.status !== 409) {
      console.error('[payment-confirm] onboard-tenant error:', await onboardRes.text());
    }
  } catch (e) {
    console.error('[payment-confirm] onboard-tenant threw:', e);
  }

  // ── Step 2: Send activation email to client ───────────────────────────────
  let emailOk = false;
  try {
    await sendMail({
      to: contact_email,
      fromName: SENDER_NAME,
      replyTo: SENDER_EMAIL,
      subject: `✓ Your Lumea dashboard is live — ${hotel_name}`,
      html: buildActivationHtml(hotel_name, slug, contact_email, planLabel, contact_name),
      text: [
          `Assalamu Alaikum ${contact_name.split(' ')[0] || contact_name || hotel_name},`,
          '',
          `Payment confirmed. Your Lumea dashboard is live:`,
          `https://${slug}.fountainbd.com`,
          '',
          `Login:`,
          `Email: ${contact_email}`,
          `Temp Password: Lumea@2026`,
          '',
          `First steps:`,
          `1. Log in and change your password`,
          `2. Add room types under Settings → Rooms`,
          `3. Create your first reservation`,
          '',
          `I'll call you within 24 hours for a 30-minute onboarding walkthrough.`,
          '',
          `— Shan | Lumea | 01322-840799`,
        ].join('\n'),
    });
    emailOk = true;
  } catch (e) {
    console.error('[payment-confirm] Brevo email threw:', e);
  }

  // ── Step 3: Update lead status → activated ────────────────────────────────
  if (lead_id) {
    await sbRpc('intake_mark_lead_activated', {
      p_lead_id:      lead_id,
      p_activated_at: new Date().toISOString(),
      p_subdomain:    `${slug}.fountainbd.com`,
    }).catch(() => null);
  }

  // ── Step 4: Log to notifications_log ─────────────────────────────────────
  await sbRpc('deal_log_notification', {
    p_tenant_id:    TENANT,
    p_workflow:     'payment-confirm',
    p_body:         `Client activated: ${hotel_name} → ${slug}.fountainbd.com | Plan: ${planLabel} | Tenant: ${tenantOk} | Email: ${emailOk}`,
    p_status:       tenantOk && emailOk ? 'success' : 'partial',
    p_triggered_by: 'shan:one-tap',
  }).catch(() => null);

  // ── Audit: status_change → activated ──────────────────────────────────────
  void logEvent({
    event_type:    'status_change',
    action_target: lead_id ? `leads:${lead_id}` : `tenants:${slug}`,
    status_code:   200,
    result:        tenantOk && emailOk ? 'success' : 'partial',
    role:          'admin',
    user_id:       'shan@fountainbd.com',
    tenant_id:     TENANT,
    request_id:    requestId,
    payload_summary: {
      flow: 'one_tap_activation',
      slug, hotel_name, plan, plan_label: planLabel,
      contact_email, contact_name, hotel_city, room_count,
      tenant_created: tenantOk, activation_email_sent: emailOk,
    },
  });

  // ── Return success page to Shan ───────────────────────────────────────────
  return new Response(
    shanSuccessPage(hotel_name, slug, planLabel, contact_name, tenantOk, emailOk),
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}

// ── Confirmation screen (GET — NO side effects) ───────────────────────────────
function confirmPage(t: string, p: ActivationPayload): string {
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Confirm activation — ${esc(p.hotel_name)}</title>
<style>
  body{margin:0;background:#07090E;color:#EEE9E2;font-family:'DM Sans',system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:520px;width:100%;background:#0D1117;border:1px solid #EAE6DD22;padding:2rem}
  h1{font-family:'Libre Baskerville',Georgia,serif;font-size:20px;margin:0 0 4px}
  .sub{color:#8b8b7a;font-size:12px;margin-bottom:20px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #EAE6DD14;font-size:13px}
  .k{color:#8b8b7a}.v{font-family:'IBM Plex Mono',monospace}
  button{margin-top:22px;width:100%;background:#22c55e;color:#07090E;border:0;padding:14px;
         font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;
         transition:opacity .2s cubic-bezier(0.4,0,0.2,1)}
  button:hover{opacity:.88}
  .warn{margin-top:16px;font-size:11px;color:#f59e0b;line-height:1.6}
</style></head><body>
<div class="card">
  <h1>Confirm payment received</h1>
  <div class="sub">Nothing has happened yet. Review, then activate.</div>
  <div class="row"><span class="k">Hotel</span><span class="v">${esc(p.hotel_name)}</span></div>
  <div class="row"><span class="k">Subdomain</span><span class="v">${esc(p.slug)}.fountainbd.com</span></div>
  <div class="row"><span class="k">Plan</span><span class="v">${esc(PLAN_LABELS[p.plan ?? 'starter'] ?? 'Starter')}</span></div>
  <div class="row"><span class="k">Contact</span><span class="v">${esc(p.contact_name)}</span></div>
  <div class="row"><span class="k">Email</span><span class="v">${esc(p.contact_email)}</span></div>
  <div class="row"><span class="k">Rooms</span><span class="v">${esc(p.room_count ?? 24)}</span></div>
  <form method="POST" action="/api/agents/payment-confirm">
    <input type="hidden" name="t" value="${esc(t)}"/>
    <button type="submit">Activate ${esc(p.hotel_name)}</button>
  </form>
  <div class="warn">
    This creates the tenant and emails the client that their dashboard is live.
    Single-use link — it stops working the moment you press the button.
  </div>
</div></body></html>`;
}

// GET is now SAFE: it peeks the nonce and renders a form. Prefetching it does nothing.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const t = (searchParams.get('t') || '').trim();
  if (!UUID_RE.test(t)) return new Response('Invalid or missing activation token', { status: 400 });

  const payload = (await tokenRpc('peek_activation_token', { p_token: t })) as ActivationPayload | null;
  if (!payload) {
    return new Response(
      'This activation link is invalid, already used, or expired. Activate manually from /admin/onboard.',
      { status: 410, headers: { 'Content-Type': 'text/plain' } },
    );
  }
  return new Response(confirmPage(t, payload), {
    status: 200,
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

// POST performs the side effect. The nonce is consumed ATOMICALLY (UPDATE ... WHERE
// used_at IS NULL RETURNING payload), so a double-submit or a replayed request cannot
// activate twice.
export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id');
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

  let t = '';
  const ctype = req.headers.get('content-type') || '';
  try {
    if (ctype.includes('application/json')) {
      t = String(((await req.json()) as Record<string, unknown>)?.t ?? '').trim();
    } else {
      t = String((await req.formData()).get('t') ?? '').trim();
    }
  } catch { /* fall through to the 400 below */ }

  if (!UUID_RE.test(t)) return new Response('Invalid or missing activation token', { status: 400 });

  const payload = (await tokenRpc('consume_activation_token', { p_token: t, p_ip: ip })) as ActivationPayload | null;
  if (!payload) {
    void logEvent({
      event_type:    'status_change',
      action_target: 'POST /api/agents/payment-confirm',
      status_code:   410,
      result:        'denied',
      role:          'anon',
      tenant_id:     TENANT,
      request_id:    requestId,
      ip,
      payload_summary: { reason: 'token_invalid_used_or_expired' },
    });
    return new Response(
      'This activation link is invalid, already used, or expired. Activate manually from /admin/onboard.',
      { status: 410, headers: { 'Content-Type': 'text/plain' } },
    );
  }

  return runActivation(payload, requestId);
}
