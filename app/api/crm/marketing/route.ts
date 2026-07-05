// /api/crm/marketing — Marketing Studio API (admin-only).
//
// GET  → all content_calendar rows for the tenant (client buckets by status).
// POST → { action, id?, fields? } where action ∈ create | edit | approve | reject |
//        restore | post_now.
//
// HUMAN APPROVAL GATE: the daily publisher cron only posts rows with
// approved_channel='HUMAN' — which is set EXCLUSIVELY here, from a verified staff
// session with an admin role. AI agents write DRAFT/PENDING_REVIEW rows (or even
// status='APPROVED' historically) but can never set approved_channel, so nothing
// reaches Facebook without a person tapping Approve in the CRM.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';
import { composeMessage, publishToFacebook, publishToInstagram, resolveIgUserId } from '@/lib/fbPublish';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const ADMIN_ROLES = new Set(['owner', 'manager', 'admin']);
const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const PLATFORMS = new Set(['FACEBOOK', 'WHATSAPP', 'INSTAGRAM']);

// Whitelist of columns a client may write, with per-field validation.
function sanitizeFields(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return out;
  const text = (k: string, max: number) => {
    if (typeof raw[k] === 'string') out[k] = (raw[k] as string).slice(0, max);
  };
  text('title', 120);
  text('body_en', 4000);
  text('body_bn', 4000);
  text('hashtags', 500);
  text('cta', 300);
  text('visual_brief', 1000);
  text('content_type', 40);
  if (typeof raw.scheduled_for === 'string' && DATE_RE.test(raw.scheduled_for)) out.scheduled_for = raw.scheduled_for;
  if (typeof raw.post_time === 'string' && TIME_RE.test(raw.post_time)) out.post_time = raw.post_time;
  if (typeof raw.platform === 'string' && PLATFORMS.has(raw.platform.toUpperCase())) out.platform = raw.platform.toUpperCase();
  if (typeof raw.image_url === 'string') {
    const u = raw.image_url.trim();
    if (u === '' || /^https:\/\/\S+$/i.test(u)) out.image_url = u || null;
  }
  return out;
}

type Ctx = { db: ReturnType<typeof tenantScoped>; tenant: string; staffName: string };

async function auth(req: NextRequest): Promise<{ ctx?: Ctx; fail?: NextResponse }> {
  if (!SB_SERVICE_KEY) return { fail: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) };
  const sess = requireSession(req);
  if (!sess) return { fail: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  if (!ADMIN_ROLES.has(String(sess.role || '').toLowerCase())) {
    return { fail: NextResponse.json({ error: 'Marketing is limited to admin roles.' }, { status: 403 }) };
  }
  const tenant = sess.tenant_id || ENV_TENANT;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = tenantClient(tenant);
  const db = tenantScoped(supabase, tenant);
  const { data: srow } = await db.from('staff').select('session_v, name').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return { fail: NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 }) };
  }
  return { ctx: { db, tenant, staffName: srow[0].name || `staff#${sess.id}` } };
}

