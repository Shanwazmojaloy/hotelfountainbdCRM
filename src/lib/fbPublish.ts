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

export interface FbEngagement {
  likes: number;
  comments: number;
  impressions: number | null;
}

export async function fetchEngagement(postId: string, token: string): Promise<FbEngagement | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${postId}?fields=reactions.summary(true),comments.summary(true)&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const likes = Number(data?.reactions?.summary?.total_count ?? 0);
    const comments = Number(data?.comments?.summary?.total_count ?? 0);
    let impressions: number | null = null;
    try {
      // Needs read_insights on the page token; best-effort only.
      const ins = await fetch(
        `${GRAPH}/${postId}/insights/post_impressions?access_token=${encodeURIComponent(token)}`,
      );
      if (ins.ok) {
        const iData = await ins.json();
        const v = iData?.data?.[0]?.values?.[0]?.value;
        if (v != null && Number.isFinite(Number(v))) impressions = Number(v);
      }
    } catch { /* impressions unavailable — keep reactions */ }
    return { likes, comments, impressions };
  } catch {
    return null;
  }
}
