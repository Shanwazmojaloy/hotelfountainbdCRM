import { NextResponse } from 'next/server';
import { activeOpsTenants } from '../_tenants';

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
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Per-hotel operations: queue retention drafts once per active tenant.
  const tenants = await activeOpsTenants();
  const perTenant: Array<Record<string, unknown>> = [];

  for (const t of tenants) {
    const TENANT     = t.id;
    const hotelName  = t.hotel_name || HOTEL_NAME;

    let guests: Record<string, unknown>[];
    try {
      guests = await dbGet(
        'guests',
        `select=id,name,email,phone,total_stays,last_contacted,marketing_opt_out` +
        `&tenant_id=eq.${TENANT}` +
        `&total_stays=gte.1` +
        `&or=(last_contacted.is.null,last_contacted.lt.${thirtyDaysAgo})` +
        `&marketing_opt_out=eq.false`
      );
    } catch (e: unknown) {
      perTenant.push({ tenant_id: TENANT, error: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const queued = [];

    for (const _g of guests ?? []) {
      const guest = _g as { id: string; name: string; email: string; phone: string; total_stays: number; last_contacted: string | null; marketing_opt_out: boolean };
      let stays: Record<string, unknown>[] = [];
      try {
        stays = await dbGet(
          'reservations',
          `select=check_in,check_out,room_type,total_amount` +
          `&tenant_id=eq.${TENANT}` +
          `&guest_ids=cs.{${guest.id}}` +
          `&order=check_out.desc` +
          `&limit=2`
        );
      } catch { stays = []; }

      const ltv = stays.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_amount ?? 0), 0);
      const lastStay = (stays[0]?.check_out ?? null) as string | null;
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
          ? `Dear ${guest.name}, as one of our most valued guests, we'd love to welcome you back to ${hotelName}. Enjoy a complimentary room upgrade on your next stay. Book via WhatsApp or call us directly.`
          : tier === 'Lapsed'
          ? `Dear ${guest.name}, we miss you at ${hotelName}! Return this month and enjoy a special discount. Reply YES for details.`
          : `Dear ${guest.name}, thank you for choosing ${hotelName}. We hope to see you again soon — your preferred room is ready for you.`;

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

    perTenant.push({ tenant_id: TENANT, queued_count: queued.length, guests: queued });
  }

  return NextResponse.json({ ok: true, tenant_count: perTenant.length, tenants: perTenant });
}
