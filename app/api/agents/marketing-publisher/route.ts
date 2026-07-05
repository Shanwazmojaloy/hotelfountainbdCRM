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
import {
  composeMessage,
  publishToFacebook,
  fetchEngagement,
  resolveIgUserId,
  publishToInstagram,
  fetchIgEngagement,
} from '@/lib/fbPublish';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const MAX_POSTS_PER_RUN = 2;
// Env Facebook credentials belong to the HOME tenant's page. Falling back to them
// for other tenants would publish their content onto Hotel Fountain's page.
const HOME_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

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
    const isHome = TENANT === HOME_TENANT;
    const fbPageId = t.facebook_page_id || (isHome ? process.env.FACEBOOK_PAGE_ID : undefined);
    const fbToken = t.facebook_page_token || (isHome ? process.env.FACEBOOK_PAGE_TOKEN : undefined);

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
              permalink: `https://www.facebook.com/${pub.postId}`,
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

    // ── INSTAGRAM: due human-approved posts (requires an image) ──────
    // IG uses its own credential when configured: a Business system-user token
    // carrying instagram_basic + instagram_content_publish (the page token often
    // lacks IG scopes, and a system token lacks page scopes — they are NOT
    // interchangeable). Env credentials remain HOME-tenant-only, as with FB.
    const igToken = t.facebook_page_token
      || (isHome ? (process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_TOKEN) : undefined);
    try {
      if (igToken) {
        const igDue = await dbGet(
          'content_calendar',
          `select=*&tenant_id=eq.${TENANT}&platform=eq.INSTAGRAM&status=eq.APPROVED&approved_channel=eq.HUMAN&posted_at=is.null&scheduled_for=lte.${today}&order=scheduled_for.asc&limit=${MAX_POSTS_PER_RUN}`,
        );
        if ((igDue?.length ?? 0) > 0) {
          // System-user tokens can't read the page→IG edge, so the home tenant's
          // IG user id is configured directly (INSTAGRAM_USER_ID) with the edge
          // lookup as fallback for tenants using a full page token.
          const igUserId = (isHome && process.env.INSTAGRAM_USER_ID)
            ? process.env.INSTAGRAM_USER_ID
            : (fbPageId ? await resolveIgUserId(String(fbPageId), String(igToken)) : null);
          if (!igUserId) {
            // Either no linked IG business account, or the token lacks
            // instagram_basic/instagram_content_publish — surface on each due row.
            for (const row of igDue) {
              await dbPatch('content_calendar', `id=eq.${row.id}`, {
                publish_error: 'Instagram account not reachable — link an IG business account and re-issue the page token with instagram_basic + instagram_content_publish',
              });
            }
            result.instagram = { due: igDue.length, skipped: 'no reachable instagram account' };
          } else {
            const igOutcomes: Array<Record<string, unknown>> = [];
            for (const row of igDue) {
              if (!row.image_url) {
                await dbPatch('content_calendar', `id=eq.${row.id}`, { publish_error: 'Instagram posts require an image_url' });
                igOutcomes.push({ id: row.id, ok: false, error: 'no image_url' });
                continue;
              }
              const caption = composeMessage(row);
              const pub = await publishToInstagram(igUserId, String(igToken), caption, String(row.image_url));
              if (pub.ok) {
                await dbPatch('content_calendar', `id=eq.${row.id}`, {
                  status: 'POSTED',
                  posted_at: new Date().toISOString(),
                  fb_post_id: pub.postId,
                  permalink: pub.permalink,
                  publish_error: null,
                });
                totalPosted += 1;
              } else {
                await dbPatch('content_calendar', `id=eq.${row.id}`, { publish_error: pub.error });
              }
              igOutcomes.push({ id: row.id, title: row.title, ok: pub.ok, post_id: pub.postId, error: pub.error });
              try {
                await dbPost('notifications_log', {
                  tenant_id: TENANT,
                  workflow: 'marketing-publisher',
                  body: pub.ok
                    ? `Instagram post published: "${row.title}" (${pub.postId})`
                    : `Instagram post FAILED: "${row.title}" — ${pub.error}`,
                  status: pub.ok ? 'success' : 'error',
                  triggered_by: 'cron:marketing-publisher',
                });
              } catch { /* non-fatal */ }
            }
            result.instagram = { due: igDue.length, outcomes: igOutcomes };
          }
        }
      }
    } catch (e) {
      result.instagram = { error: String(e).slice(0, 300) };
    }

    // ── ENGAGEMENT refresh for posts from the last 7 days ────────────
    try {
      if (fbToken || igToken) {
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const recent = await dbGet(
          'content_calendar',
          `select=id,fb_post_id,platform&tenant_id=eq.${TENANT}&fb_post_id=not.is.null&posted_at=gte.${since}&limit=20`,
        );
        let refreshed = 0;
        for (const row of recent ?? []) {
          const isIg = String(row.platform).toUpperCase() === 'INSTAGRAM';
          const tokenFor = isIg ? igToken : fbToken;
          if (!tokenFor) continue;
          const eng = isIg
            ? await fetchIgEngagement(String(row.fb_post_id), String(tokenFor))
            : await fetchEngagement(String(row.fb_post_id), String(tokenFor));
          if (!eng) continue;
          const patch: Record<string, unknown> = { engagement_likes: eng.reactions + eng.shares };
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