// ── Impact view ──────────────────────────────────────────────────────────────
// Correlation report, deliberately NOT called "attribution": posts from the last
// 60 days with their engagement, bookings created within 48h of each post, and
// average bookings on post days vs non-post days. Reservation creation is the
// only revenue-adjacent signal we can join without click tracking.
const IMPACT_WINDOW_DAYS = 60;
const dhakaDay = (iso: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function impactView(db: any) {
  const sinceMs = Date.now() - IMPACT_WINDOW_DAYS * 86400000;
  const since = new Date(sinceMs).toISOString();
  const [postsRes, resvRes] = await Promise.all([
    db.from('content_calendar')
      .select('id, title, content_type, platform, posted_at, engagement_likes, engagement_reach, fb_post_id, permalink')
      .not('posted_at', 'is', null)
      .gte('posted_at', since)
      .order('posted_at', { ascending: false })
      .limit(100),
    db.from('reservations').select('created_at').gte('created_at', since).limit(5000),
  ]);
  if (postsRes.error || resvRes.error) {
    console.error('[crm/marketing] impact:', postsRes.error?.message, resvRes.error?.message);
    return NextResponse.json({ error: 'Could not load impact data.' }, { status: 500 });
  }
  const posts = postsRes.data ?? [];
  const resv: { created_at: string }[] = resvRes.data ?? [];

  const bookingsByDay = new Map<string, number>();
  for (const r of resv) {
    const d = dhakaDay(r.created_at);
    bookingsByDay.set(d, (bookingsByDay.get(d) || 0) + 1);
  }

  const rows = posts.map((p: { posted_at: string; engagement_likes?: number }) => {
    const t = new Date(p.posted_at).getTime();
    const bookings48h = resv.filter((r) => {
      const ct = new Date(r.created_at).getTime();
      return ct >= t && ct < t + 48 * 3600000;
    }).length;
    return { ...p, bookings_48h: bookings48h };
  });

  const postDays = new Set(posts.map((p: { posted_at: string }) => dhakaDay(p.posted_at)));
  let postDaySum = 0;
  let otherDaySum = 0;
  let otherDayCount = 0;
  for (let i = 0; i < IMPACT_WINDOW_DAYS; i++) {
    const d = dhakaDay(new Date(sinceMs + i * 86400000));
    const n = bookingsByDay.get(d) || 0;
    if (postDays.has(d)) postDaySum += n;
    else { otherDaySum += n; otherDayCount += 1; }
  }
  const summary = {
    window_days: IMPACT_WINDOW_DAYS,
    posts: posts.length,
    total_reactions: posts.reduce((s: number, p: { engagement_likes?: number }) => s + (Number(p.engagement_likes) || 0), 0),
    avg_bookings_post_days: postDays.size ? +(postDaySum / postDays.size).toFixed(2) : null,
    avg_bookings_other_days: otherDayCount ? +(otherDaySum / otherDayCount).toFixed(2) : null,
    total_bookings_window: resv.length,
  };
  return NextResponse.json({ summary, posts: rows });
}

export async function GET(req: NextRequest) {
  const { ctx, fail } = await auth(req);
  if (fail) return fail;
  const { db } = ctx!;
  if (new URL(req.url).searchParams.get('view') === 'impact') return impactView(db);
  const { data, error } = await db
    .from('content_calendar')
    .select('id, platform, content_type, title, body_bn, body_en, hashtags, visual_brief, cta, scheduled_for, post_time, status, approved_by, approved_channel, approved_at, posted_at, fb_post_id, permalink, image_url, publish_error, engagement_likes, engagement_reach, created_by_agent, created_at')
    .order('scheduled_for', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[crm/marketing] list:', error.message);
    return NextResponse.json({ error: 'Could not load content.' }, { status: 500 });
  }
  return NextResponse.json({ rows: data || [] });
}

export async function POST(req: NextRequest) {
  const { ctx, fail } = await auth(req);
  if (fail) return fail;
  const { db, tenant, staffName } = ctx!;

  let body: { action?: string; id?: string; fields?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const action = String(body.action || '');
  const fields = sanitizeFields(body.fields);
  const nowIso = new Date().toISOString();

  if (action === 'create') {
    if (!fields.body_en && !fields.body_bn) return NextResponse.json({ error: 'Post body is required.' }, { status: 400 });
    const { data, error } = await db
      .from('content_calendar')
      .insert({
        platform: fields.platform || 'FACEBOOK',
        content_type: fields.content_type || 'CUSTOM',
        title: fields.title || 'Custom Post',
        body_en: fields.body_en || null,
        body_bn: fields.body_bn || null,
        hashtags: fields.hashtags || null,
        cta: fields.cta || null,
        image_url: fields.image_url || null,
        scheduled_for: fields.scheduled_for || nowIso.slice(0, 10),
        post_time: fields.post_time || '10:00',
        status: 'PENDING_REVIEW',
        created_by_agent: `human:${staffName}`,
      })
      .select()
      .limit(1);
    if (error) {
      console.error('[crm/marketing] create:', error.message);
      return NextResponse.json({ error: 'Could not create post.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, row: data?.[0] ?? null });
  }

  // Every other action targets one row.
  const id = String(body.id || '');
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const { data: rows } = await db.from('content_calendar').select('*').eq('id', id).limit(1);
  const row = rows?.[0];
  if (!row) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
  if (row.status === 'POSTED' && action !== 'post_now') {
    return NextResponse.json({ error: 'This post is already published and can no longer change.' }, { status: 409 });
  }

  const update = async (vals: Record<string, unknown>) => {
    const { data, error } = await db.from('content_calendar').update(vals).eq('id', id).select().limit(1);
    if (error || !data?.[0]) {
      console.error('[crm/marketing] update:', error?.message);
      return null;
    }
    return data[0];
  };

  if (action === 'edit') {
    if (!Object.keys(fields).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    const updated = await update(fields);
    return updated ? NextResponse.json({ ok: true, row: updated }) : NextResponse.json({ error: 'Update failed.' }, { status: 500 });
  }

  if (action === 'approve') {
    const updated = await update({
      ...fields, // inline edits made in the review card ride along with the approval
      status: 'APPROVED',
      approved_by: staffName,
      approved_channel: 'HUMAN',
      approved_at: nowIso,
      publish_error: null,
    });
    return updated ? NextResponse.json({ ok: true, row: updated }) : NextResponse.json({ error: 'Approve failed.' }, { status: 500 });
  }

  if (action === 'reject') {
    const updated = await update({ status: 'REJECTED', approved_by: staffName, approved_channel: null, approved_at: nowIso });
    return updated ? NextResponse.json({ ok: true, row: updated }) : NextResponse.json({ error: 'Reject failed.' }, { status: 500 });
  }

  if (action === 'restore') {
    const updated = await update({ status: 'PENDING_REVIEW', approved_channel: null, publish_error: null });
    return updated ? NextResponse.json({ ok: true, row: updated }) : NextResponse.json({ error: 'Restore failed.' }, { status: 500 });
  }

  if (action === 'post_now') {
    if (row.posted_at || row.fb_post_id) return NextResponse.json({ error: 'Already published.' }, { status: 409 });
    const platform = String(row.platform).toUpperCase();
    if (platform !== 'FACEBOOK' && platform !== 'INSTAGRAM') {
      return NextResponse.json({ error: 'Only Facebook and Instagram posts can be published from here.' }, { status: 400 });
    }
    // Page credentials live on the tenants row (per-hotel). The env credentials are the
    // HOME tenant's page — never fall back to them for another tenant, or a demo-tenant
    // admin could publish onto Hotel Fountain's real page. tenants is read on the
    // service role — crm_tenant has no grant there.
    const isHome = tenant === ENV_TENANT;
    let pageId = isHome ? process.env.FACEBOOK_PAGE_ID || '' : '';
    let token = isHome ? process.env.FACEBOOK_PAGE_TOKEN || '' : '';
    try {
      const svc = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: t } = await svc.from('tenants').select('facebook_page_id, facebook_page_token').eq('id', tenant).limit(1);
      pageId = t?.[0]?.facebook_page_id || pageId;
      token = t?.[0]?.facebook_page_token || token;
    } catch { /* tenant-row creds unavailable — env fallback already applied for home */ }
    if (!pageId || !token) return NextResponse.json({ error: 'Facebook Page credentials are not configured.' }, { status: 500 });

    const message = composeMessage(row);
    if (!message) return NextResponse.json({ error: 'Post body is empty.' }, { status: 400 });

    let result: { ok: boolean; postId: string | null; error: string | null };
    let permalink: string | null = null;
    if (platform === 'INSTAGRAM') {
      if (!row.image_url) return NextResponse.json({ error: 'Instagram posts require an image.' }, { status: 400 });
      // Home tenant publishes IG with the dedicated system-user token + configured
      // IG user id (a system token has IG scopes but cannot read the page→IG edge).
      const igToken = (isHome && process.env.INSTAGRAM_ACCESS_TOKEN) || token;
      const igUserId = (isHome && process.env.INSTAGRAM_USER_ID)
        ? process.env.INSTAGRAM_USER_ID
        : await resolveIgUserId(pageId, igToken);
      if (!igUserId) {
        return NextResponse.json({
          error: 'Instagram account not reachable — link an IG business account to the page and configure INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_USER_ID (or a page token with instagram scopes).',
        }, { status: 502 });
      }
      const igResult = await publishToInstagram(igUserId, igToken, message, row.image_url);
      result = igResult;
      permalink = igResult.permalink;
    } else {
      result = await publishToFacebook(pageId, token, message, row.image_url);
      if (result.ok) permalink = `https://www.facebook.com/${result.postId}`;
    }

    if (!result.ok) {
      await update({ publish_error: result.error });
      return NextResponse.json({ error: `${platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} rejected the post: ${result.error}` }, { status: 502 });
    }
    const updated = await update({
      status: 'POSTED',
      posted_at: nowIso,
      fb_post_id: result.postId,
      permalink,
      publish_error: null,
      approved_by: row.approved_channel === 'HUMAN' ? row.approved_by : staffName,
      approved_channel: 'HUMAN',
      approved_at: row.approved_at || nowIso,
    });
    try {
      const svc = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      await svc.from('notifications_log').insert({
        tenant_id: tenant,
        workflow: 'marketing-studio',
        body: `${platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} post published by ${staffName}: ${result.postId}`,
        status: 'success',
        triggered_by: 'crm:post-now',
      });
    } catch { /* non-fatal */ }
    return NextResponse.json({ ok: true, row: updated, post_id: result.postId });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
