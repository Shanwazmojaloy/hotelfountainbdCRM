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
</head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ec;padding:40px 0">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#07090E;border:1px solid rgba(200,169,110,.2)">

        <!-- HEADER -->
        <tr>
          <td style="background:#07090E;padding:40px 48px 28px;border-bottom:1px solid rgba(200,169,110,.15);text-align:center">
            <div style="font-size:26px;color:#EEE9E2;letter-spacing:.12em;font-weight:300">Hotel <em style="color:#C8A96E;font-style:italic">Fountain</em></div>
            <div style="font-size:10px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-top:6px">Dhaka, Bangladesh</div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px 48px">
            <div style="display:inline-block;background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3);color:#3FB950;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:6px 16px;margin-bottom:28px">✓ Reservation Confirmed</div>
            <h1 style="color:#EEE9E2;font-size:28px;font-weight:300;margin:0 0 16px;line-height:1.3">Dear ${p.guest_name},</h1>
            <p style="color:#C8BFB0;font-size:14px;line-height:1.8;margin:0 0 20px">Greetings from Hotel Fountain!</p>
            <p style="color:#C8BFB0;font-size:14px;line-height:1.8;margin:0 0 20px">We are pleased to inform you that your reservation has been <strong style="color:#C8A96E">confirmed</strong>. Your room is now officially blocked for your upcoming stay.</p>

            <!-- DETAILS TABLE -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.15);margin:28px 0">
              <tr style="border-bottom:1px solid rgba(200,169,110,.08)">
                <td style="padding:14px 24px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9A907C;width:40%">Room Type</td>
                <td style="padding:14px 24px;font-size:13px;color:#EEE9E2;font-weight:400">${p.room_type}</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(200,169,110,.08)">
                <td style="padding:14px 24px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9A907C;border-top:1px solid rgba(200,169,110,.08)">Check-In</td>
                <td style="padding:14px 24px;font-size:13px;color:#EEE9E2;font-weight:400;border-top:1px solid rgba(200,169,110,.08)">${p.check_in} at 12:00 PM</td>
              </tr>
              <tr>
                <td style="padding:14px 24px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9A907C;border-top:1px solid rgba(200,169,110,.08)">Check-Out</td>
                <td style="padding:14px 24px;font-size:13px;color:#EEE9E2;font-weight:400;border-top:1px solid rgba(200,169,110,.08)">${p.check_out} at 12:00 PM</td>
              </tr>
            </table>

            <p style="color:#C8BFB0;font-size:14px;line-height:1.8;margin:0 0 20px">We look forward to welcoming you soon. For any queries or special requests, please contact us at <a href="mailto:hotellfountainbd@gmail.com" style="color:#C8A96E">hotellfountainbd@gmail.com</a> or call <strong style="color:#EEE9E2">+880 1322-840799</strong>.</p>
            <div style="margin-top:28px;padding-top:24px;border-top:1px solid rgba(200,169,110,.1)">
              <div style="font-size:18px;color:#C8A96E;font-style:italic;margin-bottom:4px">The Management</div>
              <div style="font-size:11px;color:#9A907C;letter-spacing:.1em">Hotel Fountain · Dhaka, Bangladesh</div>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 48px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
            <p style="font-size:10px;color:#6a6a5a;margin:0;line-height:1.7">
              Hotel Fountain · House-05, Road-02, Nikunja-02, Dhaka 1229<br/>
              <a href="mailto:hotellfountainbd@gmail.com" style="color:#C8A96E;text-decoration:none">hotellfountainbd@gmail.com</a> · +880 1322-840799
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
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

  const BREVO_API_KEY = process.env.BREVO_API_KEY;

  if (!BREVO_API_KEY) {
    console.error('[send-confirmation] BREVO_API_KEY not set');
    return res.status(500).json({
      ok: false,
      error: 'Email not configured — add BREVO_API_KEY in Vercel Settings → Environment Variables, then Redeploy.',
    });
  }

  const payload: ConfirmationPayload = { guest_name, guest_email, room_type, check_in, check_out };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Hotel Fountain', email: 'hotellfountainbd@gmail.com' },
        to: [{ email: guest_email, name: guest_name }],
        replyTo: { name: 'Hotel Fountain', email: 'hotellfountainbd@gmail.com' },
        subject: 'Reservation Confirmed — Hotel Fountain',
        htmlContent: buildEmailHtml(payload),
        textContent: buildEmailText(payload),
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
