import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ── Saturday Weekly Summary Report ────────────────────────────────────────────
// Scheduled: every Saturday 08:00 AM Asia/Dhaka (02:00 UTC Saturday)
//
// Calculates for the current Mon–Sun week (Dhaka timezone):
//   • Total Collections   — sum of all transactions.amount
//   • Room Nights Sold    — overlapping reservation room-nights
//   • Occupancy Rate      — occupied room-nights / (totalRooms × 7) × 100
//   • Average Daily Rate  — total room revenue / room nights sold
//   • Carry-Over Dues     — old unpaid reservations (prior month, balance > 0)
//
// Sends a styled HTML email via Brevo to the hotel owner.

import {
  buildWeeklyReportEmail,
  type CarryOverDue,
  type RoomBreakdown,
  type WeeklyReportData,
} from './email-template.ts';

// ── Env & constants ────────────────────────────────────────────────────────────
const SB_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BREVO_KEY = Deno.env.get('BREVO_API_KEY') ?? '';

const TENANT   = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const OWNER_EMAIL  = 'owner@hotelfountain.com';
const SENDER_EMAIL = 'hotellfountainbd@gmail.com';
const SENDER_NAME  = 'Hotel Fountain CRM';
const TOTAL_ROOMS_DEFAULT = 20;  // fallback if rooms table is empty
const TZ = 'Asia/Dhaka';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

// ── Date helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the Monday and Sunday of the current week in Asia/Dhaka time,
 * expressed as UTC ISO strings (start-of-day and end-of-day Dhaka).
 * Dhaka is UTC+6, so:
 *   Monday 00:00 Dhaka = Sunday 18:00 UTC
 *   Sunday 23:59:59 Dhaka = Sunday 17:59:59 UTC (next day)
 */
function getWeekBoundaries(): {
  mondayDhaka: string;   // YYYY-MM-DD in Dhaka timezone (for display / SQL date comparisons)
  sundayDhaka: string;
  mondayUtc: string;     // ISO UTC string for .gte() queries
  sundayUtc: string;     // ISO UTC string for .lte() queries
  weekLabel: string;
  currentMonthStart: string; // YYYY-MM-01 in Dhaka — used for ghost-due filter
} {
  // Get current date/time in Dhaka by formatting to a locale string and parsing back.
  // This is the reliable cross-runtime approach in Deno.
  const nowUtc = new Date();
  const dhakaOffsetMs = 6 * 60 * 60 * 1000; // UTC+6

  // Current time as Dhaka "wall clock" milliseconds
  const dhakaMs = nowUtc.getTime() + dhakaOffsetMs;
  const dhakaDate = new Date(dhakaMs);

  // Day of week in Dhaka (0=Sun, 1=Mon ... 6=Sat)
  const dow = dhakaDate.getUTCDay(); // using UTC methods on shifted date gives Dhaka day
  // Days since last Monday (Mon=0 offset)
  const daysSinceMon = (dow + 6) % 7;

  // Monday 00:00:00 Dhaka in UTC
  const mondayDhakaMs = dhakaMs - daysSinceMon * 86400000;
  const mondayStartDhaka = new Date(mondayDhakaMs);
  // Zero out the time component (keep as Dhaka midnight)
  mondayStartDhaka.setUTCHours(0, 0, 0, 0);

  // Monday UTC ISO = Monday Dhaka midnight − 6 hours
  const mondayUtcMs = mondayStartDhaka.getTime() - dhakaOffsetMs;
  const mondayUtc = new Date(mondayUtcMs).toISOString();

  // Sunday 23:59:59.999 Dhaka
  const sundayEndDhaka = new Date(mondayStartDhaka.getTime() + 6 * 86400000);
  sundayEndDhaka.setUTCHours(23, 59, 59, 999);
  const sundayUtcMs = sundayEndDhaka.getTime() - dhakaOffsetMs;
  const sundayUtc = new Date(sundayUtcMs).toISOString();

  // YYYY-MM-DD strings for Dhaka dates
  const pad = (n: number) => String(n).padStart(2, '0');
  const mondayDhaka = `${mondayStartDhaka.getUTCFullYear()}-${pad(mondayStartDhaka.getUTCMonth() + 1)}-${pad(mondayStartDhaka.getUTCDate())}`;
  const sundayY = sundayEndDhaka.getUTCFullYear();
  const sundayM = pad(sundayEndDhaka.getUTCMonth() + 1);
  const sundayD = pad(sundayEndDhaka.getUTCDate());
  const sundayDhaka = `${sundayY}-${sundayM}-${sundayD}`;

  // Current month start (YYYY-MM-01) in Dhaka — for ghost-due filter
  const currentMonthStart = `${dhakaDate.getUTCFullYear()}-${pad(dhakaDate.getUTCMonth() + 1)}-01`;

  // Human-readable week label
  const fmtShort = (d: Date) =>
    d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
  const fmtFull = (d: Date) =>
    d.toLocaleDateString('en-US', {
      timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric',
    });
  const monDisplay = new Date(mondayUtcMs);
  const sunDisplay = new Date(sundayUtcMs);
  const weekLabel = `${fmtShort(monDisplay)} – ${fmtFull(sunDisplay)}`;

  return { mondayDhaka, sundayDhaka, mondayUtc, sundayUtc, weekLabel, currentMonthStart };
}

