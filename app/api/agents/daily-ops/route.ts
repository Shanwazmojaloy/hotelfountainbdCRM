import { NextResponse } from 'next/server';
import { activeOpsTenants } from '../_tenants';
import { getTenantById } from '@/lib/tenant';
import { sendMail } from '@/lib/mailer';

const BASE   = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

export const runtime = 'nodejs';
export const maxDuration = 60;

function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };
}

async function dbGet(table: string, query: string) {
  const res = await fetch(`${BASE}/${table}?${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${table}: ${await res.text()}`);
  return res.json();
}

async function dbPost(table: string, body: object) {
  const res = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${table}: ${await res.text()}`);
}

async function dbUpsert(table: string, body: object, onConflict: string) {
  const res = await fetch(`${BASE}/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`UPSERT ${table}: ${await res.text()}`);
}

// Dhaka = UTC+6. Returns { today, startUtc, endUtc }
function dhakaDay() {
  const nowUtc = new Date();
  const dhakaMs = nowUtc.getTime() + 6 * 60 * 60 * 1000;
  const dhakaDate = new Date(dhakaMs);
  const today = dhakaDate.toISOString().split('T')[0]; // YYYY-MM-DD in Dhaka time
  const startUtc = new Date(`${today}T00:00:00+06:00`).toISOString();
  const endUtc   = new Date(`${today}T23:59:59+06:00`).toISOString();
  return { today, startUtc, endUtc };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { today } = dhakaDay();
  // Per-hotel operations: run revenue-manager + automated-marketer once per
  // active tenant, each using its own settings/FB credentials (env fallback).
  const tenants = await activeOpsTenants();
  const perTenant: Array<Record<string, unknown>> = [];

  for (const t of tenants) {
    const TENANT = t.id;
    const results: Record<string, unknown> = { tenant_id: TENANT };

    // ── REVENUE MANAGER ──────────────────────────────────────────────
    try {
      const txns = await dbGet(
        'transactions',
        `select=amount,type&tenant_id=eq.${TENANT}&fiscal_day=eq.${today}`
      );
      // Exclude Balance Carried Forward — these are accounting entries, not real cash.
      // Matches the CRM BillingPage _bizDayTotalFn logic exactly.
      const txnTotal = (txns ?? [])
        .filter((r: Record<string, unknown>) => !/balance carried forward/i.test(String(r.type ?? '')))
        .reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount ?? 0), 0);

      let closingTotal = 0;
      try {
        const closing = await dbGet(
          'daily_closing',
          `select=total_revenue&tenant_id=eq.${TENANT}&fiscal_day=eq.${today}&limit=1`
        );
        closingTotal = Number(closing?.[0]?.total_revenue ?? 0);
      } catch { /* no closing record yet */ }

      const variance = Math.abs(txnTotal - closingTotal);

      const checkedIn = await dbGet(
        'reservations',
        `select=id&tenant_id=eq.${TENANT}&status=eq.CHECKED_IN`
      );
      const roomCount = Number(t.hotel_room_count ?? process.env.HOTEL_ROOM_COUNT ?? 24);
      const occupancy = ((checkedIn?.length ?? 0) / roomCount) * 100;

      const alerts: { severity: string; body: string }[] = [];

      if (variance > 500) {
        alerts.push({ severity: 'HIGH', body: `Revenue variance ৳${variance.toFixed(0)} exceeds ৳500 threshold. Transactions: ৳${txnTotal.toFixed(0)}, Closing: ৳${closingTotal.toFixed(0)}` });
      }
      if (occupancy < 40) {
        alerts.push({ severity: 'MEDIUM', body: `Occupancy ${occupancy.toFixed(0)}% below 40% threshold (${checkedIn?.length ?? 0}/${roomCount} rooms)` });
      }
      if (txnTotal < 20000) {
        alerts.push({ severity: 'LOW', body: `Daily revenue ৳${txnTotal.toFixed(0)} below ৳20,000 threshold` });
      }

      for (const alert of alerts) {
        try {
          await dbPost('notifications_log', {
            tenant_id: TENANT,
            workflow: 'revenue-manager',
            body: alert.body,
            status: alert.severity.toLowerCase(),
            triggered_by: 'cron:daily-ops',
          });
        } catch { /* non-fatal */ }
      }

      // Persist the agent-verified daily revenue snapshot to its own isolated
      // table (NOT daily_closing — that is the human night-audit/close-day
      // ledger). Idempotent per (tenant_id, fiscal_day). Non-fatal.
      try {
        await dbUpsert('agent_revenue_snapshot', {
          tenant_id: TENANT,
          fiscal_day: today,
          total_revenue: txnTotal,
          occupancy_pct: Number(occupancy.toFixed(1)),
          variance,
          agent_verified: true,
        }, 'tenant_id,fiscal_day');
      } catch { /* non-fatal */ }

      results.revenue_manager = {
        alerts: alerts.length,
        occupancy: `${occupancy.toFixed(0)}%`,
        revenue: `৳${txnTotal.toFixed(0)}`,
        dhaka_date: today,
      };
    } catch (e) {
      results.revenue_manager = { error: String(e) };
    }

    // ── CLOSE-DAY LAG WATCH ──────────────────────────────────────────
    // Owner decision 2026-08-15: "Closing Complete" is a HUMAN checkpoint and
    // must NEVER be automated — the button is someone confirming the drawer
    // against the till, and a cron would close the day whether or not anyone
    // counted. So this does not close anything. It only notices when the open
    // business day has fallen behind and tells the owner.
    //
    // Why it exists: the last close was 2026-08-09 and by 2026-08-16 nobody had
    // pressed the button, so six days of movements had accumulated into one
    // "open day" — a booking made on the 16th showed up under the 10-Aug report.
    // Nothing was broken; it just slipped by unnoticed, because nothing was
    // watching.
    //
    // ALERT, NOT NAG. Silence is the normal state:
    //   lag 0-1  nothing. A hotel that closes yesterday's day this morning is
    //            behaving correctly and must never hear from this.
    //   lag 2-7  once each morning. Once the books are genuinely behind, an
    //            outstanding alarm SHOULD keep sounding — it self-silences the
    //            moment the day is closed. (First draft escalated to weekly
    //            after day 3, which was silent at lag 4-6; the real incident sat
    //            at lag 6, so the rule would have said nothing about the very
    //            situation that prompted it.)
    //   lag 8+   weekly only, so an abandoned instance does not mail forever.
    // Stateless by design — the rule is a pure function of the lag, so there is
    // no per-alert bookkeeping table to drift or to grant. Threshold override:
    // CLOSE_DAY_LAG_ALERT_DAYS.
    try {
      const minLag = parseInt(process.env.CLOSE_DAY_LAG_ALERT_DAYS || '2', 10);
      const closedRows = await dbGet(
        'night_audit_log',
        `select=audit_date&tenant_id=eq.${TENANT}&status=eq.closed&order=audit_date.desc&limit=1`,
      );

      if (!Array.isArray(closedRows) || closedRows.length === 0) {
        // No close has ever been recorded for this tenant. That is a new-hotel
        // state, not a lag — say so and stay quiet.
        results.close_day_watch = { skipped: 'no closed day on record' };
      } else {
        const lastClosed = String(closedRows[0].audit_date).slice(0, 10);
        // The open business day is the day after the last closed one
        // (src/lib/businessDay.ts uses the same rule).
        const openDay = new Date(`${lastClosed}T00:00:00Z`);
        openDay.setUTCDate(openDay.getUTCDate() + 1);
        const openDayStr = openDay.toISOString().slice(0, 10);

        const lagDays = Math.round(
          (Date.parse(`${today}T00:00:00Z`) - openDay.getTime()) / 86_400_000,
        );

        const shouldAlert = lagDays >= minLag && (lagDays <= 7 || lagDays % 7 === 0);

        if (shouldAlert) {
          const cfg = await getTenantById(TENANT);
          const to = cfg?.alert_email || process.env.ALERT_EMAIL || 'shanwazahmed@fountainbd.com';
          const hotel = cfg?.hotel_name || 'the hotel';
          const dayWord = lagDays === 1 ? 'day' : 'days';
          const html =
            `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#2D2A26;">` +
            `<h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">Night audit is ${lagDays} ${dayWord} behind</h2>` +
            `<p>The open business day for <b>${hotel}</b> is still <b>${openDayStr}</b>. ` +
            `Today is <b>${today}</b> (Dhaka).</p>` +
            `<p>Last completed close: <b>${lastClosed}</b>.</p>` +
            `<p>Until the day is closed, every movement keeps landing in that one open day, so the ` +
            `Daily report covers a widening window rather than a single day.</p>` +
            `<p style="margin-top:14px;padding:10px 14px;background:#FBF1DD;border:1px solid #D9A441;border-radius:6px;">` +
            `Nothing has been closed automatically, and nothing will be. Closing Complete stays a ` +
            `human step — press it in <b>Reports → Daily</b>, one day at a time, oldest first.</p>` +
            `<p style="margin-top:16px;font-size:12px;color:#7A7268;">Sent by the close-day lag watch in daily-ops. ` +
            `It stays silent while the audit is within ${minLag} ${minLag === 1 ? 'day' : 'days'}, ` +
            `then reports each morning up to a week behind and weekly after that.</p></div>`;

          await sendMail({
            to,
            subject: `Night audit ${lagDays} ${dayWord} behind — open day still ${openDayStr}`,
            html,
            text:
              `Night audit is ${lagDays} ${dayWord} behind.\n` +
              `Open business day: ${openDayStr}. Today (Dhaka): ${today}. Last close: ${lastClosed}.\n` +
              `Nothing was closed automatically. Press Closing Complete in Reports > Daily, oldest day first.`,
          });
          results.close_day_watch = { alerted: true, lag_days: lagDays, open_day: openDayStr, to };
        } else {
          results.close_day_watch = { alerted: false, lag_days: lagDays, open_day: openDayStr };
        }
      }
    } catch (e) {
      // Non-fatal, exactly like the other blocks here — a watchdog must never be
      // the reason the ops run fails.
      results.close_day_watch = { error: String(e) };
    }

    // ── AUTOMATED MARKETER — RETIRED 2026-07-04 (PR #60) ─────────────
    // daily-ops no longer posts to Facebook. Publishing moved to
    // /api/agents/marketing-publisher, which only posts content_calendar rows a
    // human approved in /crm/marketing (approved_channel='HUMAN'). The block that
    // lived here auto-posted an ungated "Room of the Day" whenever page
    // credentials existed — it never actually ran (the env token had expired),
    // but with the renewed 2026-07-04 page token it would have come back to life
    // on the next deploy. Do not restore an unapproved posting path.
    results.automated_marketer = {
      skipped: 'superseded by marketing-publisher (human-approved content only)',
    };

    perTenant.push(results);
  }

  return NextResponse.json({
    ok: true,
    date: new Date().toISOString(),
    dhaka_date: today,
    tenant_count: perTenant.length,
    tenants: perTenant,
  });
}
