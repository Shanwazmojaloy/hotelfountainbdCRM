import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
const FROM      = 'Hotel Fountain Reservations <reservations@fountainbd.com>';
const HOTEL_INBOX = 'hotellfountainbd@gmail.com';
const SITE = 'https://fountainbd.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY secret is not set');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { to, guestName, roomNo, roomType, checkIn, checkOut, total, phone, rate, nights: nightsIn, bookingId } = await req.json();
    if (!guestName) return new Response(JSON.stringify({ error: 'Missing guestName' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const nights = Number(nightsIn) > 0
      ? Number(nightsIn)
      : (checkIn && checkOut)
        ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
        : 1;
    const fmt = (d: string) => d ? new Date(String(d).slice(0,10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const bdt = (n: number) => '৳' + Number(n || 0).toLocaleString('en-US');
    const nightlyRate = Number(rate) > 0 ? Number(rate) : (nights > 0 ? Math.round(Number(total || 0) / nights) : Number(total || 0));

    const ref = bookingId
      ? 'HF-' + String(bookingId).replace(/-/g, '').slice(0, 8).toUpperCase()
      : 'HF-' + Date.now().toString(36).toUpperCase();
    const invoiceUrl = bookingId ? SITE + '/invoice/' + bookingId : SITE;
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=' + encodeURIComponent(invoiceUrl);

    const guestHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Booking Confirmed</title>
<style>body{margin:0;background:#07090E;font-family:Georgia,serif}.w{max-width:540px;margin:0 auto;background:#0D1117}.h{background:#1C1510;padding:32px 40px 24px;text-align:center;border-bottom:2px solid #C8A96E}.hn{font-size:26px;color:#EEE8DC;font-weight:300;margin:0}.hn em{color:#C8A96E;font-style:italic}.tag{display:inline-block;background:#C8A96E;color:#07090E;font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;font-family:Arial,sans-serif;padding:4px 12px;margin-top:10px}.b{padding:28px 40px}.gr{font-size:16px;color:#EEE8DC;font-weight:300;margin-bottom:6px}.sub{font-size:12px;color:#C8B89A;font-family:Arial,sans-serif;line-height:1.7;margin-bottom:24px}.card{background:#1C1510;border:1px solid rgba(200,169,110,.2);padding:20px 22px;margin-bottom:18px}.ct{font-size:7.5px;letter-spacing:.2em;color:#C8A96E;text-transform:uppercase;font-family:Arial,sans-serif;margin-bottom:12px;border-bottom:1px solid rgba(200,169,110,.1);padding-bottom:7px}.row{padding:5px 0;border-bottom:1px solid rgba(200,169,110,.05)}.lbl{font-size:10px;color:#7A6A5A;font-family:Arial,sans-serif}.val{font-size:11px;color:#EEE8DC;font-family:Arial,sans-serif;text-align:right}.tr{background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.18);padding:12px 16px;margin-top:2px}.gold{color:#C8A96E;font-size:14px;font-family:Arial,sans-serif}.inv{background:#15110D;border:1px solid rgba(200,169,110,.2);padding:20px;margin:18px 0;text-align:center}.qrbox{display:inline-block;background:#fff;padding:10px;border-radius:6px}.btn{display:inline-block;margin-top:14px;background:#C8A96E;color:#07090E;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;padding:10px 20px;font-weight:bold}.pol{font-size:10px;color:#7A6A5A;font-family:Arial,sans-serif;line-height:1.7;margin:20px 0}.pol strong{color:#C8B89A;font-weight:400}.cb{background:#1E1A16;border-top:1px solid rgba(200,169,110,.1);padding:16px 40px;text-align:center}.cb p{font-size:9.5px;color:#7A6A5A;font-family:Arial,sans-serif;margin:0 0 3px}.cb a{color:#C8A96E;font-size:10px;text-decoration:none}.ft{background:#07090E;padding:14px;text-align:center;border-top:1px solid rgba(200,169,110,.05)}.ft p{font-size:8.5px;color:#3A3030;font-family:Arial,sans-serif;margin:0}</style>
</head><body><div class="w">
<div class="h"><div style="font-size:10px;letter-spacing:.26em;color:#C8A96E;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:300;margin-bottom:5px">Est. 2010 · Dhaka, Bangladesh</div><h1 class="hn">Hotel <em>Fountain</em></h1><div class="tag">✓ Booking Confirmed</div></div>
<div class="b">
<p class="gr">Dear ${guestName},</p>
<p class="sub"><strong style="color:#C8A96E;font-weight:400">Thank you for choosing Hotel Fountain.</strong> We are delighted to confirm your reservation and look forward to welcoming you and making every moment of your stay exceptional.</p>
<div class="card"><div class="ct">Reservation Details</div>
<table width="100%" cellpadding="0" cellspacing="0">
<tr class="row"><td class="lbl">Booking Ref</td><td class="val" style="color:#C8A96E">${ref}</td></tr>
<tr class="row"><td class="lbl">Guest</td><td class="val">${guestName}</td></tr>
${roomNo ? `<tr class="row"><td class="lbl">Room</td><td class="val">${roomNo}${roomType ? ' · ' + roomType : ''}</td></tr>` : (roomType ? `<tr class="row"><td class="lbl">Room Type</td><td class="val">${roomType}</td></tr>` : '')}
<tr class="row"><td class="lbl">Check-In</td><td class="val">${fmt(checkIn)}</td></tr>
<tr class="row"><td class="lbl">Check-Out</td><td class="val">${fmt(checkOut)}</td></tr>
<tr class="row"><td class="lbl">Duration</td><td class="val">${nights} night${nights !== 1 ? 's' : ''}</td></tr>
<tr class="row"><td class="lbl">Rate</td><td class="val">${bdt(nightlyRate)} / night</td></tr>
${phone ? `<tr class="row"><td class="lbl">Contact</td><td class="val">${phone}</td></tr>` : ''}
</table>
</div>
<table width="100%" cellpadding="0" cellspacing="0" class="tr"><tr><td style="font-size:9.5px;letter-spacing:.14em;color:#7A6A5A;font-family:Arial,sans-serif;text-transform:uppercase">Total Amount</td><td class="gold" style="text-align:right">${bdt(total)}</td></tr></table>
<p style="font-size:8.5px;color:#3A3030;font-family:Arial,sans-serif;margin:5px 0 0">* Inclusive of applicable 15% VAT and 5% service charge</p>
<div class="inv">
<div style="font-size:7.5px;letter-spacing:.2em;color:#C8A96E;text-transform:uppercase;font-family:Arial,sans-serif;margin-bottom:12px">Invoice · ${ref}</div>
<div class="qrbox"><img src="${qrUrl}" width="170" height="170" alt="Invoice QR" style="display:block"/></div>
<div style="font-size:10px;color:#7A6A5A;font-family:Arial,sans-serif;margin-top:12px;line-height:1.6">Scan to view your invoice online.<br>Or present this at the front desk on arrival.</div>
<a class="btn" href="${invoiceUrl}">View Invoice Online</a>
</div>
<div class="pol"><strong>Check-in:</strong> 11:00 AM &nbsp;|&nbsp; <strong>Check-out:</strong> 12:00 PM<br>Please present this confirmation and a valid photo ID upon arrival.</div>
</div>
<div class="cb"><p>Hotel Fountain · House-05, Road-02, Nikunja-02, Dhaka 1229</p><p>+880 1322-840799</p><a href="https://fountainbd.com">fountainbd.com</a></div>
<div class="ft"><p>© ${new Date().getFullYear()} Hotel Fountain · All rights reserved</p></div>
</div></body></html>`;

    const staffHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>New Booking Confirmed</title>
<style>body{margin:0;background:#07090E;font-family:Arial,sans-serif}.w{max-width:500px;margin:0 auto;background:#1C1510;border:1px solid rgba(200,169,110,.2)}.h{background:#2A2420;padding:18px 24px;border-bottom:1px solid rgba(200,169,110,.2)}.ht{font-size:13px;color:#C8A96E;margin:0;font-weight:400;letter-spacing:.06em}.b{padding:20px 24px}.row{padding:7px 0;border-bottom:1px solid rgba(200,169,110,.06)}.lbl{font-size:10px;color:#7A6A5A}.val{font-size:11px;color:#EEE8DC;text-align:right}.note{font-size:10px;color:#C8B89A;line-height:1.6;margin-top:16px;padding:12px;background:rgba(200,169,110,.04);border:1px solid rgba(200,169,110,.1)}.note a{color:#C8A96E}</style>
</head><body><div class="w">
<div class="h"><h2 class="ht">✓ New Booking Confirmed — Lumea CRM</h2></div>
<div class="b">
<table width="100%" cellpadding="0" cellspacing="0">
<tr class="row"><td class="lbl">Ref</td><td class="val" style="color:#C8A96E">${ref}</td></tr>
<tr class="row"><td class="lbl">Guest</td><td class="val">${guestName}</td></tr>
<tr class="row"><td class="lbl">Room Assigned</td><td class="val">${roomNo || 'TBC'}${roomType ? ' · ' + roomType : ''}</td></tr>
<tr class="row"><td class="lbl">Check-In</td><td class="val">${fmt(checkIn)}</td></tr>
<tr class="row"><td class="lbl">Check-Out</td><td class="val">${fmt(checkOut)}</td></tr>
<tr class="row"><td class="lbl">Nights</td><td class="val">${nights}</td></tr>
<tr class="row"><td class="lbl">Rate</td><td class="val">${bdt(nightlyRate)}/night</td></tr>
<tr class="row"><td class="lbl">Total</td><td class="val" style="color:#C8A96E">${bdt(total)}</td></tr>
${phone ? `<tr class="row"><td class="lbl">Phone</td><td class="val">${phone}</td></tr>` : ''}
${to ? `<tr class="row"><td class="lbl">Guest Email</td><td class="val">${to}</td></tr>` : ''}
</table>
<div class="note">Invoice: <a href="${invoiceUrl}">${invoiceUrl}</a><br>Guest confirmation email ${to ? `attempted to ${to}` : 'not sent (no email provided)'}.</div>
</div></div></body></html>`;

    await sendEmail(HOTEL_INBOX, `✓ New Booking — ${guestName} | Room ${roomNo || 'TBC'} | ${fmt(checkIn)}`, staffHtml);

    let guestResult = { ok: false, status: 0, data: {} };
    if (to && to !== HOTEL_INBOX) {
      guestResult = await sendEmail(to, `✓ Booking Confirmed — Hotel Fountain (Room ${roomNo || 'TBC'})`, guestHtml);
    }

    return new Response(JSON.stringify({ ok: true, ref, invoiceUrl, staffNotified: true, guestEmailSent: guestResult.ok, guestResult: guestResult.data }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
