import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: Record<string, unknown> = {};

  // ── REVENUE MANAGER ──────────────────────────────────────────────
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: txns } = await supabase
      .from('transactions')
      .select('amount, type')
      .eq('tenant_id', TENANT)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    const txnTotal = (txns ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const { data: closing } = await supabase
      .from('daily_closing')
      .select('total_revenue')
      .eq('tenant_id', TENANT)
      .eq('date', today)
      .single();

    const closingTotal = Number(closing?.total_revenue ?? 0);
    const variance = Math.abs(txnTotal - closingTotal);

    const { data: checkedIn } = await supabase
      .from('reservations')
      .select('id')
      .eq('tenant_id', TENANT)
      .eq('status', 'CHECKED_IN');

    const occupancy = ((checkedIn?.length ?? 0) / 24) * 100;

    const alerts = [];

    if (variance > 500) {
      alerts.push({ severity: 'HIGH', body: `Revenue variance ৳${variance.toFixed(0)} exceeds ৳500 threshold. Transactions: ৳${txnTotal.toFixed(0)}, Closing: ৳${closingTotal.toFixed(0)}` });
    }
    if (occupancy < 40) {
      alerts.push({ severity: 'MEDIUM', body: `Occupancy ${occupancy.toFixed(0)}% below 40% threshold (${checkedIn?.length ?? 0}/24 rooms)` });
    }
    if (txnTotal < 20000) {
      alerts.push({ severity: 'LOW', body: `Daily revenue ৳${txnTotal.toFixed(0)} below ৳20,000 minimum threshold` });
    }

    for (const alert of alerts) {
      await supabase.from('notifications_log').insert({
        tenant_id: TENANT,
        workflow: 'revenue-manager',
        body: alert.body,
        status: alert.severity.toLowerCase(),
        triggered_by: 'cron:daily-ops',
      });
    }

    await supabase.from('daily_closing').upsert({
      tenant_id: TENANT,
      date: today,
      total_revenue: txnTotal,
      agent_verified: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,date' });

    results.revenue_manager = { alerts: alerts.length, occupancy: `${occupancy.toFixed(0)}%`, revenue: `৳${txnTotal.toFixed(0)}` };
  } catch (e) {
    results.revenue_manager = { error: String(e) };
  }

  // ── AUTOMATED MARKETER ───────────────────────────────────────────
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: approvedContent } = await supabase
      .from('marketing_content')
      .select('*')
      .eq('tenant_id', TENANT)
      .eq('status', 'approved')
      .eq('scheduled_date', today)
      .order('priority', { ascending: true })
      .limit(1);

    let postBody = '';

    if (approvedContent && approvedContent.length > 0) {
      postBody = approvedContent[0].content;
    } else {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('name, room_type, rate, features')
        .eq('tenant_id', TENANT)
        .eq('status', 'AVAILABLE')
        .limit(1);

      if (rooms && rooms.length > 0) {
        const room = rooms[0];
        postBody = `🏨 Room of the Day — ${room.name}\n\n✨ ${room.room_type} | ৳${room.rate}/night\n\n📞 Book now via WhatsApp: https://wa.me/8801XXXXXXXXX\n\n#HotelFountain #Dhaka #HotelBD`;
      }
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

      await supabase.from('notifications_log').insert({
        tenant_id: TENANT,
        workflow: 'automated-marketer',
        body: fbData.id ? `Facebook post published: ${fbData.id}` : `Facebook post failed: ${JSON.stringify(fbData)}`,
        status: fbData.id ? 'success' : 'error',
        triggered_by: 'cron:daily-ops',
      });

      results.automated_marketer = { published: !!fbData.id, post_id: fbData.id ?? null };
    } else {
      results.automated_marketer = { skipped: 'no content or available rooms' };
    }
  } catch (e) {
    results.automated_marketer = { error: String(e) };
  }

  return NextResponse.json({ ok: true, date: new Date().toISOString(), results });
}