// ── Supabase REST helpers ──────────────────────────────────────────────────────
async function sbGet<T = Record<string, unknown>>(
  table: string,
  query = '',
): Promise<T[]> {
  const url = `${SB_URL}/rest/v1/${table}${query}`;
  const r = await fetch(url, { headers: SB_HEADERS });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(`sbGet ${table} ${r.status}: ${msg.slice(0, 200)}`);
  }
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

// ── 1. Total collections this week ────────────────────────────────────────────
/**
 * Sums all transaction amounts where fiscal_day is within the week.
 * transactions.fiscal_day is stored as 'YYYY-MM-DD' (Dhaka calendar day).
 */
async function fetchWeeklyCollections(mondayDhaka: string, sundayDhaka: string): Promise<number> {
  // Use PostgREST range filter on fiscal_day (text comparison works for YYYY-MM-DD)
  const rows = await sbGet<{ amount: string | number }>(
    'transactions',
    `?select=amount&tenant_id=eq.${TENANT}&fiscal_day=gte.${mondayDhaka}&fiscal_day=lte.${sundayDhaka}`,
  );
  return rows.reduce((sum, r) => sum + Math.max(0, +(r.amount ?? 0)), 0);
}

// ── 2. Reservations overlapping the week ─────────────────────────────────────
/**
 * Fetches all reservations whose stay overlaps with [mondayDhaka, sundayDhaka].
 * A reservation overlaps if check_in <= sundayDhaka AND check_out >= mondayDhaka.
 */
interface Reservation {
  id: string;
  guest_name?: string;
  room_number?: string | number;
  room_ids?: string | number[] | null;
  room_type?: string;
  check_in: string;
  check_out: string;
  total_amount?: string | number;
  paid_amount?: string | number;
  status?: string;
  created_at: string;
  rate_per_night?: string | number;
}

async function fetchWeekReservations(
  mondayDhaka: string,
  sundayDhaka: string,
): Promise<Reservation[]> {
  return sbGet<Reservation>(
    'reservations',
    `?select=id,guest_name,room_number,room_ids,room_type,check_in,check_out,total_amount,paid_amount,status,created_at,rate_per_night` +
    `&tenant_id=eq.${TENANT}` +
    `&check_in=lte.${sundayDhaka}` +
    `&check_out=gte.${mondayDhaka}`,
  );
}

// ── 3. Total room count from `rooms` table ────────────────────────────────────
async function fetchTotalRooms(): Promise<number> {
  try {
    const rows = await sbGet<{ id: string }>(
      'rooms',
      `?select=id&tenant_id=eq.${TENANT}`,
    );
    return rows.length > 0 ? rows.length : TOTAL_ROOMS_DEFAULT;
  } catch {
    return TOTAL_ROOMS_DEFAULT;
  }
}

// ── 4. Ghost / Carry-Over Dues ────────────────────────────────────────────────
/**
 * Returns reservations that:
 *   • Were created BEFORE the current calendar month (i.e., created_at < currentMonthStart)
 *   • Still have an outstanding balance: paid_amount < total_amount
 *   • Status indicates they are not yet fully resolved (PENDING, CHECKED_IN, CHECKED_OUT)
 *
 * These are "ghost dues" — old debts that linger on the books.
 * They are EXCLUDED from the weekly collection total and reported separately.
 */
