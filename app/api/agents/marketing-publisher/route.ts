// marketing-publisher — daily cron (10:00 Dhaka). The missing "last mile" of the
// content pipeline: content_calendar rows were generated and approved for months but
// never actually posted. This route publishes due HUMAN-approved Facebook posts and
// refreshes engagement numbers for recent posts (closing the measure loop).
//
// SAFETY: only rows with approved_channel='HUMAN' (set exclusively by an admin in
// /crm/marketing) are ever published. The 56 legacy rows auto-"APPROVED" by AI agents
// stay untouched until a person re-approves them in the Studio. Max 2 posts per run
// so a backlog can never flood the page.
import { NextResponse } from 'next/server';
import { assertCron } from '@/lib/workflow-trigger';
import { activeOpsTenants } from '../_tenants';
import { composeMessage, publishToFacebook, fetchEngagement } from '@/lib/fbPublish';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const MAX_POSTS_PER_RUN = 2;

function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

async function dbGet(table: string, query: string) {
  const res = await fetch(`${BASE}/${table}?${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${table}: ${await res.text()}`);
  return res.json();
}

async function dbPatch(table: string, query: string, body: object) {
  const res = await fetch(`${BASE}/${table}?${query}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${await res.text()}`);
}

async function dbPost(table: string, body: object) {
  const res = await fetch(`${BASE}/${table}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${table}: ${await res.text()}`);
}

function dhakaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;

  const today = dhakaToday();
  const startedAt = Date.now();
  const tenants = await activeOpsTenants();
  const perTenant: Array<Record<string, unknown>> = [];
  let totalPosted = 0;

  for (const t of tenants) {
    const TENANT = t.id;
    const result: Record<string, unknown> = { tenant_id: TENANT };
    const fbPageId = t.facebook_page_id || process.env.FACEBOOK_PAGE_ID;
    const fbToken = t.facebook_page_token || process.env.FACEBOOK_PAGE_TOKEN;

    // ── PUBLISH due human-approved posts ─────────────────────────────
    try {
      if (!fbPageId || !fbToken) {
        result.publish = { skipped: 'no facebook credentials' };
      } else {
        const due = await dbGet(
          'content_calendar',
          `select=*&tenant_id=eq.${TENANT}&platform=eq.FACEBOOK&status=eq.APPROVED&approved_channel=eq.HUMAN&posted_at=is.null&scheduled_for=lte.${today}&order=scheduled_for.asc&limit=${MAX_POSTS_PER_RUN}`,
        );
        const outcomes: Array<Record<string, unknown>> = [];
        for (const row of due ?? []) {
          const message = composeMessage(row);
          if (!message) {
            await dbPatch('content_calendar', `id=eq.${row.id}`, { publish_error: 'empty message after compose' });
            outcomes.push({ id: row.id, ok: false, error: 'empty message' });
            continue;
          }
          const pub = await publishToFacebook(String(fbPageId), String(fbToken), message, row.image_url);
          if (pub.ok) {
            await dbPatch('content_calendar', `id=eq.${row.id}`, {
              status: 'POSTED',
              posted_at: new Date().toISOString(),
              fb_post_id: pub.postId,
              publish_error: null,
            });
            totalPosted += 1;
          } else {
            // Row stays APPROVED so tomorrow's run retries; the error is visible in the Studio.
            await dbPatch('content_calendar', `id=eq.${row.id}`, { publish_error: pub.error });
          }
          outcomes.push({ id: row.id, title: row.title, ok: pub.ok, post_id: pub.postId, error: pub.error });
          try {
            await dbPost('notifications_log', {
              tenant_id: TENANT,
              workflow: 'marketing-publisher',
              body: pub.ok
                ? `Facebook post published: "${row.title}" (${pub.postId})`
                : `Facebook post FAILED: "${row.title}" — ${pub.error}`,
              status: pub.ok ? 'success' : 'error',
              triggered_by: 'cron:marketing-publisher',
            });
          } catch { /* non-fatal */ }
        }
        result.publish = { due: due?.length ?? 0, outcomes };
      }
    } catch (e) {
      result.publish = { error: String(e).slice(0, 300) };
    }

    // ── ENGAGEMENT refresh for posts from the last 7 days ────────────
    try {
      if (fbToken) {
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const recent = await dbGet(
          'content_calendar',
          `select=id,fb_post_id&tenant_id=eq.${TENANT}&fb_post_id=not.is.null&posted_at=gte.${since}&limit=20`,
        );
        let refreshed = 0;
        for (const row of recent ?? []) {
          const eng = await fetchEngagement(String(row.fb_post_id), String(fbToken));
          if (!eng) continue;
          const patch: Record<string, unknown> = { engagement_likes: eng.likes + eng.comments };
          if (eng.impressions != null) patch.engagement_reach = eng.impressions;
          await dbPatch('content_calendar', `id=eq.${row.id}`, patch);
          refreshed += 1;
        }
        result.engagement = { refreshed };
      }
    } catch (e) {
      result.engagement = { error: String(e).slice(0, 300) };
    }

    perTenant.push(result);
  }

  try {
    await dbPost('workflow_runs', {
      workflow_name: 'marketing-publisher',
      status: 'success',
      duration_ms: Date.now() - startedAt,
      records_processed: totalPosted,
      summary: { dhaka_date: today, tenants: perTenant },
      tenant_id: tenants[0]?.id,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, dhaka_date: today, posted: totalPosted, tenants: perTenant });
}
