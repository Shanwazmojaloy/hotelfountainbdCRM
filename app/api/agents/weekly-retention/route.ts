import { NextResponse } from 'next/server';

const TENANT     = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const BASE       = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const HOTEL_NAME = process.env.HOTEL_NAME || 'Hotel Fountain';

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
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${table} failed: ${txt}`);
  }
  return res.json();
}

async function dbPost(table: string, body: object) {
  const res = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${table} failed: ${txt}`);
  }
}

async function dbPatch(table: string, filter: string, body: object) {
  const res = await fetch(`${BASE}/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PATCH ${table} failed: ${txt}`);
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let guests: any[];
  try {
    guests = await dbGet(
      'guests',
      `select=id,name,email,phone,total_stays,last_contacted,marketing_opt_out` +
      `&tenant_id=eq.${TENANT}` +
      `&total_stays=gte.1` +
      `&or=(last_contacted.is.null,last_contacted.lt.${thirtyDaysAgo})` +
      `&marketing_opt_out=eq.false`
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const queued = [];

  for (const guest of guests ?? []) {
    let stays: any[] = [];
    try {
      stays = await dbGet(
        'reservations',
        `select=check_in,check_out,room_type,total_amount` +
        `&tenant_id=eq.${TENANT}` +
        `&guest_id=eq.${guest.id}` +
        `&order=check_out.desc` +
        `&limit=2`
      );
    } catch { stays = []; }

    const ltv = stays.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
    const lastStay = stays[0]?.check_out ?? null;
    const daysSinceStay = lastStay
      ? Math.floor((Date.now() - new Date(lastStay).getTime()) / 86400000)
      : 999;

    const tier =
      guest.total_stays >= 5 || ltv > 50000 ? 'VIP'
      : daysSinceStay > 90 ? 'Lapsed'
      : 'Regular';

    const channel = tier === 'VIP' ? 'email+sms' : tier === 'Lapsed' ? 'sms' : 'email';

    const message =
      tier === 'VIP'
        ? `Dear ${guest.name}, as one of our most valued guests, we'd love to welcome you back to ${HOTEL_NAME}. Enjoy a complimentary room upgrade on your next stay. Book via WhatsApp or call us directly.`
        : tier === 'Lapsed'
        ? `Dear ${guest.name}, we miss you at ${HOTEL_NAME}! Return this month and enjoy a special discount. Reply YES for details.`
        : `Dear ${guest.name}, thank you for choosing ${HOTEL_NAME}. We hope to see you again soon — your preferred room is ready for you.`;

    try {
      await dbPost('review_queue', {
        tenant_id: TENANT,
        type: 'retention_outreach',
        guest_id: guest.id,
        content: message,
        tier,
        channel,
        status: 'pending_approval',
        auto_send: false,
        created_at: new Date().toISOString(),
      });
    } catch { /* non-fatal — queue may not exist yet */ }

    try {
      await dbPatch('guests', `id=eq.${guest.id}`, {
        last_contacted: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }

    queued.push({ guest: guest.name, tier, channel });
  }

  try {
    await dbPost('notifications_log', {
      tenant_id: TENANT,
      workflow: 'guest-retention',
      body: `Retention run complete: ${queued.length} drafts queued for approval.`,
      status: 'success',
      triggered_by: 'cron:weekly-retention',
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, queued_count: queued.length, guests: queued });
}