async function fetchCarryOverDues(currentMonthStart: string): Promise<CarryOverDue[]> {
  const rows = await sbGet<Reservation>(
    'reservations',
    `?select=id,guest_name,room_number,check_in,check_out,total_amount,paid_amount,created_at,status` +
    `&tenant_id=eq.${TENANT}` +
    // created before this month
    `&created_at=lt.${currentMonthStart}T00:00:00+06:00` +
    // still has a balance (paid_amount < total_amount via SupaBase RPC isn't available, so we filter client-side below)
    // Filter status: open debts only (not already archived/cancelled)
    `&status=in.(PENDING,CHECKED_IN,CHECKED_OUT)`,
  );

  // Client-side filter: only keep rows where paid_amount < total_amount (actual unpaid balance > 0)
  return rows
    .filter((r) => {
      const total = +(r.total_amount ?? 0);
      const paid  = +(r.paid_amount ?? 0);
      return total > 0 && paid < total;
    })
    .map((r): CarryOverDue => ({
      guestName:   r.guest_name ?? 'Unknown Guest',
      roomNumber:  String(r.room_number ?? '—'),
      checkIn:     r.check_in,
      checkOut:    r.check_out,
      totalAmount: +(r.total_amount ?? 0),
      paidAmount:  +(r.paid_amount ?? 0),
      dueAmount:   Math.max(0, +(r.total_amount ?? 0) - +(r.paid_amount ?? 0)),
      createdAt:   r.created_at,
    }));
}

// ── 5. Compute room-night stats from reservations ────────────────────────────
/**
 * For each reservation overlapping the week, count the number of nights
 * that fall within the week boundary, and accumulate revenue by room type.
 *
 * Room nights = nights within [weekStart, weekEnd] for each reservation.
 * Revenue is prorated: (nights_in_week / total_nights) × total_amount.
 */
interface RoomNightStats {
  totalRoomNights: number;
  totalRoomRevenue: number;
  breakdown: RoomBreakdown[];
}

function computeRoomNightStats(
  reservations: Reservation[],
  mondayDhaka: string,
  sundayDhaka: string,
): RoomNightStats {
  const byType: Record<string, { nights: number; revenue: number }> = {};
  let totalRoomNights = 0;
  let totalRoomRevenue = 0;

  const weekStart = new Date(mondayDhaka + 'T00:00:00Z');
  const weekEnd   = new Date(sundayDhaka + 'T23:59:59Z');

  for (const r of reservations) {
    if (!r.check_in || !r.check_out) continue;

    const ciRaw = new Date(r.check_in + 'T00:00:00Z');
    const coRaw = new Date(r.check_out + 'T00:00:00Z');

    // Clamp to week boundaries
    const effectiveStart = ciRaw < weekStart ? weekStart : ciRaw;
    const effectiveEnd   = coRaw > weekEnd   ? weekEnd   : coRaw;

    const nightsInWeek = Math.max(
      0,
      Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000),
    );
    if (nightsInWeek === 0) continue;

    // Prorate revenue for nights that fall within this week
    const totalNights = Math.max(
      1,
      Math.round((coRaw.getTime() - ciRaw.getTime()) / 86400000),
    );
    const totalAmt = +(r.total_amount ?? 0);
    const weekRevenue = totalAmt > 0
      ? (nightsInWeek / totalNights) * totalAmt
      : (+(r.rate_per_night ?? 0)) * nightsInWeek;

    // Determine room type label
    const roomType = r.room_type
      || (r.room_number ? `Room ${r.room_number}` : 'Unknown');

    byType[roomType] = byType[roomType] ?? { nights: 0, revenue: 0 };
    byType[roomType].nights  += nightsInWeek;
    byType[roomType].revenue += weekRevenue;

    totalRoomNights  += nightsInWeek;
    totalRoomRevenue += weekRevenue;
  }

  const breakdown: RoomBreakdown[] = Object.entries(byType)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([roomType, { nights, revenue }]) => ({
      roomType,
      roomNights: nights,
      revenue: Math.round(revenue),
    }));

  return { totalRoomNights, totalRoomRevenue: Math.round(totalRoomRevenue), breakdown };
}

