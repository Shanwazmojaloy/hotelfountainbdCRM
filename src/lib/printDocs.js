// printDocs — ported from legacy ReservationDetail.printConfirmation. Opens a print
// window with the A4-portrait Booking Confirmation voucher (WhatsApp QR, image-load-aware
// print trigger). The 69KB base64 logo is replaced by the hosted /logo.png (same origin)
// to keep the bundle lean. Invoice printing lives in printInvoice (billing).
const HF_ADDR = 'House-05, Road-02, Nikunja-02, Dhaka 1229, Bangladesh';
const HF_EMAIL = 'hotellfountainbd@gmail.com';
const HF_SITE = 'fountainbd.com';
const HF_PHONE = '+880 1322-840799';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => '৳' + Number(n || 0).toLocaleString('en-BD');
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return String(d).slice(0, 10); } };
const nightsCount = (ci, co) => { if (!ci || !co) return 0; const n = Math.round((new Date(co) - new Date(ci)) / 86400000); return n > 0 ? n : 0; };

// Resolve full guest objects for a reservation from a guests lookup (guest_ids order preserved).
const resolveGuests = (res, guests) => (res.guest_ids || []).map((id) => (guests || []).find((g) => String(g.id) === String(id))).filter(Boolean);
// Per-guest detail cards: Full Name, ID Type, ID Number, Nationality, Address. Shared by
// the confirmation voucher and the tax invoice. Returns '' when no full guest objects exist
// (e.g. caller passed only a name string) so the documents degrade gracefully.
const guestDetailsHTML = (guestObjs) => {
  if (!guestObjs || !guestObjs.length) return '';
  const cards = guestObjs.map((g, i) => {
    const addr = [g.address, g.city, g.country].filter(Boolean).join(', ') || '—';
    const idNum = g.id_number || g.id_card || '—';
    return `<div class="gd-card">
      <div class="gd-name">${guestObjs.length > 1 ? (i + 1) + '. ' : ''}${esc(g.name || '—')}</div>
      <div class="gd-fields">
        <div><span class="gd-l">ID Type</span><span class="gd-v">${esc(g.id_type || '—')}</span></div>
        <div><span class="gd-l">ID Number</span><span class="gd-v">${esc(idNum)}</span></div>
        <div><span class="gd-l">Nationality</span><span class="gd-v">${esc(g.nationality || '—')}</span></div>
        <div><span class="gd-l">Address</span><span class="gd-v">${esc(addr)}</span></div>
      </div>
    </div>`;
  }).join('');
  return `<div class="gd-sec"><div class="gd-hdr">Guest Details</div>${cards}</div>`;
};
const GD_CSS = `
  .gd-sec{margin-bottom:28px}
  .gd-hdr{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8A8276;margin-bottom:10px;font-weight:600}
  .gd-card{border:2px solid #D9CFB8;background:#FFFDF7;border-radius:3px;padding:14px 18px;margin-bottom:12px}
  .gd-card:last-child{margin-bottom:0}
  .gd-name{font-size:14px;font-weight:600;color:#1F1B16;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #F2EEE4}
  .gd-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 24px}
  .gd-fields>div{display:flex;flex-direction:column;min-width:0}
  .gd-l{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#8A8276;margin-bottom:2px}
  .gd-v{font-size:12.5px;color:#1F1B16;font-weight:500;word-break:break-word}
  @media print{.gd-card,.gd-sec{page-break-inside:avoid}}`;

