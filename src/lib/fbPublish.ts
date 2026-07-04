// Facebook Graph publishing helpers — shared by /api/crm/marketing (Post Now button)
// and /api/agents/marketing-publisher (daily cron). Graph v19.0, same version as
// daily-ops and scripts/facebook_post.py.
const GRAPH = 'https://graph.facebook.com/v19.0';

export interface FbPublishResult {
  ok: boolean;
  postId: string | null;
  error: string | null;
}

// One post body from a content_calendar row. CTA/hashtags are appended only when the
// body doesn't already contain them (the generators sometimes bake them in).
export function composeMessage(row: {
  body_en?: string | null;
  body_bn?: string | null;
  cta?: string | null;
  hashtags?: string | null;
}): string {
  const body = (row.body_en || row.body_bn || '').trim();
  const parts = [body];
  const cta = (row.cta || '').trim();
  if (cta && !body.includes(cta)) parts.push(cta);
  const tags = (row.hashtags || '').trim();
  if (tags && !body.includes(tags)) parts.push(tags);
  return parts.filter(Boolean).join('\n\n');
}

export async function publishToFacebook(
  pageId: string,
  token: string,
  message: string,
  imageUrl?: string | null,
): Promise<FbPublishResult> {
  const endpoint = imageUrl ? `${GRAPH}/${pageId}/photos` : `${GRAPH}/${pageId}/feed`;
  const payload: Record<string, string> = imageUrl
    ? { message, url: imageUrl, access_token: token }
    : { message, access_token: token };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    // /feed returns {id: "page_post"}; /photos returns {id: photoId, post_id: "page_post"}.
    const postId = (data.post_id as string) || (data.id as string) || null;
    if (res.ok && postId) return { ok: true, postId, error: null };
    return { ok: false, postId: null, error: JSON.stringify(data.error ?? data).slice(0, 500) };
  } catch (e) {
    return { ok: false, postId: null, error: String(e).slice(0, 500) };
  }
}

// ── Instagram (Business account linked to the page) ─────────────────────────
// Requires the page token to carry instagram_basic + instagram_content_publish.
// Publishing is two-step: create a media container, then publish it.

export async function resolveIgUserId(pageId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.instagram_business_account?.id ?? null;
  } catch {
    return null;
  }
}

export async function publishToInstagram(
  igUserId: string,
  token: string,
  caption: string,
  imageUrl: string,
): Promise<FbPublishResult & { permalink: string | null }> {
  try {
    const cRes = await fetch(`${GRAPH}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
    });
    const cData = await cRes.json().catch(() => ({} as Record<string, unknown>));
    if (!cRes.ok || !cData.id) {
      return { ok: false, postId: null, permalink: null, error: JSON.stringify(cData.error ?? cData).slice(0, 500) };
    }
    const pRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: cData.id, access_token: token }),
    });
    const pData = await pRes.json().catch(() => ({} as Record<string, unknown>));
    if (!pRes.ok || !pData.id) {
      return { ok: false, postId: null, permalink: null, error: JSON.stringify(pData.error ?? pData).slice(0, 500) };
    }
    let permalink: string | null = null;
    try {
      const mRes = await fetch(`${GRAPH}/${pData.id}?fields=permalink&access_token=${encodeURIComponent(token)}`);
      if (mRes.ok) permalink = (await mRes.json())?.permalink ?? null;
    } catch { /* permalink best-effort */ }
    return { ok: true, postId: String(pData.id), permalink, error: null };
  } catch (e) {
    return { ok: false, postId: null, permalink: null, error: String(e).slice(0, 500) };
  }
}

// IG interactions mapped onto FbEngagement: reactions=like_count, shares slot carries
// comments_count so engagement_likes (reactions+shares) = total interactions.
export async function fetchIgEngagement(mediaId: string, token: string): Promise<FbEngagement | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${mediaId}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      reactions: Number(data?.like_count ?? 0),
      shares: Number(data?.comments_count ?? 0),
      impressions: null,
    };
  } catch {
    return null;
  }
}

export interface FbEngagement {
  reactions: number;
  shares: number;
  impressions: number | null;
}

// Verified against the live page token 2026-07-04 (dev-mode app):
// - `reactions.summary(true)` / `comments.summary(true)` post fields 403 with (#10)
//   (need pages_read_user_content / Page Public Content Access) — do NOT use them.
// - `{post}/insights?metric=post_reactions_by_type_total` works (data may lag ~hours).
// - `{post}?fields=shares` works.
// - `post_impressions` metrics are gone from current Graph versions → impressions stays
//   null until the token gains read_insights AND a valid current metric exists.
export async function fetchEngagement(postId: string, token: string): Promise<FbEngagement | null> {
  try {
    const ins = await fetch(
      `${GRAPH}/${postId}/insights?metric=post_reactions_by_type_total&access_token=${encodeURIComponent(token)}`,
    );
    if (!ins.ok) return null;
    const iData = await ins.json();
    const byType = iData?.data?.[0]?.values?.[0]?.value;
    let reactions = 0;
    if (byType && typeof byType === 'object') {
      reactions = Object.values(byType as Record<string, unknown>).reduce(
        (s: number, v) => s + (Number(v) || 0),
        0,
      );
    }
    let shares = 0;
    try {
      const sh = await fetch(`${GRAPH}/${postId}?fields=shares&access_token=${encodeURIComponent(token)}`);
      if (sh.ok) {
        const sData = await sh.json();
        shares = Number(sData?.shares?.count ?? 0);
      }
    } catch { /* shares best-effort */ }
    return { reactions, shares, impressions: null };
  } catch {
    return null;
  }
}
