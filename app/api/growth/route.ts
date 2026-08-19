// GET/POST /api/growth — server API for the Hotel Growth OS sales pipeline.
//
// Reads/writes the SEPARATE sales Supabase project (see src/lib/growthDb.ts), never the
// hotel database. Owner/admin only: this is our own commercial pipeline, not hotel
// operations data, so no operational role has any business here.
//
// Deliberately has NO polling endpoint and no COUNT-heavy default query. The CRM's Fluid
// Active CPU headroom is the binding constraint on this project (Hobby plan); every call
// here is a staff action or an explicit refresh, never a background timer.
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';
import {
  growthDb, growthConfigured,
  PROSPECT_STATUSES, ACTIVITY_TYPES, ACTIVITY_OUTCOMES, DEAL_PLANS, DEAL_STAGES,
} from '@/lib/growthDb';

export const runtime = 'nodejs';
export const maxDuration = 15;

const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const MAX_ROWS = 500;

const STATUS_SET = new Set<string>(PROSPECT_STATUSES);
const TYPE_SET = new Set<string>(ACTIVITY_TYPES);
const OUTCOME_SET = new Set<string>(ACTIVITY_OUTCOMES);
const PLAN_SET = new Set<string>(DEAL_PLANS);
const STAGE_SET = new Set<string>(DEAL_STAGES);

const PROSPECT_COLS =
  'id,hotel_name,city,area,rooms,category,phone,whatsapp,email,website,facebook_url,' +
  'owner_name,manager_name,status,score,notes,do_not_contact,last_contact_at,next_follow_up_at,source';

// Owner/admin only. isOwnerAdmin is duplicated here as a literal set rather than imported
// from permissions.js so this route cannot be widened by an unrelated RBAC change.
const ALLOWED_ROLES = new Set(['owner', 'admin']);
const PLATFORM_OWNER_EMAIL = 'ahmedshanwaz5@gmail.com';

// PLATFORM GATE — role is not enough, and this is not theoretical.
//
// Every tenant provisioned by demo_provision() gets an owner-role staff account. Role
// alone therefore cleared this route for EVERY demo and every future customer: a prospect
// could open /crm/growth and read — and write, and delete — the entire Hotel Growth OS
// pipeline, including their own record, their score, our notes on them, and every
// competitor hotel we are chasing. Found 2026-08-19, before the first demo went out.
//
// This pipeline belongs to ONE tenant: ours. Not "owners", not "paying customers" — ours.
const HOME_TENANT = ENV_TENANT;

async function auth(req: NextRequest) {
  const sess = requireSession(req);
  if (!sess) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const role = String(sess.role || '').trim().toLowerCase();
  if (!ALLOWED_ROLES.has(role)) return { error: NextResponse.json({ error: 'Not permitted.' }, { status: 403 }) };

  // Missing tenant_id means a legacy cookie minted before tenant binding shipped, which can
  // only be ours — every demo/customer session is newer than that and always carries one.
  // Same fallback the TENANT line below already uses, so this cannot lock the owner out.
  // Answer 404, not 403: a customer should not learn the route exists.
  if ((sess.tenant_id || ENV_TENANT) !== HOME_TENANT) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  }

  if (!growthConfigured()) {
    return { error: NextResponse.json({ error: 'Growth database is not configured on this deployment.' }, { status: 503 }) };
  }

  // Honour Logout All Devices — the cookie's session_v must still match the hotel DB.
  const TENANT = sess.tenant_id || ENV_TENANT;
  const hotel = tenantScoped(tenantClient(TENANT), TENANT);
  const { data: srow } = await hotel.from('staff').select('session_v, email').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return { error: NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 }) };
  }

  // Owner rule 2026-08-19: this pipeline belongs to ONE person, not to a role and not to
  // a tenant. Hotel Fountain will hire managers and may add a second owner-role account;
  // neither should read our prospects. The address is re-read from `staff` by session id,
  // never taken from the request — the client copy is for hiding a nav pill, nothing more.
  if (String(srow[0].email || '').trim().toLowerCase() !== PLATFORM_OWNER_EMAIL) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  }

  const db = growthDb();
  if (!db) return { error: NextResponse.json({ error: 'Growth database unavailable.' }, { status: 503 }) };
  return { db, sess, actor: String(sess.id) };
}

