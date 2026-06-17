// Hotel Fountain — Deterministic Occupancy Demand Forecast (reservation-centric)
// Pure module, no I/O, no deps. Shared by wf-demand-forecast + wf-seo-lead-morning.

// Active = future/occupying demand. Excludes CHECKED_OUT, CANCELLED, NO_SHOW.
const ACTIVE = new Set(['RESERVED', 'CHECKED_IN', 'CONFIRMED', 'PENDING']);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Bangladesh weekend = Friday(5) & Saturday(6)
const isWeekendDow = (d: number) => d === 5 || d === 6;
// check_in/check_out are timestamptz; reduce to the calendar date (YYYY-MM-DD).
const dpart = (v: unknown) => (v == null ? '' : String(v).slice(0, 10));

export type Demand = 'HIGH' | 'MED' | 'LOW';

export interface ReservationLike {
  check_in?: string | null;
  check_out?: string | null;
  room_ids?: (string | number)[] | null;
  room_number?: string | number | null;
  status?: string | null;
}

export interface DayForecast {
  date: string; dow: string; isWeekend: boolean;
  occupied: number; free: number; occPct: number; demand: Demand;
}

export interface ForecastSummary {
  horizonDays: number; totalRooms: number; startDate: string;
  days: DayForecast[]; avgOccPct: number; roomNightsFree: number;
  weekdayGapPct: number; weekendGapPct: number; overallDemand: Demand;
}

export function dhakaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const tier = (occPct: number): Demand => (occPct >= 75 ? 'HIGH' : occPct >= 45 ? 'MED' : 'LOW');

export function computeForecast(
  reservations: ReservationLike[],
  totalRooms: number,
  horizonDays = 14,
  startDate: string = dhakaToday(),
): ForecastSummary {
  const start = new Date(startDate + 'T00:00:00Z').getTime();
  const dates: string[] = [];
  for (let i = 0; i < horizonDays; i++) {
    dates.push(new Date(start + i * 86400000).toISOString().slice(0, 10));
  }

  // Normalise to dates; keep only valid, occupancy-relevant reservations.
  // A stay occupies nights [check_in, check_out) — checkout DAY is NOT occupied.
  const active = (reservations || []).map((r) => ({
    ci: dpart(r.check_in),
    co: dpart(r.check_out),
    ids: (r.room_ids && r.room_ids.length) ? r.room_ids
      : (r.room_number != null ? [r.room_number] : []),
    status: String(r.status || '').toUpperCase(),
  })).filter((r) => ACTIVE.has(r.status) && r.ci && r.co && r.co > r.ci);

  const days: DayForecast[] = dates.map((date) => {
    const rooms = new Set<string>();
    for (const r of active) {
      if (r.ci <= date && r.co > date) {
        for (const id of r.ids) { const s = String(id).trim(); if (s) rooms.add(s); }
      }
    }
    // Cap at room count so overbooked/dirty data can never exceed 100%.
    const occupied = Math.min(rooms.size, totalRooms);
    const free = Math.max(0, totalRooms - occupied);
    const occPct = totalRooms > 0 ? Math.round((occupied * 100) / totalRooms) : 0;
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    return { date, dow: DOW[dow], isWeekend: isWeekendDow(dow), occupied, free, occPct, demand: tier(occPct) };
  });

  const n = days.length || 1;
  const avgOccPct = Math.round(days.reduce((a, d) => a + d.occPct, 0) / n);
  const roomNightsFree = days.reduce((a, d) => a + d.free, 0);
  const avgFree = (arr: DayForecast[]) =>
    arr.length ? Math.round(arr.reduce((a, d) => a + (100 - d.occPct), 0) / arr.length) : 0;
  const wk = days.filter((d) => !d.isWeekend);
  const we = days.filter((d) => d.isWeekend);

  return {
    horizonDays, totalRooms, startDate, days, avgOccPct, roomNightsFree,
    weekdayGapPct: avgFree(wk), weekendGapPct: avgFree(we), overallDemand: tier(avgOccPct),
  };
}

// Demand-gap -> prospecting plan
export interface ProspectingPlan {
  emphasis: string[];
  perCategory: Record<string, number>;
  demandContext: string;
  headline: string;
}

const SEG_ALL = ['corporate', 'events', 'travel', 'embassy', 'airlines'];

export function planProspecting(f: ForecastSummary): ProspectingPlan {
  // Business segments fill weekdays; leisure/event segments fill weekends.
  const weekdaySoft = f.weekdayGapPct >= 55;
  const weekendSoft = f.weekendGapPct >= 55;
  const emphasis: string[] = [];
  if (weekdaySoft) emphasis.push('corporate', 'embassy', 'airlines');
  if (weekendSoft) emphasis.push('events', 'travel');
  if (!emphasis.length) emphasis.push('corporate', 'events'); // balanced fallback

  const base = f.overallDemand === 'LOW' ? 4 : f.overallDemand === 'MED' ? 3 : 2;
  const perCategory: Record<string, number> = {};
  for (const s of SEG_ALL) perCategory[s] = emphasis.includes(s) ? base : Math.max(2, base - 1);

  const headline =
    `Next ${f.horizonDays}d: avg occupancy ${f.avgOccPct}% (${f.overallDemand}). ` +
    `~${f.roomNightsFree} room-nights to fill - weekday gap ${f.weekdayGapPct}%, weekend gap ${f.weekendGapPct}%.`;

  const focusTxt = emphasis.length
    ? `Prioritise these segments to fill the gap: ${[...new Set(emphasis)].join(', ')}.`
    : 'Maintain balanced prospecting across all segments.';

  const demandContext =
    `OCCUPANCY OUTLOOK (next ${f.horizonDays} days, ${f.totalRooms} rooms): ` +
    `average occupancy is ${f.avgOccPct}% (${f.overallDemand} demand). ` +
    `Roughly ${f.roomNightsFree} room-nights are currently unsold. ` +
    `Weekday rooms are ${f.weekdayGapPct}% empty on average; weekend rooms ${f.weekendGapPct}% empty. ` +
    `${focusTxt} Tailor each lead's booking_need and outreach_angle to fill these specific empty nights.`;

  return { emphasis: [...new Set(emphasis)], perCategory, demandContext, headline };
}