export function printConfirmation(res, rooms, guestName, guests) {
  const logo = (typeof window !== 'undefined' ? window.location.origin : '') + '/logo.png';
  // Resolve EVERY guest on the reservation. Prefer guest_ids→guests lookup (full objects);
  // fall back to the passed name/array, then the denormalized single guest_name.
  const guestObjs = resolveGuests(res, guests);
  const idNames = guestObjs.map((g) => g.name).filter(Boolean);
  const names = idNames.length ? idNames : (Array.isArray(guestName) ? guestName.filter(Boolean) : (guestName ? [guestName] : []));
  const gn = names.join(', ') || res.guest_name || 'Guest';
  const guestLbl = names.length > 1 ? 'Guests' : 'Guest';
  const confNo = 'HF-' + String(res.id || '').slice(0, 8).toUpperCase();
  const issued = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const roomArr = (res.room_ids || []).filter(Boolean);
  const nights = nightsCount(res.check_in, res.check_out);
  const ratesSum = roomArr.reduce((a, rn) => a + (+(rooms || []).find((r) => String(r.room_number) === String(rn))?.price || 0), 0);
  const totalAmt = +res.total_amount > 0 ? +res.total_amount : ratesSum * nights;
  const discountNum = +(res.discount_amount || res.discount || 0);
  const paidNum = +res.paid_amount || 0;
  const balance = Math.max(0, totalAmt - discountNum - paidNum);
  const rows = roomArr.map((rn) => {
    const rm = (rooms || []).find((r) => String(r.room_number) === String(rn));
    const rate = +rm?.price || 0;
    const type = rm?.room_type || rm?.category || 'Room';
    return `<tr><td class="rno">${esc(rn)}</td><td class="rtp">${esc(type)}</td><td class="num">${fmt(rate)}</td><td class="num">${nights}</td><td class="num">${fmt(rate * nights)}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Booking Confirmation · ${esc(confNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#FBF8F1;color:#1F1B16;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .page{max-width:780px;margin:0 auto;padding:48px 56px;background:#FBF8F1}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #C8A96E;padding-bottom:28px;margin-bottom:32px}
  .brand{display:flex;align-items:center;gap:22px;flex:1;min-width:0}
  .brand img.logo{width:84px;height:84px;object-fit:contain;flex:none;display:block}
  .brand .txt{display:flex;flex-direction:column;min-width:0}
  .brand h1{font-family:'Inter',sans-serif;font-size:24px;font-weight:700;letter-spacing:.8px;color:#1F1B16;text-transform:uppercase;line-height:1.1}
  .brand h1 em{font-style:normal;color:#C8A96E;font-weight:500;letter-spacing:1px}
  .brand .tag{font-style:italic;font-size:12px;letter-spacing:1.5px;color:#C8A96E;margin-top:3px}
  .brand .contact{font-size:10px;color:#5A544A;line-height:1.6;margin-top:8px}
  .brand .contact span{color:#8A8276;font-weight:500}
  .meta{text-align:right;font-size:11px;color:#5A544A;line-height:1.7;font-variant-numeric:tabular-nums}
  .meta .conf{color:#9C7A3E;font-weight:500;font-size:12px}
  .doc-title{font-size:22px;font-weight:600;letter-spacing:.5px;margin-bottom:6px}
  .doc-sub{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8A8276;margin-bottom:32px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
  .box{border:2px solid #D9CFB8;background:#FFFDF7;padding:18px 20px;border-radius:3px}
  .lbl{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8A8276;margin-bottom:6px}
  .val{font-size:15px;font-weight:500;color:#1F1B16}
  .val.mono{font-size:14px;font-variant-numeric:tabular-nums}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;border:2px solid #D9CFB8;background:#FFFDF7;border-radius:3px;overflow:hidden}
  thead th{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8A8276;text-align:left;padding:12px 14px;border-bottom:1px solid #EAE6DD;font-weight:500}
  thead th.num{text-align:right}
  tbody td{padding:14px;border-bottom:1px solid #F2EEE4;font-size:13px}
  tbody tr:last-child td{border-bottom:none}
  td.rno{color:#9C7A3E;font-weight:600;letter-spacing:.5px}
  td.rtp{color:#5A544A}
  td.num{text-align:right;color:#1F1B16;font-weight:500;font-variant-numeric:tabular-nums}
  .totals{margin-left:auto;width:300px}
  .totals .row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;font-variant-numeric:tabular-nums}
  .totals .row.disc{color:#9C7A3E}
  .totals .row.bal{border-top:1px solid #EAE6DD;margin-top:6px;padding-top:14px;font-size:15px;font-weight:500}
  .totals .row.bal.due{color:#B14D4D}
  .totals .row.bal.paid{color:#4A7C59}
  .stamp{display:inline-block;border:1px solid #9C7A3E;color:#9C7A3E;padding:4px 12px;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-weight:500;border-radius:1px}
  .notes{margin-top:8px;padding:16px 20px;border-left:2px solid #9C7A3E;background:#F7F2E6;font-size:12px;color:#5A544A;font-style:italic}
  .terms{margin-top:32px;font-size:10px;color:#8A8276;line-height:1.7}
  .terms h4{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A544A;margin-bottom:8px;font-weight:500}
  .ftr{margin-top:48px;padding-top:24px;border-top:1px solid #EAE6DD;display:flex;justify-content:space-between;font-size:10px;color:#8A8276}
  @page{size:A4 portrait;margin:8mm 10mm}
  @media print{
    html,body{background:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12px !important;text-rendering:geometricPrecision !important;color:#1F1B16 !important}
    .page{padding:0 !important;max-width:none !important;width:100% !important;margin:0 !important;background:#fff !important;display:flex !important;flex-direction:column !important;min-height:calc(297mm - 16mm) !important}
    .hdr{padding-bottom:16px !important;margin-bottom:20px !important}
    .brand img.logo{width:54px !important;height:54px !important}
    .brand h1{font-size:21px !important}
    .doc-title{font-size:18px !important}
    .ftr{margin-top:auto !important;padding-top:14px !important;align-items:center !important}
    .ftr img{width:68px !important;height:68px !important}
    .ftr,.totals,table tr,.terms,.hdr,.grid{page-break-inside:avoid}
  }
  ${GD_CSS}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div class="brand">
      <img class="logo" src="${logo}" alt="Hotel Fountain"/>
      <div class="txt">
        <h1>Hotel <em>Fountain</em></h1>
        <div class="tag">Luxury In Comfort</div>
        <div class="contact">${esc(HF_ADDR)}<br/><span>Email</span> ${esc(HF_EMAIL)} &nbsp;·&nbsp; <span>Web</span> ${esc(HF_SITE)} &nbsp;·&nbsp; <span>Tel</span> ${esc(HF_PHONE)}</div>
      </div>
    </div>
    <div class="meta">
      <div class="conf">${esc(confNo)}</div>
      <div>Issued ${esc(issued)} BST</div>
      <div style="margin-top:8px"><span class="stamp">${esc(res.status || 'Reserved')}</span></div>
    </div>
  </div>
  <div class="doc-title">Booking Confirmation</div>
  <div class="doc-sub">Reservation Voucher · Not a Tax Invoice</div>
  <div class="grid">
    <div class="box"><div class="lbl">${guestLbl}</div><div class="val">${esc(gn)}</div></div>
    <div class="box"><div class="lbl">Confirmation No.</div><div class="val mono">${esc(confNo)}</div></div>
    <div class="box"><div class="lbl">Check-In</div><div class="val mono">${esc(fmtDate(res.check_in))}</div></div>
    <div class="box"><div class="lbl">Check-Out</div><div class="val mono">${esc(fmtDate(res.check_out))}</div></div>
    <div class="box"><div class="lbl">Nights</div><div class="val mono">${nights || 0}</div></div>
    <div class="box"><div class="lbl">On-Duty Officer</div><div class="val">${esc(res.on_duty_officer || res.officer || '—')}</div></div>
  </div>
  ${guestDetailsHTML(guestObjs)}
  <table>
    <thead><tr><th>Room</th><th>Type</th><th class="num">Rate / Night</th><th class="num">Nights</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#8A8276;padding:24px">No rooms assigned</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(totalAmt)}</span></div>
    ${discountNum > 0 ? `<div class="row disc"><span>Discount</span><span>− ${fmt(discountNum)}</span></div>` : ''}
    <div class="row"><span>Total Payable</span><span>${fmt(totalAmt - discountNum)}</span></div>
    <div class="row"><span>Advance Paid</span><span>${fmt(paidNum)}</span></div>
    <div class="row bal ${balance > 0 ? 'due' : 'paid'}"><span>${balance > 0 ? 'Balance Due' : 'Fully Paid'}</span><span>${fmt(balance)}</span></div>
  </div>
  ${res.notes ? `<div class="notes">${esc(res.notes)}</div>` : ''}
  <div class="terms">
    <h4>Reservation Terms</h4>
    Standard check-in 2:00 PM · check-out 12:00 PM. Early check-in / late check-out subject to availability. Balance due payable at check-in. Cancellation policy applies as per booking agreement. This document is a booking confirmation and does not constitute a VAT invoice; a tax invoice will be issued at check-out.
  </div>
  <div class="ftr" style="align-items:center">
    <div style="line-height:1.8">
      <div style="white-space:nowrap">${esc(HF_PHONE)} &nbsp;·&nbsp; ${esc(HF_EMAIL)}</div>
      <div>${esc(HF_SITE)}</div>
    </div>
    <div style="text-align:center;flex-shrink:0;margin-left:16px;display:flex;flex-direction:column;align-items:center">
      <img id="wa-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=1C1510&bgcolor=ffffff&data=https%3A%2F%2Fwa.me%2F8801322840799&qzone=1" width="68" height="68" style="display:block;margin-bottom:5px" alt="WhatsApp QR"/>
      <div style="font-size:7.5px;letter-spacing:.14em;white-space:nowrap;margin-bottom:2px">SCAN TO WHATSAPP</div>
      <div style="font-size:9px;font-weight:700;color:#1C1510;font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:.04em">+880&nbsp;1322-840799</div>
    </div>
  </div>
</div>
<script>
  (function(){
    const imgs = document.getElementsByTagName('img');
    let pending = 0;
    const trigger = () => setTimeout(() => window.print(), 120);
    if (imgs.length === 0) { trigger(); return; }
    for (const im of imgs) {
      if (im.complete && im.naturalWidth > 0) continue;
      pending++;
      im.addEventListener('load', () => { if (--pending <= 0) trigger(); });
      im.addEventListener('error', () => { if (--pending <= 0) trigger(); });
    }
    if (pending === 0) trigger();
    setTimeout(trigger, 2500);
  })();
</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) { alert('Pop-up blocked — allow pop-ups to print.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// printDayReport — ported from legacy BillingPage.downloadPDF (A4 portrait, 5mm/7mm). Daily
// closing report: collected transactions grouped by reservation (today's paid, aggregated
// payment methods), pending dues, and a closing summary by payment method. Bill Total is the
// NET (post-discount) figure to match the web Billing page.
const _net = (r) => Math.max(0, (+r?.total_amount || 0) - (+r?.discount_amount || +r?.discount || 0));
const _due = (r) => Math.max(0, _net(r) - (+r?.paid_amount || 0));
export function printDayReport({ dateLabel, collected, dues, reservations }) {
  const logo = (typeof window !== 'undefined' ? window.location.origin : '') + '/logo.png';
  const resById = {}; (reservations || []).forEach((r) => { resById[String(r.id)] = r; });
  // group today's collections by reservation_id (orphans by guest|room)
  const groups = {};
  (collected || []).forEach((t) => {
    const key = t.reservation_id ? 'r:' + t.reservation_id : 'o:' + (t.guest_name || '') + '|' + (t.room_number || '');
    if (!groups[key]) groups[key] = { guest: t.guest_name || '—', room: t.room_number || '—', paidToday: 0, methods: new Set(), res: resById[String(t.reservation_id)] };
    groups[key].paidToday += +t.amount || 0;
    if (t.type) groups[key].methods.add(String(t.type).replace(/Room Payment \(|\)/g, ''));
  });
  const grpArr = Object.values(groups);
  const totalCollected = grpArr.reduce((a, g) => a + g.paidToday, 0);
  const totalOutstanding = (dues || []).reduce((a, r) => a + _due(r), 0);
  // closing summary by method
  const byMethod = {};
  (collected || []).forEach((t) => { const m = String(t.type || 'Other').replace(/Room Payment \(|\)/g, ''); byMethod[m] = (byMethod[m] || 0) + (+t.amount || 0); });

  const collectedRows = grpArr.map((g) => `<tr><td>${esc(g.guest)}</td><td class="rno">${esc(g.room)}</td><td class="num">${fmt(g.res ? _net(g.res) : g.paidToday)}</td><td class="num">${fmt(g.paidToday)}</td><td class="rt">${esc([...g.methods].join(' + ') || '—')}</td></tr>`).join('')
    || `<tr><td colspan="5" style="text-align:center;color:#8A8276;padding:20px">No collections recorded.</td></tr>`;
  const dueRows = (dues || []).map((r) => `<tr><td>${esc(r.guest_name || 'Guest')}</td><td class="rno">${esc(Array.isArray(r.room_ids) ? r.room_ids.join(', ') : (r.room_number || '—'))}</td><td class="num">${fmt(_net(r))}</td><td class="num">${fmt(r.paid_amount)}</td><td class="num due">${fmt(_due(r))}</td></tr>`).join('')
    || `<tr><td colspan="5" style="text-align:center;color:#8A8276;padding:20px">No pending dues.</td></tr>`;
  const methodRows = Object.entries(byMethod).map(([m, amt]) => `<div class="pm"><span>${esc(m)}</span><span>${fmt(amt)}</span></div>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Daily Closing Report · ${esc(dateLabel)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page{size:A4 portrait;margin:5mm 7mm}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#FBF8F1;color:#15110D;font-family:'Inter',sans-serif;font-size:8px;line-height:1.5;font-variant-numeric:tabular-nums;text-rendering:geometricPrecision}
  .page{max-width:820px;margin:0 auto;padding:24px 28px;background:#FBF8F1}
  .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #C8A96E;padding-bottom:12px;margin-bottom:14px}
  .brand{display:flex;align-items:center;gap:12px}
  .brand img{width:40px;height:40px;object-fit:contain}
  .brand h1{font-size:14px;font-weight:700;letter-spacing:.6px;text-transform:uppercase}
  .brand h1 em{font-style:normal;color:#C8A96E;font-weight:500}
  .brand .tag{font-size:8px;color:#8A8276}
  .meta{text-align:right;font-size:9px;color:#5A544A}
  .meta .t{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .stat{border:1px solid #E0D8C8;border-radius:3px;padding:8px 10px;background:#FFFDF7}
  .stat .l{font-size:7px;letter-spacing:1px;text-transform:uppercase;color:#8A8276}
  .stat .v{font-size:14px;font-weight:700;margin-top:2px}
  .sec-hdr{font-size:10.5px;font-weight:700;letter-spacing:.5px;color:#15110D;margin:14px 0 6px}
  table{width:100%;border-collapse:collapse;border:1px solid #E0D8C8;background:#FFFDF7}
  thead th{font-size:7.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#8A8276;text-align:left;padding:6px 8px;border-bottom:1px solid #E0D8C8;background:#F7F2E6}
  thead th.num{text-align:right}
  tbody td{padding:6px 8px;border-bottom:1px solid #F2EEE4;font-size:8.5px}
  td.rno{color:#9C7A3E;font-weight:600}
  td.rt{color:#5A544A}
  td.num{text-align:right;font-weight:500}
  td.num.due{color:#B14D4D;font-weight:600}
  .closing{margin-top:16px;border-top:2px solid #C8A96E;padding-top:10px;display:flex;justify-content:space-between;align-items:flex-end}
  .pm{display:flex;justify-content:space-between;gap:24px;font-size:7px;font-weight:600;color:#5A544A;padding:1px 0}
  .final{text-align:right}
  .final .l{font-size:8px;letter-spacing:1px;text-transform:uppercase;color:#8A8276}
  .final .v{font-size:14px;font-weight:700;color:#4A7C59}
  @media print{html,body{background:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:0 !important;max-width:none !important}}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div class="brand"><img src="${logo}" alt="HF"/><div><h1>Hotel <em>Fountain</em></h1><div class="tag">Daily Closing Report</div></div></div>
    <div class="meta"><div class="t">Closing Report</div><div>${esc(dateLabel)}</div><div>Generated ${esc(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }))} BST</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="l">Collected Today</div><div class="v" style="color:#4A7C59">${fmt(totalCollected)}</div></div>
    <div class="stat"><div class="l">Outstanding Dues</div><div class="v" style="color:#B14D4D">${fmt(totalOutstanding)}</div></div>
    <div class="stat"><div class="l">Transactions</div><div class="v">${grpArr.length}</div></div>
    <div class="stat"><div class="l">Open Folios</div><div class="v">${(dues || []).length}</div></div>
  </div>
  <div class="sec-hdr">Collected Transactions</div>
  <table><thead><tr><th>Guest</th><th>Room</th><th class="num">Bill Total</th><th class="num">Paid</th><th>Payment Method</th></tr></thead><tbody>${collectedRows}</tbody></table>
  <div class="sec-hdr">Pending Dues</div>
  <table><thead><tr><th>Guest</th><th>Room</th><th class="num">Bill Total</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>${dueRows}</tbody></table>
  <div class="closing">
    <div><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:#8A8276;margin-bottom:3px">By Payment Method</div>${methodRows || '<div class="pm"><span>—</span><span>৳0</span></div>'}</div>
    <div class="final"><div class="l">Total Collected Today</div><div class="v">${fmt(totalCollected)}</div></div>
  </div>
</div>
<script>(function(){const imgs=document.getElementsByTagName('img');let p=0;const go=()=>setTimeout(()=>window.print(),120);if(!imgs.length){go();return;}for(const im of imgs){if(im.complete&&im.naturalWidth>0)continue;p++;im.addEventListener('load',()=>{if(--p<=0)go();});im.addEventListener('error',()=>{if(--p<=0)go();});}if(p===0)go();setTimeout(go,2500);})();</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) { alert('Pop-up blocked — allow pop-ups to print.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// printInvoice — tax-invoice variant built from the reservation + its folios (no dependency
// on BillingPage.computeBill). Lists room charge(s) + billable folios, discount, paid, due,
// with a PAID / BALANCE DUE stamp. Same A4-portrait Warm-Ivory shell as the confirmation.
const MARKER_RE = /receivable|payment|settlement|advance|refund/i;
export function printInvoice(res, rooms, guestName, folios, guests) {
  const logo = (typeof window !== 'undefined' ? window.location.origin : '') + '/logo-crest.png';
  // Resolve EVERY guest on the reservation (guest_ids→guests lookup), else fall back.
  const guestObjs = resolveGuests(res, guests);
  const idNames = guestObjs.map((g) => g.name).filter(Boolean);
  const names = idNames.length ? idNames : (Array.isArray(guestName) ? guestName.filter(Boolean) : (guestName ? [guestName] : []));
  const gn = names.join(', ') || res.guest_name || 'Guest';
  const billedLbl = names.length > 1 ? 'Billed To (Guests)' : 'Billed To';
  const invNo = 'INV-' + String(res.id || Date.now()).slice(-8).toUpperCase();
  const issued = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const roomArr = (res.room_ids || []).filter(Boolean);
  const nights = nightsCount(res.check_in, res.check_out) || 1;
  const billFolios = (folios || []).filter((f) => !MARKER_RE.test(String(f.category || '') + ' ' + String(f.description || '')));
  // CANONICAL ANCHOR (billing_canonical_anchor rule): reservations.total_amount is the
  // source of truth. rate×nights is only a fallback — when canonical is set, room rows are
  // scaled so the printed invoice ALWAYS matches the web Billing card (e.g. negotiated
  // ৳95,000/25n must not print as rate-derived ৳112,500).
  let rawRoomCharge = 0;
  const rowData = roomArr.map((rn) => {
    const rm = (rooms || []).find((r) => String(r.room_number) === String(rn));
    const rate = +rm?.price || 0; const sub = rate * nights; rawRoomCharge += sub;
    return { rn, rm, sub };
  });
  // canonical (total_amount) INCLUDES folio extras after Add-Charge resync — so the room
  // portion is canonical − extras, otherwise extras are counted twice on the invoice.
  const canonical = +res.total_amount || 0;
  const roomCharge = canonical > 0 ? Math.max(0, canonical - (billFolios.reduce((a, f) => a + (+f.amount || 0), 0))) : rawRoomCharge;
  const factor = canonical > 0 && rawRoomCharge > 0 ? roomCharge / rawRoomCharge : 1;
  const roomRows = rowData.length
    ? rowData.map(({ rn, rm, sub }) => {
        const amt = sub * factor; const effRate = nights > 0 ? amt / nights : amt;
        return `<tr><td class="dt">${esc(fmtDate(res.check_in))} → ${esc(fmtDate(res.check_out))}</td><td>Room ${esc(rn)} · ${esc(rm?.category || 'Room')} (${nights}n)</td><td class="rt">${fmt(effRate)}/n</td><td class="num">${fmt(amt)}</td></tr>`;
      }).join('')
    : (roomCharge > 0 ? `<tr><td class="dt">${esc(fmtDate(res.check_in))} → ${esc(fmtDate(res.check_out))}</td><td>Room charge (${nights}n)</td><td class="rt">—</td><td class="num">${fmt(roomCharge)}</td></tr>` : '');
  const folioRows = billFolios.map((f) => `<tr><td class="dt">${esc(String(f.created_at || '').slice(0, 10))}</td><td>${esc(f.description || f.category || 'Charge')}</td><td class="rt">${esc(f.category || '—')}</td><td class="num">${fmt(f.amount)}</td></tr>`).join('');
  const extras = billFolios.reduce((a, f) => a + (+f.amount || 0), 0);
  const subtotal = roomCharge + extras;
  const discount = +(res.discount_amount || res.discount || 0);
  const total = Math.max(0, subtotal - discount);
  const paid = +res.paid_amount || 0;
  const due = Math.max(0, total - paid);
  const isPaid = due <= 0;
  const stampColor = isPaid ? '#4A7C59' : '#B14D4D';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice · ${esc(invNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page{size:A4 portrait;margin:8mm 10mm}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#FBF8F1;color:#1F1B16;font-family:'Inter',sans-serif;font-size:12px;line-height:1.55;font-variant-numeric:tabular-nums}
  .page{max-width:820px;margin:0 auto;padding:44px 52px;background:#FBF8F1}
  .hdr{display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:2px solid #C8A96E;padding-bottom:24px;margin-bottom:28px}
  .brand{display:flex;align-items:center;gap:18px}
  .brand img{width:94px;height:94px;object-fit:contain;display:block;flex:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.12))}
  .brand h1{font-size:23px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;line-height:1.1}
  .brand h1 em{font-style:normal;color:#C8A96E;font-weight:500}
  .brand .tag{font-style:italic;font-size:11px;letter-spacing:1.5px;color:#C8A96E;margin-top:2px}
  .brand .contact{font-size:9.5px;color:#5A544A;margin-top:6px;line-height:1.5}
  .meta{text-align:right;font-size:11px;color:#5A544A;line-height:1.7;min-width:190px}
  .meta .doc{font-size:20px;font-weight:700;letter-spacing:4px;margin-bottom:8px}
  .meta .lbl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8A8276;margin-top:6px}
  .stamp{display:inline-block;border:2px solid ${stampColor};color:${stampColor};padding:5px 14px;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:600;border-radius:2px;margin-top:10px}
  .grid{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-bottom:22px}
  .box{border:2px solid #D9CFB8;background:#FFFDF7;padding:16px 18px;border-radius:3px}
  .lbl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8A8276;margin-bottom:6px}
  .gname{font-size:16px;font-weight:600;margin-bottom:4px}
  .stay{font-size:11.5px;color:#5A544A;margin-top:3px}
  table{width:100%;border-collapse:collapse;margin-bottom:22px;border:2px solid #D9CFB8;background:#FFFDF7;border-radius:3px;overflow:hidden}
  thead th{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8A8276;text-align:left;padding:11px 14px;border-bottom:2px solid #D9CFB8;font-weight:600;background:#F7F2E6}
  thead th.num{text-align:right}
  tbody td{padding:11px 14px;border-bottom:1px solid #F2EEE4;font-size:11.5px;vertical-align:top}
  tbody tr:last-child td{border-bottom:none}
  td.dt{color:#8A8276;font-size:10.5px;white-space:nowrap}
  td.rt{color:#5A544A;text-align:right;font-size:10.5px}
  td.num{text-align:right;font-weight:500}
  .totals{margin-left:auto;width:300px}
  .totals .row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px}
  .totals .row.disc{color:#9C7A3E}
  .totals .row.bal{border-top:1px solid #EAE6DD;margin-top:6px;padding-top:12px;font-size:15px;font-weight:600;color:${stampColor}}
  .ftr{margin-top:40px;padding-top:20px;border-top:1px solid #EAE6DD;font-size:10px;color:#8A8276;display:flex;justify-content:space-between;align-items:center;gap:16px}
  .ftr .wa{text-align:center;flex-shrink:0}
  .ftr .wa .cap{font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#8A8276;margin-top:3px}
  @media print{html,body{background:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:0 !important;max-width:none !important}.ftr{page-break-inside:avoid}.ftr img{width:68px !important;height:68px !important}}
  ${GD_CSS}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div class="brand"><img src="${logo}" alt="Hotel Fountain"/><div><h1>Hotel <em>Fountain</em></h1><div class="tag">Luxury In Comfort</div>
      <div class="contact">${esc(HF_ADDR)}<br/>${esc(HF_EMAIL)} · ${esc(HF_SITE)} · ${esc(HF_PHONE)}</div></div></div>
    <div class="meta"><div class="doc">INVOICE</div><div class="lbl">Invoice No.</div><div>${esc(invNo)}</div>
      <div class="lbl">Issued</div><div>${esc(issued)}</div><div><span class="stamp">${isPaid ? 'PAID' : 'BALANCE DUE'}</span></div></div>
  </div>
  <div class="grid">
    <div class="box"><div class="lbl">${billedLbl}</div><div class="gname">${esc(gn)}</div>
      <div class="stay">${esc(fmtDate(res.check_in))} → ${esc(fmtDate(res.check_out))} · ${nights} night${nights !== 1 ? 's' : ''}</div>
      <div class="stay">Room${roomArr.length !== 1 ? 's' : ''}: ${esc(roomArr.join(', ') || '—')}</div></div>
    <div class="box"><div class="lbl">Status</div><div class="gname" style="color:${stampColor}">${esc(res.status || '—')}</div>
      <div class="stay">On-duty: ${esc(res.on_duty_officer || res.officer || '—')}</div></div>
  </div>
  ${guestDetailsHTML(guestObjs)}
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${roomRows}${folioRows}${(roomRows || folioRows) ? '' : `<tr><td colspan="4" style="text-align:center;color:#8A8276;padding:22px">No charges</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${discount > 0 ? `<div class="row disc"><span>Discount</span><span>− ${fmt(discount)}</span></div>` : ''}
    <div class="row"><span>Total</span><span>${fmt(total)}</span></div>
    <div class="row"><span>Paid</span><span>− ${fmt(paid)}</span></div>
    <div class="row bal"><span>${isPaid ? 'Settled' : 'Balance Due'}</span><span>${fmt(due)}</span></div>
  </div>
  <div class="ftr">
    <div>Thank you for staying with Hotel Fountain.<br/>${esc(HF_PHONE)} · ${esc(HF_EMAIL)} · ${esc(HF_SITE)}</div>
    <div class="wa" style="display:flex;flex-direction:column;align-items:center">
      <img id="wa-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=1C1510&bgcolor=ffffff&data=https%3A%2F%2Fwa.me%2F8801322840799&qzone=1" width="68" height="68" style="display:block;margin-bottom:4px" alt="WhatsApp QR"/>
      <div class="cap" style="white-space:nowrap">Scan to WhatsApp</div>
      <div style="font-size:9px;font-weight:700;color:#1C1510;font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:.04em;margin-top:1px">+880&nbsp;1322-840799</div>
    </div>
  </div>
</div>
<script>(function(){const imgs=document.getElementsByTagName('img');let p=0;const go=()=>setTimeout(()=>window.print(),120);if(!imgs.length){go();return;}for(const im of imgs){if(im.complete&&im.naturalWidth>0)continue;p++;im.addEventListener('load',()=>{if(--p<=0)go();});im.addEventListener('error',()=>{if(--p<=0)go();});}if(p===0)go();setTimeout(go,2500);})();</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) { alert('Pop-up blocked — allow pop-ups to print.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