const clampLimit = (raw: string | null, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_ROWS) : fallback;
};

// ── GET ──────────────────────────────────────────────────────────────────────
// ?view=queue     today + overdue follow-ups (the daily work list)
// ?view=board     every open prospect, for the pipeline columns
// ?view=list      filterable table  (&status= &city= &q= &limit=)
// ?view=kpis      weekly KPI row + pipeline summary
// ?view=prospect  one prospect with its activity history and deals (&id=)
export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (a.error) return a.error;
  const db = a.db;
  const sp = req.nextUrl.searchParams;
  const view = sp.get('view') || 'queue';

  try {
    if (view === 'kpis') {
      const [kpis, summary] = await Promise.all([
        db.from('vw_weekly_kpis').select('*').limit(1),
        db.from('vw_pipeline_summary').select('*'),
      ]);
      if (kpis.error) throw kpis.error;
      if (summary.error) throw summary.error;
      return NextResponse.json({ ok: true, kpis: kpis.data?.[0] || null, summary: summary.data || [] });
    }

    if (view === 'queue') {
      const { data, error } = await db
        .from('vw_follow_up_queue')
        .select('*')
        .lte('next_follow_up_at', new Date(Date.now() + 86400000).toISOString())
        .limit(clampLimit(sp.get('limit'), 60));
      if (error) throw error;
      return NextResponse.json({ ok: true, rows: data || [] });
    }

    if (view === 'board') {
      const { data, error } = await db
        .from('prospects')
        .select(PROSPECT_COLS)
        .not('status', 'in', '("won","lost","unqualified")')
        .order('score', { ascending: false })
        .limit(clampLimit(sp.get('limit'), 300));
      if (error) throw error;
      return NextResponse.json({ ok: true, rows: data || [] });
    }

    if (view === 'prospect') {
      const id = sp.get('id') || '';
      if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
      const [p, acts, deals] = await Promise.all([
        db.from('prospects').select('*').eq('id', id).limit(1),
        db.from('activities').select('*').eq('prospect_id', id).order('occurred_at', { ascending: false }).limit(50),
        db.from('deals').select('*').eq('prospect_id', id).order('created_at', { ascending: false }).limit(10),
      ]);
      if (p.error) throw p.error;
      if (!p.data?.length) return NextResponse.json({ error: 'Prospect not found.' }, { status: 404 });
      return NextResponse.json({ ok: true, prospect: p.data[0], activities: acts.data || [], deals: deals.data || [] });
    }

    // view=list
    let q = db.from('prospects').select(PROSPECT_COLS).limit(clampLimit(sp.get('limit'), 200));
    const status = sp.get('status');
    if (status && STATUS_SET.has(status)) q = q.eq('status', status);
    const city = sp.get('city');
    if (city) q = q.eq('city', city);
    const term = (sp.get('q') || '').trim();
    // ilike pattern chars are escaped so a stray % cannot turn a search into a full scan.
    if (term) q = q.ilike('hotel_name', `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`);

    const { data, error } = await q.order('score', { ascending: false }).order('hotel_name');
    if (error) throw error;
    return NextResponse.json({ ok: true, rows: data || [] });
  } catch (e) {
    console.error('[api/growth GET]', view, (e as Error)?.message);
    return NextResponse.json({ error: 'Could not load pipeline data.' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
// { action: 'log' }      log an activity — a DB trigger advances the prospect's status,
//                        stamps last_contact_at and stops any running email sequence on
//                        an inbound touch. Do NOT also patch status from here.
// { action: 'update' }   edit prospect fields (status, follow-up date, contacts, notes)
// { action: 'deal' }     create or advance a deal
export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (a.error) return a.error;
  const db = a.db;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body → 400 below */ }
  const action = String(body.action || '');
  const prospectId = typeof body.prospect_id === 'string' ? body.prospect_id.trim() : '';

  const str = (k: string, max = 4000) => {
    const v = body[k];
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  };

  try {
    if (action === 'log') {
      if (!prospectId) return NextResponse.json({ error: 'prospect_id is required.' }, { status: 400 });
      const type = String(body.type || '');
      if (!TYPE_SET.has(type)) return NextResponse.json({ error: 'Unknown activity type.' }, { status: 400 });
      const direction = body.direction === 'inbound' ? 'inbound' : 'outbound';
      const outcome = str('outcome', 40);
      if (outcome && !OUTCOME_SET.has(outcome)) return NextResponse.json({ error: 'Unknown outcome.' }, { status: 400 });

      const { data, error } = await db.from('activities').insert({
        prospect_id: prospectId,
        type,
        direction,
        outcome,
        subject: str('subject', 300),
        body: str('body'),
        next_follow_up_at: str('next_follow_up_at', 40),
        created_by: a.actor,
      }).select('id').limit(1);
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data?.[0]?.id });
    }

    if (action === 'update') {
      if (!prospectId) return NextResponse.json({ error: 'prospect_id is required.' }, { status: 400 });
      const patch: Record<string, unknown> = {};

      const status = str('status', 30);
      if (status) {
        if (!STATUS_SET.has(status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
        patch.status = status;
      }
      for (const f of ['owner_name', 'manager_name', 'phone', 'whatsapp', 'email', 'notes', 'lost_reason', 'assigned_to'] as const) {
        if (f in body) patch[f] = str(f, f === 'notes' ? 4000 : 200);
      }
      if ('next_follow_up_at' in body) patch.next_follow_up_at = str('next_follow_up_at', 40);
      if ('do_not_contact' in body) patch.do_not_contact = Boolean(body.do_not_contact);
      if ('rooms' in body) {
        const n = Number(body.rooms);
        patch.rooms = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
      }
      if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

      const { error } = await db.from('prospects').update(patch).eq('id', prospectId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'deal') {
      const dealId = typeof body.deal_id === 'string' ? body.deal_id.trim() : '';
      const stage = str('stage', 20);
      if (stage && !STAGE_SET.has(stage)) return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 });

      const money = (k: string) => {
        const n = Number(body[k]);
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
      };
      const prob = Number(body.probability);

      if (dealId) {
        const patch: Record<string, unknown> = {};
        if (stage) {
          patch.stage = stage;
          // closed_at is stamped by the server, never taken from the client — a
          // back-dated close would silently corrupt the weekly KPI window.
          if (stage === 'won' || stage === 'lost') patch.closed_at = new Date().toISOString();
        }
        if ('mrr_bdt' in body) patch.mrr_bdt = money('mrr_bdt');
        if ('setup_fee_bdt' in body) patch.setup_fee_bdt = money('setup_fee_bdt');
        if ('discount_bdt' in body) patch.discount_bdt = money('discount_bdt');
        if (Number.isFinite(prob)) patch.probability = Math.max(0, Math.min(100, Math.round(prob)));
        if ('lost_reason' in body) patch.lost_reason = str('lost_reason', 300);
        if ('notes' in body) patch.notes = str('notes');
        if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

        const { error } = await db.from('deals').update(patch).eq('id', dealId);
        if (error) throw error;
        return NextResponse.json({ ok: true, id: dealId });
      }

      if (!prospectId) return NextResponse.json({ error: 'prospect_id is required.' }, { status: 400 });
      const plan = String(body.plan || '');
      if (!PLAN_SET.has(plan)) return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });

      const { data, error } = await db.from('deals').insert({
        prospect_id: prospectId,
        plan,
        mrr_bdt: money('mrr_bdt'),
        setup_fee_bdt: money('setup_fee_bdt'),
        discount_bdt: money('discount_bdt'),
        stage: stage || 'proposal',
        probability: Number.isFinite(prob) ? Math.max(0, Math.min(100, Math.round(prob))) : 30,
        expected_close_date: str('expected_close_date', 20),
        notes: str('notes'),
      }).select('id').limit(1);
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data?.[0]?.id });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    console.error('[api/growth POST]', action, (e as Error)?.message);
    return NextResponse.json({ error: 'Could not save. Nothing was changed.' }, { status: 500 });
  }
}