// ── 6. Send email via Brevo ────────────────────────────────────────────────────
async function sendBrevoEmail(
  to: string,
  subject: string,
  htmlContent: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!BREVO_KEY) {
    return { ok: false, error: 'BREVO_API_KEY not configured' };
  }

  const body = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent,
  };

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    return {
      ok: false,
      error: d?.message ?? `Brevo ${r.status}`,
    };
  }

  return { ok: true, messageId: d?.messageId };
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const startTime = Date.now();
  const errors: string[] = [];

  try {
    // ── Step 1: Compute week boundaries ─────────────────────────────────────
    const {
      mondayDhaka,
      sundayDhaka,
      weekLabel,
      currentMonthStart,
    } = getWeekBoundaries();

    console.log(`[weekly-report] Week: ${weekLabel} (${mondayDhaka} → ${sundayDhaka})`);
    console.log(`[weekly-report] Ghost due cutoff: before ${currentMonthStart}`);

    // ── Step 2: Parallel data fetches ────────────────────────────────────────
    const [
      weeklyCollections,
      weekReservations,
      totalRooms,
      carryOverDues,
    ] = await Promise.all([
      fetchWeeklyCollections(mondayDhaka, sundayDhaka).catch((e) => {
        errors.push(`Collections fetch error: ${e}`);
        return 0;
      }),
      fetchWeekReservations(mondayDhaka, sundayDhaka).catch((e) => {
        errors.push(`Reservations fetch error: ${e}`);
        return [] as Reservation[];
      }),
      fetchTotalRooms().catch(() => TOTAL_ROOMS_DEFAULT),
      fetchCarryOverDues(currentMonthStart).catch((e) => {
        errors.push(`Carry-over dues fetch error: ${e}`);
        return [] as CarryOverDue[];
      }),
    ]);

    // ── Step 3: Compute room-night statistics ────────────────────────────────
    const { totalRoomNights, totalRoomRevenue, breakdown } = computeRoomNightStats(
      weekReservations,
      mondayDhaka,
      sundayDhaka,
    );

    // ── Step 4: Derived KPIs ─────────────────────────────────────────────────
    const maxPossibleNights = totalRooms * 7;
    const occupancyRate = maxPossibleNights > 0
      ? Math.min(100, (totalRoomNights / maxPossibleNights) * 100)
      : 0;

    const avgDailyRate = totalRoomNights > 0
      ? totalRoomRevenue / totalRoomNights
      : 0;

    // Generated-at timestamp in Dhaka
    const generatedAt = new Date().toLocaleString('en-US', {
      timeZone: TZ,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // ── Step 5: Build report object ──────────────────────────────────────────
    const reportData: WeeklyReportData = {
      weekLabel,
      weekStart: mondayDhaka,
      weekEnd:   sundayDhaka,
      totalCollections: weeklyCollections,
      totalRoomNights,
      totalRooms,
      occupancyRate,
      avgDailyRate,
      roomBreakdown: breakdown,
      carryOverDues,
      generatedAt,
    };

    console.log('[weekly-report] Report data:', JSON.stringify({
      weekLabel,
      totalCollections: weeklyCollections,
      totalRoomNights,
      occupancyRate: occupancyRate.toFixed(1) + '%',
      avgDailyRate: Math.round(avgDailyRate),
      carryOverDuesCount: carryOverDues.length,
      totalRooms,
    }));

    // ── Step 6: Build & send email ───────────────────────────────────────────
    const emailSubject = `📊 Hotel Fountain — Weekly Report ${weekLabel}`;
    const emailHtml = buildWeeklyReportEmail(reportData);

    const emailResult = await sendBrevoEmail(OWNER_EMAIL, emailSubject, emailHtml);

    if (!emailResult.ok) {
      errors.push(`Email send error: ${emailResult.error}`);
      console.error('[weekly-report] Email failed:', emailResult.error);
    } else {
      console.log('[weekly-report] Email sent. Brevo messageId:', emailResult.messageId);
    }

    // ── Step 7: Log run to workflow_runs ─────────────────────────────────────
    try {
      await fetch(`${SB_URL}/rest/v1/workflow_runs`, {
        method: 'POST',
        headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify({
          workflow_name: 'weekly-report',
          status: emailResult.ok ? 'success' : 'partial',
          duration_ms: Date.now() - startTime,
          records_processed: weekReservations.length,
          ran_at: new Date().toISOString(),
          metadata: {
            weekLabel,
            totalCollections: weeklyCollections,
            totalRoomNights,
            occupancyRate,
            avgDailyRate,
            carryOverDuesCount: carryOverDues.length,
            emailSent: emailResult.ok,
            emailMessageId: emailResult.messageId,
            errors,
          },
          tenant_id: TENANT,
        }),
      });
    } catch (logErr) {
      // Non-fatal: don't let a logging failure break the response
      console.warn('[weekly-report] workflow_runs log failed:', logErr);
    }

    // ── Step 8: Return JSON response ─────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        weekLabel,
        weekStart: mondayDhaka,
        weekEnd: sundayDhaka,
        totalCollections: weeklyCollections,
        totalRoomNights,
        totalRooms,
        occupancyRate: +occupancyRate.toFixed(2),
        avgDailyRate: Math.round(avgDailyRate),
        roomBreakdown: breakdown,
        carryOverDues: {
          count: carryOverDues.length,
          totalOutstanding: carryOverDues.reduce((s, d) => s + d.dueAmount, 0),
          records: carryOverDues,
        },
        emailSent: emailResult.ok,
        emailMessageId: emailResult.messageId,
        duration_ms: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...CORS, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (fatal) {
    console.error('[weekly-report] Fatal error:', fatal);
    return new Response(
      JSON.stringify({ success: false, error: String(fatal), errors }),
      {
        headers: { ...CORS, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
