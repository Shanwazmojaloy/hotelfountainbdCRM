// ── email-template.ts ─────────────────────────────────────────────────────────
// Builds the full HTML email for the Saturday Weekly Summary Report.
// Usage: import { buildWeeklyReportEmail } from './email-template.ts';

export interface RoomBreakdown {
  roomType: string;
  roomNights: number;
  revenue: number;
}

export interface CarryOverDue {
  guestName: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  createdAt: string;  // ISO string — month is prior to current month
}

export interface WeeklyReportData {
  weekLabel: string;         // e.g. "Apr 7 – Apr 13, 2026"
  weekStart: string;         // YYYY-MM-DD
  weekEnd: string;           // YYYY-MM-DD
  totalCollections: number;  // BDT sum of all payments received this week
  totalRoomNights: number;   // total occupied room-nights counted
  totalRooms: number;        // hotel capacity (20 default)
  occupancyRate: number;     // percentage (0–100)
  avgDailyRate: number;      // BDT per occupied room-night
  roomBreakdown: RoomBreakdown[];
  carryOverDues: CarryOverDue[];
  generatedAt: string;       // human-readable timestamp in Dhaka time
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const BDT = (n: number) =>
  '৳' + Math.round(n).toLocaleString('en-US');

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ── Room breakdown rows ────────────────────────────────────────────────────────
function buildRoomRows(rows: RoomBreakdown[]): string {
  if (!rows.length) {
    return `<tr><td colspan="3" style="padding:14px 20px;color:#8A8070;font-size:12px;text-align:center;">No room-night data available for this week.</td></tr>`;
  }
  return rows
    .map(
      (r) => `
    <tr style="border-bottom:1px solid rgba(200,169,110,.08);">
      <td style="padding:12px 20px;font-size:13px;color:#EEE9E2;">${r.roomType}</td>
      <td style="padding:12px 20px;font-size:13px;color:#C8BFB0;text-align:center;">${r.roomNights}</td>
      <td style="padding:12px 20px;font-size:13px;color:#C8A96E;text-align:right;">${BDT(r.revenue)}</td>
    </tr>`
    )
    .join('');
}

// ── Carry-over dues rows ───────────────────────────────────────────────────────
function buildCarryOverRows(dues: CarryOverDue[]): string {
  return dues
    .map(
      (d) => `
    <tr style="border-bottom:1px solid rgba(224,140,50,.12);">
      <td style="padding:11px 16px;font-size:12px;color:#EEE9E2;">${d.guestName || 'Unknown Guest'}</td>
      <td style="padding:11px 16px;font-size:12px;color:#C8BFB0;text-align:center;">Rm ${d.roomNumber || '—'}</td>
      <td style="padding:11px 16px;font-size:12px;color:#C8BFB0;text-align:center;">${fmtDate(d.checkIn)} → ${fmtDate(d.checkOut)}</td>
      <td style="padding:11px 16px;font-size:12px;color:#F0A500;text-align:right;font-weight:600;">${BDT(d.dueAmount)}</td>
    </tr>`
    )
    .join('');
}

// ── Main export ────────────────────────────────────────────────────────────────
export function buildWeeklyReportEmail(data: WeeklyReportData): string {
  const hasCarryOver = data.carryOverDues.length > 0;
  const totalCarryOver = data.carryOverDues.reduce((s, d) => s + d.dueAmount, 0);

  const carryOverSection = hasCarryOver
    ? `
  <!-- CARRY-OVER DUES WARNING -->
  <tr><td style="background:#0D1117;border:1px solid rgba(224,140,50,.35);border-top:none;padding:0 0 0 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:rgba(224,140,50,.08);border-top:2px solid #E08C32;padding:16px 28px 12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;">⚠️</span>
          <div>
            <div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#E08C32;font-weight:600;">Carry-Over Dues Alert</div>
            <div style="font-size:11px;color:#8A8070;margin-top:2px;">${data.carryOverDues.length} reservation(s) from prior months still carry an unpaid balance — excluded from this week's collections.</div>
          </div>
        </div>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr style="background:rgba(224,140,50,.06);">
              <th style="padding:10px 16px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#E08C32;font-weight:600;text-align:left;">Guest</th>
              <th style="padding:10px 16px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#E08C32;font-weight:600;text-align:center;">Room</th>
              <th style="padding:10px 16px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#E08C32;font-weight:600;text-align:center;">Stay Dates</th>
              <th style="padding:10px 16px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#E08C32;font-weight:600;text-align:right;">Outstanding</th>
            </tr>
          </thead>
          <tbody>${buildCarryOverRows(data.carryOverDues)}</tbody>
        </table>
      </td></tr>
      <tr><td style="padding:12px 16px;border-top:1px solid rgba(224,140,50,.2);">
        <div style="text-align:right;font-size:13px;color:#F0A500;font-weight:700;">
          Total Carry-Over: ${BDT(totalCarryOver)}
        </div>
      </td></tr>
    </table>
  </td></tr>`
    : '';

  const roomTableSection =
    data.roomBreakdown.length > 0
      ? `
  <!-- ROOM BREAKDOWN TABLE -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:0 0 16px;">
    <div style="padding:16px 28px 10px;">
      <div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#C8A96E;margin-bottom:12px;">Room Type Breakdown</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:rgba(200,169,110,.05);">
          <th style="padding:10px 20px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6A6050;font-weight:600;text-align:left;">Room Type</th>
          <th style="padding:10px 20px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6A6050;font-weight:600;text-align:center;">Room Nights</th>
          <th style="padding:10px 20px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6A6050;font-weight:600;text-align:right;">Revenue</th>
        </tr>
      </thead>
      <tbody>${buildRoomRows(data.roomBreakdown)}</tbody>
    </table>
  </td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hotel Fountain — Weekly Report</title>
</head>
<body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07090E;padding:24px 16px;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.25);padding:28px 36px 20px;">
    <table width="100%"><tr>
      <td>
        <div style="font-family:Georgia,serif;font-size:24px;color:#C8A96E;letter-spacing:.02em;">Hotel <em>Fountain</em></div>
        <div style="font-size:8px;color:#4A4538;letter-spacing:.22em;text-transform:uppercase;margin-top:4px;">Weekly Operations Summary</div>
      </td>
      <td align="right" valign="top">
        <div style="display:inline-block;background:rgba(200,169,110,.08);border:1px solid rgba(200,169,110,.2);padding:6px 14px;">
          <div style="font-size:9px;color:#6A6050;letter-spacing:.1em;text-transform:uppercase;">Week of</div>
          <div style="font-size:11px;color:#C8A96E;font-weight:600;margin-top:2px;">${data.weekLabel}</div>
        </div>
      </td>
    </tr></table>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,.6),transparent);margin-top:18px;"></div>
  </td></tr>

  <!-- KPI STATS BAR -->
  <tr><td style="background:#0A0C12;border:1px solid rgba(200,169,110,.15);border-top:none;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>

      <td align="center" style="border-right:1px solid rgba(200,169,110,.1);padding:20px 10px;">
        <div style="font-size:9px;color:#4A4538;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">Total Collections</div>
        <div style="font-size:22px;color:#3FB950;font-family:Georgia,serif;font-weight:600;">${BDT(data.totalCollections)}</div>
        <div style="font-size:9px;color:#4A4538;margin-top:3px;">payments received</div>
      </td>

      <td align="center" style="border-right:1px solid rgba(200,169,110,.1);padding:20px 10px;">
        <div style="font-size:9px;color:#4A4538;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">Occupancy Rate</div>
        <div style="font-size:22px;color:#C8A96E;font-family:Georgia,serif;font-weight:600;">${data.occupancyRate.toFixed(1)}%</div>
        <div style="font-size:9px;color:#4A4538;margin-top:3px;">${data.totalRoomNights} of ${data.totalRooms * 7} room-nights</div>
      </td>

      <td align="center" style="border-right:1px solid rgba(200,169,110,.1);padding:20px 10px;">
        <div style="font-size:9px;color:#4A4538;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">Avg Daily Rate</div>
        <div style="font-size:22px;color:#58A6FF;font-family:Georgia,serif;font-weight:600;">${BDT(data.avgDailyRate)}</div>
        <div style="font-size:9px;color:#4A4538;margin-top:3px;">per room-night</div>
      </td>

      <td align="center" style="padding:20px 10px;">
        <div style="font-size:9px;color:#4A4538;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">Carry-Over Dues</div>
        <div style="font-size:22px;color:${hasCarryOver ? '#E08C32' : '#4A4538'};font-family:Georgia,serif;font-weight:600;">${hasCarryOver ? data.carryOverDues.length : '—'}</div>
        <div style="font-size:9px;color:#4A4538;margin-top:3px;">${hasCarryOver ? 'prior-month unpaid' : 'all clear'}</div>
      </td>

    </tr></table>
  </td></tr>

  <!-- SUMMARY TABLE -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:24px 28px 20px;">
    <div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#C8A96E;margin-bottom:14px;">Weekly Summary</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr style="border-bottom:1px solid rgba(200,169,110,.08);">
        <td style="padding:10px 0;font-size:12px;color:#8A8070;">Reporting Period</td>
        <td style="padding:10px 0;font-size:12px;color:#EEE9E2;text-align:right;">${data.weekLabel}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(200,169,110,.08);">
        <td style="padding:10px 0;font-size:12px;color:#8A8070;">Total Collections</td>
        <td style="padding:10px 0;font-size:13px;color:#3FB950;font-weight:600;text-align:right;">${BDT(data.totalCollections)}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(200,169,110,.08);">
        <td style="padding:10px 0;font-size:12px;color:#8A8070;">Room Nights Sold</td>
        <td style="padding:10px 0;font-size:12px;color:#EEE9E2;text-align:right;">${data.totalRoomNights} nights</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(200,169,110,.08);">
        <td style="padding:10px 0;font-size:12px;color:#8A8070;">Hotel Capacity</td>
        <td style="padding:10px 0;font-size:12px;color:#EEE9E2;text-align:right;">${data.totalRooms} rooms × 7 days</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(200,169,110,.08);">
        <td style="padding:10px 0;font-size:12px;color:#8A8070;">Occupancy Rate</td>
        <td style="padding:10px 0;font-size:12px;color:#C8A96E;font-weight:600;text-align:right;">${data.occupancyRate.toFixed(1)}%</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(200,169,110,.08);">
        <td style="padding:10px 0;font-size:12px;color:#8A8070;">Average Daily Rate (ADR)</td>
        <td style="padding:10px 0;font-size:12px;color:#58A6FF;font-weight:600;text-align:right;">${BDT(data.avgDailyRate)}</td>
      </tr>
      ${
        hasCarryOver
          ? `<tr>
        <td style="padding:10px 0;font-size:12px;color:#8A8070;">Carry-Over Dues (excl. from above)</td>
        <td style="padding:10px 0;font-size:12px;color:#E08C32;font-weight:600;text-align:right;">${BDT(totalCarryOver)}</td>
      </tr>`
          : ''
      }
    </table>
  </td></tr>

  ${roomTableSection}

  ${carryOverSection}

  <!-- CTA LINK -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:24px 36px;">
    <div style="margin-bottom:14px;">
      <a href="https://hotelfountainbd-crm.vercel.app/crm.html" style="display:inline-block;background:#C8A96E;color:#07090E;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:12px 28px;text-decoration:none;font-weight:600;">Open CRM Dashboard →</a>
    </div>
    <div style="font-size:10px;color:#4A4538;line-height:1.9;">
      ▦ Collections reflect all transactions received between ${data.weekStart} and ${data.weekEnd}<br>
      ▦ Occupancy is calculated against ${data.totalRooms} total rooms over 7 days<br>
      ${hasCarryOver ? '▦ <span style="color:#E08C32;">⚠ Carry-over dues require follow-up — see warning section above</span><br>' : ''}
      ▦ Next weekly report: next Saturday at 8:00 AM BDT
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:16px 36px;">
    <div style="font-size:10px;color:#4A4538;line-height:1.8;">
      Generated by <strong style="color:#6A6050;">Hotel Fountain CRM</strong> &middot;
      Nikunja 2, Dhaka &middot;
      <a href="tel:+8801319407384" style="color:#C8A96E;text-decoration:none;">+880-1319-407384</a> &middot;
      <a href="mailto:hotellfountainbd@gmail.com" style="color:#C8A96E;text-decoration:none;">hotellfountainbd@gmail.com</a>
    </div>
    <div style="font-size:9px;color:#2A2820;margin-top:4px;">Generated at ${data.generatedAt} &middot; Automated Saturday Report</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
