import { NextResponse } from 'next/server';

const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
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
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const { today, startUtc, endUtc } = dhakaDay();

  // ── REVENUE MANAGER ──────────────────────────────────────────────
  try {
    const txns = await dbGet(
      'transactions',
      `select=amount,type&tenant_id=eq.${TENANT}&created_at=gte.${startUtc}&created_at=lte.${endUtc}`
    );
    const txnTotal = (txns ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

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
    const roomCount = Number(process.env.HOTEL_ROOM_COUNT || 24);
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

  // ── AUTOMATED MARKETER ───────────────────────────────────────────
  try {
    const waDefault = (process.env.HOTEL_WHATSAPP || '8801322840799').replace(/[^0-9]/g, '');
    let waNumber = waDefault;
    try {
      const waSetting = await dbGet(
        'hotel_settings',
        `select=value&tenant_id=eq.${TENANT}&key=eq.whatsapp_number&limit=1`
      );
      waNumber = (waSetting?.[0]?.value ?? waDefault).replace(/[^0-9]/g, '');
    } catch { /* use default */ }
    const waLink = `https://wa.me/${waNumber}`;

    let postBody = '';

    try {
      const approvedContent = await dbGet(
        'marketing_content',
        `select=*&tenant_id=eq.${TENANT}&status=eq.approved&scheduled_date=eq.${today}&order=priority.asc&limit=1`
      );
      if (approvedContent?.length > 0) postBody = approvedContent[0].content;
    } catch { /* fall through to room-of-day */ }

    if (!postBody) {
      try {
        const rooms = await dbGet(
          'rooms',
          `select=name,room_type,rate,features&tenant_id=eq.${TENANT}&status=eq.AVAILABLE&limit=1`
        );
        if (rooms?.length > 0) {
          const room = rooms[0];
          const hotelName = process.env.HOTEL_NAME || 'Hotel Fountain BD';
          const hotelCity = process.env.HOTEL_CITY || 'Dhaka';
          postBody = `🏨 Room of the Day — ${room.name}\n\n✨ ${room.room_type} | ৳${room.rate}/night\n\n📞 Book now via WhatsApp: ${waLink}\n\n#${hotelName.replace(/\s+/g,'')} #${hotelCity} #HotelBD`;
        }
      } catch { /* no rooms */ }
    }

    if (postBody) {
      const fbRes = await fetch(
        `https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/feed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: postBody, access_token: process.env.FACEBOOK_PAGE_TOKEN }),
        }
      );
      const fbData = await fbRes.json();

      try {
        await dbPost('notifications_log', {
          tenant_id: TENANT,
          workflow: 'automated-marketer',
          body: fbData.id
            ? `Facebook post published: ${fbData.id}`
            : `Facebook post failed: ${JSON.stringify(fbData)}`,
          status: fbData.id ? 'success' : 'error',
          triggered_by: 'cron:daily-ops',
        });
      } catch { /* non-fatal */ }

      results.automated_marketer = { published: !!fbData.id, post_id: fbData.id ?? null };
    } else {
      results.automated_marketer = { skipped: 'no content or available rooms' };
    }
  } catch (e) {
    results.automated_marketer = { error: String(e) };
  }

  return NextResponse.json({ ok: true, date: new Date().toISOString(), dhaka_date: today, results });
}
