import type { NextApiRequest, NextApiResponse } from 'next';

// ─────────────────────────────────────────────────────────────
// Email Confirmation API  –  Pages Router  (root /pages/api/)
//
// Lives next to the root-level /app/ directory so Next.js
// accepts both routers in the same build without throwing
// "pages and app directories should be under the same folder".
//
// POST /api/send-confirmation
// Body: { guest_name, guest_email, room_type, check_in, check_out }
//
// Required Vercel env var:  RESEND_API_KEY
// ─────────────────────────────────────────────────────────────

interface ConfirmationPayload {
  guest_name: string;
  guest_email: string;
  room_type: string;
  check_in: string;
  check_out: string;
}

function buildEmailHtml(p: ConfirmationPayload): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Reservation Confirmed – Hotel Fountain</title>
  <style>
    body{margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif}
    .wrap{max-width:580px;margin:40px auto;background:#07090E;border:1px solid rgba(200,169,110,.2)}
    .header{background:#07090E;padding:40px 48px 28px;border-bottom:1px solid rgba(200,169,110,.15);text-align:center}
    .logo-text{font-size:26px;color:#EEE9E2;letter-spacing:.12em;font-weight:300}
    .logo-text em{color:#C8A96E;font-style:italic}
    .tag{font-size:10px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-top:6px}
    .body{padding:40px 48px}
    .status-badge{display:inline-block;background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3);color:#3FB950;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:6px 16px;margin-bottom:28px}
    h1{color:#EEE9E2;font-size:28px;font-weight:300;margin:0 0 16px;line-height:1.3}
    p{color:#C8BFB0;font-size:14px;line-height:1.8;margin:0 0 20px}
    .details-box{background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.15);padding:24px;margin:28px 0}
    .detail-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(200,169,110,.08)}
    .detail-row:last-child{border-bottom:none}
    .detail-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9A907C}
    .detail-value{font-size:13px;color:#EEE9E2;font-weight:400}
    .sig{margin-top:28px;padding-top:24px;border-top:1px solid rgba(200,169,110,.1)}
    .sig-name{font-size:18px;color:#C8A96E;font-style:italic;margin-bottom:4px}
    .sig-sub{font-size:11px;color:#9A907C;letter-spacing:.1em}
    .footer{padding:24px 48px;border-top:1px solid rgba(200,169,110,.1);text-align:center}
    .footer p{font-size:10px;color:#6a6a5a;margin:0;line-height:1.7}
    .footer a{color:#C8A96E;text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo-text">Hotel <em>Fountain</em></div>
      <div class="tag">Dhaka, Bangladesh</div>
    </div>
    <div class="body">
      <div class="status-badge">✓ Reservation Confirmed</div>
      <h1>Dear ${p.guest_name},</h1>
      <p>Greetings from Hotel Fountain!</p>
      <p>We are pleased to inform you that your reservation has been <strong style="color:#C8A96E">confirmed</strong>. Your room is now officially blocked for your upcoming stay.</p>
      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Room Type</span>
          <span class="detail-value">${p.room_type}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Check-In</span>
          <span class="detail-value">${p.check_in} at 12:00 PM</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Check-Out</span>
          <span class="detail-value">${p.check_out} at 12:00 PM</span>
        </div>
      </div>
      <p>We look forward to welcoming you soon. For any queries or special requests, please contact us at <a href="mailto:hotellfountainbd@gmail.com" style="color:#C8A96E">hotellfountainbd@gmail.com</a> or call <strong style="color:#EEE9E2">+880 1322-840799</strong>.</p>
      <div class="sig">
        <div class="sig-name">The Management</div>
        <div class="sig-sub">Hotel Fountain · Dhaka, Bangladesh</div>
      </div>
    </div>
    <div class="footer">
      <p>Hotel Fountain · House-05, Road-02, Nikunja-02, Dhaka 1229<br/>
        <a href="mailto:hotellfountainbd@gmail.com">hotellfountainbd@gmail.com</a> · +880 1322-840799
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildEmailText(p: ConfirmationPayload): string {
  return `Dear ${p.guest_name},

Greetings from Hotel Fountain!

Your reservation has been confirmed. Your room is now officially blocked for your upcoming stay.

RESERVATION DETAILS
-------------------
Room Type  : ${p.room_type}
Check-In   : ${p.check_in} at 12:00 PM
Check-Out  : ${p.check_out} at 12:00 PM

For any queries, please contact us at hotellfountainbd@gmail.com or +880 1322-840799.

Best regards,
The Management
Hotel Fountain
House-05, Road-02, Nikunja-02, Dhaka 1229`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { guest_name, guest_email, room_type, check_in, check_out } =
    req.body as ConfirmationPayload;

  if (!guest_email || !guest_name) {
    return res.status(400).json({ error: 'guest_name and guest_email are required' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error('[send-confirmation] RESEND_API_KEY not set');
    return res.status(500).json({
      ok: false,
      error: 'Email not configured — add RESEND_API_KEY in Vercel Settings → Environment Variables, then Redeploy.',
    });
  }

  const payload: ConfirmationPayload = { guest_name, guest_email, room_type, check_in, check_out };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Hotel Fountain <hotellfountainbd@gmail.com>',
        to: [guest_email],
        subject: 'Reservation Confirmed — Hotel Fountain',
        html: buildEmailHtml(payload),
        text: buildEmailText(payload),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[send-confirmation] Resend error:', response.status, detail);
      return res.status(500).json({ ok: false, error: 'Resend API error', detail });
    }

    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-confirmation] fetch error:', message);
    return res.status(500).json({ ok: false, error: 'Failed to send email', detail: message });
  }
}
