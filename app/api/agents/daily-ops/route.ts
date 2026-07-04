import { NextResponse } from 'next/server';
import { activeOpsTenants } from '../_tenants';

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
          `select=total_revenue&tenant_id=eq.${TENANT}&date=eq.${today}&limit=1`
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

      try {
        await dbUpsert('daily_closing', {
          tenant_id: TENANT,
          date: today,
          total_revenue: txnTotal,
          agent_verified: true,
          updated_at: new Date().toISOString(),
        }, 'tenant_id,date');
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
