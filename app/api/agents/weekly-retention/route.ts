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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: guests, error } = await supabase
    .from('guests')
    .select('id, name, email, phone, total_stays, last_contacted, marketing_opt_out')
    .eq('tenant_id', TENANT)
    .gte('total_stays', 1)
    .or(`last_contacted.is.null,last_contacted.lt.${thirtyDaysAgo}`)
    .eq('marketing_opt_out', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const queued = [];

  for (const guest of guests ?? []) {
    const { data: stays } = await supabase
      .from('reservations')
      .select('check_in, check_out, room_type, total_amount')
      .eq('tenant_id', TENANT)
      .eq('guest_id', guest.id)
      .order('check_out', { ascending: false })
      .limit(2);

    const ltv = (stays ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const lastStay = stays?.[0]?.check_out ?? null;
    const daysSinceStay = lastStay
      ? Math.floor((Date.now() - new Date(lastStay).getTime()) / 86400000)
      : 999;

    const tier =
      guest.total_stays >= 5 || ltv > 50000 ? 'VIP'
      : daysSinceStay > 90 ? 'Lapsed'
      : 'Regular';

    const message =
      tier === 'VIP'
        ? `Dear ${guest.name}, as one of our most valued guests, we'd love to welcome you back to Hotel Fountain. Enjoy a complimentary room upgrade on your next stay. Book via WhatsApp or call us directly.`
        : tier === 'Lapsed'
        ? `Dear ${guest.name}, we miss you at Hotel Fountain! Return this month and enjoy a special discount. Reply YES for details.`
        : `Dear ${guest.name}, thank you for choosing Hotel Fountain. We hope to see you again soon — your preferred room is ready for you.`;

    await supabase.from('review_queue').insert({
      tenant_id: TENANT,
      type: 'retention_outreach',
      guest_id: guest.id,
      content: message,
      tier,
      channel: tier === 'VIP' ? 'email+sms' : tier === 'Lapsed' ? 'sms' : 'email',
      status: 'pending_approval',
      auto_send: false,
      created_at: new Date().toISOString(),
    });

    await supabase
      .from('guests')
      .update({ last_contacted: new Date().toISOString() })
      .eq('id', guest.id);

    queued.push({ guest: guest.name, tier, channel: tier === 'VIP' ? 'email+sms' : tier === 'Lapsed' ? 'sms' : 'email' });
  }

  await supabase.from('notifications_log').insert({
    tenant_id: TENANT,
    workflow: 'guest-retention',
    body: `Retention run complete: ${queued.length} drafts queued for approval.`,
    status: 'success',
    triggered_by: 'cron:weekly-retention',
  });

  return NextResponse.json({ ok: true, queued_count: queued.length, guests: queued });
}
