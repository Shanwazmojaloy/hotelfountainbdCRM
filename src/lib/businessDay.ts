// Business-day (night-audit) boundary — single source of truth, shared client + server.
//
// The OPEN business day is NOT the calendar date. It is (latest CLOSED audit day) + 1.
// All collections/check-ins accumulate into the open day — regardless of the wall-clock
// date — until "Closing Complete" snapshots it; the next day then opens automatically.
// Example: 9-Jun closed → open day = 10-Jun. Payments taken on calendar 10-Jun AND 11-Jun
// both stamp fiscal_day = 10-Jun, until 10-Jun is closed (→ open day becomes 11-Jun).

export function nextDay(ymd: string): string {
  const d = new Date(String(ymd).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const dhakaToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

type CloseRow = { audit_date?: string | null; status?: string | null };

// The currently OPEN business day. `closes` = rows from night_audit_log.
export function openBusinessDay(closes: CloseRow[] | null | undefined, today: string = dhakaToday()): string {
  const closed = (closes || [])
    .filter((c) => (c.status || 'closed') === 'closed' && c.audit_date)
    .map((c) => String(c.audit_date).slice(0, 10))
    .sort();
  if (!closed.length) return today;
  const open = nextDay(closed[closed.length - 1]);
  // never let the open day run ahead of the real calendar (e.g. a future-dated baseline)
  return open > today ? today : open;
}

// Clamp a requested fiscal_day to the open day: future-of-open requests (a modal defaulting
// to the calendar date) snap back to the open day; genuine back-dates (≤ open) are honored.
export function clampFiscalDay(requested: string | null | undefined, openDay: string): string {
  const r = (typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested)) ? requested.slice(0, 10) : '';
  if (!r) return openDay;
  return r > openDay ? openDay : r;
}
