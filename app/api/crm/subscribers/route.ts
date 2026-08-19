// GET/POST /api/crm/subscribers — Hotel Growth OS subscriber administration.
//
// PLATFORM route. This is not hotel operations: it lists every OTHER tenant on the
// platform, their billing state and their invoices. Role is deliberately not the only
// gate — demo_provision() gives every demo and every customer an OWNER-role account, so
// an owner check alone would hand each of them the whole subscriber book. Access requires
// the HOME tenant, exactly as /api/growth does, and answers 404 to everyone else so a
// customer never learns the route exists.
//
// Reads the hotel DB (tenants + platform_invoices), never the sales project. Writes go
// through the SECURITY DEFINER functions in growth-os/demo/006_subscriptions.sql so the
// money rules — paid_until never moves backwards, a void invoice cannot be verified —
// live in one place instead of being re-implemented here.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const HOME_TENANT = ENV_TENANT;
const ALLOWED_ROLES = new Set(['owner', 'admin']);
const PLATFORM_OWNER_EMAIL = 'ahmedshanwaz5@gmail.com';

// Card prices. sub_rate_bdt overrides these per tenant when a deal is negotiated.
const PLAN_RATE: Record<string, number> = { starter: 5000, growth: 15000, full: 30000 };
const PLANS = new Set(Object.keys(PLAN_RATE));
const METHODS = new Set(['bkash', 'nagad', 'bank', 'cash']);

async function auth(req: NextRequest) {
  const sess = requireSession(req);
  if (!sess) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const role = String(sess.role || '').trim().toLowerCase();
  if (!ALLOWED_ROLES.has(role)) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };

  // A missing tenant_id can only be a legacy cookie minted before tenant binding, i.e.
  // ours — every customer session is newer. Same fallback the other routes use.
  if ((sess.tenant_id || ENV_TENANT) !== HOME_TENANT) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  }

  const sb = tenantClient(HOME_TENANT);

  // Honour Logout All Devices.
  const home = tenantScoped(sb, HOME_TENANT);
  const { data: srow } = await home.from('staff').select('session_v, email').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return { error: NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 }) };
  }

  // Owner rule 2026-08-19: ONE person, not a role and not a tenant. This screen lists
  // every other hotel's plan, rate and payment state — a manager hired at Hotel Fountain
  // has no business reading a competitor's billing. Re-read from `staff` by session id;
  // the client's copy of the address only hides a nav pill.
  if (String(srow[0].email || '').trim().toLowerCase() !== PLATFORM_OWNER_EMAIL) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  }
  return { sb, sess };
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if ('error' in a) return a.error;
  try {
    // NOT tenantScoped: this view is cross-tenant by design and carries no tenant_id
    // column. The platform gate above is what authorises it.
    const { data, error } = await a.sb.from('vw_subscriber_access').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const { data: settings } = await a.sb.from('platform_billing_settings').select('*').eq('id', 1).limit(1);
    return NextResponse.json({ ok: true, rows: data || [], settings: (settings && settings[0]) || null });
  } catch (e: unknown) {
    console.error('[crm/subscribers GET]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load subscribers.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if ('error' in a) return a.error;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');
  const tenantId = String(body.tenant_id || '');
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  // Hotel Fountain is the platform owner, not a subscriber. Blocking or deleting it
  // from this screen would lock the operator out of their own hotel.
  if (tenantId && tenantId === HOME_TENANT) {
    return NextResponse.json({ error: 'Hotel Fountain is the platform owner and cannot be managed here.' }, { status: 400 });
  }

  try {
    switch (action) {
      // Demo → paying subscriber. Clearing demo_expires_at is what ends the trial clock;
      // the tenant, its rooms and everything the prospect built are kept untouched.
      case 'subscribe': {
        const plan = String(body.plan || '').toLowerCase();
        if (!PLANS.has(plan)) return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });
        const rate = Number(body.rate_bdt) > 0 ? Number(body.rate_bdt) : PLAN_RATE[plan];
        const { error } = await a.sb.from('tenants').update({
          plan_tier: plan, sub_status: 'active', sub_rate_bdt: rate,
          sub_started_on: new Date().toISOString().slice(0, 10),
          demo_expires_at: null, demo_locked_at: null, is_active: true,
        }).eq('id', tenantId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case 'set_plan': {
        const plan = String(body.plan || '').toLowerCase();
        if (!PLANS.has(plan)) return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });
        const rate = Number(body.rate_bdt) > 0 ? Number(body.rate_bdt) : PLAN_RATE[plan];
        const { error } = await a.sb.from('tenants').update({ plan_tier: plan, sub_rate_bdt: rate }).eq('id', tenantId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // Block / unblock. is_active is left ALONE on purpose: getTenantBySlug filters on
      // it, so flipping it 404s the whole subdomain instead of showing the payment screen.
      case 'block':
      case 'unblock': {
        const { error } = await a.sb.from('tenants')
          .update({ sub_status: action === 'block' ? 'blocked' : 'active' }).eq('id', tenantId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // Open this month's invoice rows for every active subscriber. Idempotent —
      // unique (tenant_id, period_month) means a second run bills nobody twice.
      case 'open_month': {
        const { data, error } = await a.sb.rpc('platform_open_month', { p_period: s(body.period) });
        if (error) throw error;
        return NextResponse.json({ ok: true, opened: data || [] });
      }

      // Marks the e-mail as delivered. Does NOT touch access — an invoice being sent is
      // not evidence of payment, and the two must never be conflated.
      case 'mark_sent': {
        const { error } = await a.sb.from('platform_invoices')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', String(body.invoice_id || '')).eq('status', 'not_sent');
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // The only action that restores access. Money confirmed by a human.
      case 'verify': {
        const method = String(body.method || 'bkash').toLowerCase();
        if (!METHODS.has(method)) return NextResponse.json({ error: 'Unknown payment method.' }, { status: 400 });
        const { data, error } = await a.sb.rpc('platform_verify_payment', {
          p_invoice_id: String(body.invoice_id || ''),
          p_method: method,
          p_reference: s(body.reference),
          p_by: String(a.sess.id),
        });
        if (error) throw error;
        return NextResponse.json({ ok: true, result: data });
      }

      case 'void_invoice': {
        const { error } = await a.sb.from('platform_invoices')
          .update({ status: 'void', notes: s(body.notes) }).eq('id', String(body.invoice_id || ''));
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // Cancel, not delete. Their data stays: a cancelled hotel that comes back should
      // resume, and deleting a tenant cascades through 78 tables of their real bookings.
      // Hard deletion is deliberately not exposed here — use demo_purge() for dead demos.
      case 'cancel': {
        const { error } = await a.sb.from('tenants')
          .update({ sub_status: 'cancelled', sub_notes: s(body.notes) }).eq('id', tenantId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[crm/subscribers POST]', action, msg);
    return NextResponse.json({ error: msg || 'Action failed.' }, { status: 500 });
  }
}
