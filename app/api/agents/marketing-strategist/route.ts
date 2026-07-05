// marketing-strategist — weekly cron (Mon 09:00 Dhaka). Drafts the coming week's
// Facebook content into content_calendar as PENDING_REVIEW using live hotel data
// (available rooms, rates, occupancy, past post performance). Nothing it writes can
// be published until a human approves it in /crm/marketing (approved_channel gate).
//
// Uses Claude Haiku behind the per-tenant AI budget guard (same pattern as
// ceo-auditor); degrades to data-driven template posts when the key/budget is out.
import { NextResponse } from 'next/server';
import { assertCron } from '@/lib/workflow-trigger';
import { activeOpsTenants } from '../_tenants';
import { checkAiBudget, recordAiUsage } from '@/lib/aiBudget';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const TARGET_BACKLOG = 5; // skip generation while this many unposted future items exist

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

async function dbPost(table: string, body: object) {
  const res = await fetch(`${BASE}/${table}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${table}: ${await res.text()}`);
}

function dhakaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function plusDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface DraftPost {
  content_type: string;
  title: string;
  body_en: string;
  body_bn?: string;
  hashtags?: string;
  cta?: string;
  visual_brief?: string;
  scheduled_for: string;
  post_time?: string;
  design_html?: string;
}

// Extract a JSON array from a model reply that may carry prose or code fences.
function parseDrafts(text: string, today: string): DraftPost[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: DraftPost[] = [];
  for (const [i, item] of arr.entries()) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    const body = typeof p.body_en === 'string' ? p.body_en.trim() : '';
    if (!body) continue;
    const rawDate = typeof p.scheduled_for === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.scheduled_for) ? p.scheduled_for : '';
    const scheduled = rawDate >= today && rawDate <= plusDays(today, 14) ? rawDate : plusDays(today, i + 1);
    out.push({
      content_type: (typeof p.content_type === 'string' ? p.content_type : 'GENERAL').toUpperCase().slice(0, 40),
      title: (typeof p.title === 'string' && p.title ? p.title : 'Weekly Post').slice(0, 120),
      body_en: body.slice(0, 4000),
      body_bn: typeof p.body_bn === 'string' ? p.body_bn.slice(0, 4000) : undefined,
      hashtags: typeof p.hashtags === 'string' ? p.hashtags.slice(0, 500) : undefined,
      cta: typeof p.cta === 'string' ? p.cta.slice(0, 300) : undefined,
      visual_brief: typeof p.visual_brief === 'string' ? p.visual_brief.slice(0, 1000) : undefined,
      scheduled_for: scheduled,
      post_time: typeof p.post_time === 'string' && /^\d{2}:\d{2}$/.test(p.post_time) ? p.post_time : '10:00',
      design_html: typeof p.design_html === 'string' && p.design_html.trim().startsWith('<') ? p.design_html.slice(0, 10000) : undefined,
    });
    if (out.length >= 5) break;
  }
  return out;
}

export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;

  const today = dhakaToday();
  const startedAt = Date.now();
  const tenants = await activeOpsTenants();
  const perTenant: Array<Record<string, unknown>> = [];
  let totalDrafted = 0;

  for (const t of tenants) {
    const TENANT = t.id;
    const result: Record<string, unknown> = { tenant_id: TENANT };
    try {
      // Don't pile on: skip while a healthy unposted backlog exists.
      const backlog = await dbGet(
        'content_calendar',
        `select=id&tenant_id=eq.${TENANT}&posted_at=is.null&status=in.(DRAFT,PENDING_REVIEW,VARIATIONS_READY,APPROVED)&scheduled_for=gte.${today}&limit=${TARGET_BACKLOG}`,
      );
      if ((backlog?.length ?? 0) >= TARGET_BACKLOG) {
        result.skipped = `backlog full (${backlog.length} unposted items)`;
        perTenant.push(result);
        continue;
      }
      const wanted = TARGET_BACKLOG - (backlog?.length ?? 0);

      // Live context for the drafts.
      const hotelName = t.hotel_name || process.env.HOTEL_NAME || 'Hotel Fountain BD';
      const hotelCity = t.hotel_city || process.env.HOTEL_CITY || 'Dhaka';
      const waNumber = (t.hotel_whatsapp || process.env.HOTEL_WHATSAPP || '8801322840799').replace(/[^0-9]/g, '');
      const waLink = `https://wa.me/${waNumber}`;

      let rooms: Array<{ name?: string; room_type?: string; rate?: number }> = [];
      try {
        rooms = await dbGet('rooms', `select=name,room_type,rate&tenant_id=eq.${TENANT}&status=eq.AVAILABLE&limit=10`);
      } catch { /* optional context */ }
      let occupancy = '';
      try {
        const checkedIn = await dbGet('reservations', `select=id&tenant_id=eq.${TENANT}&status=eq.CHECKED_IN`);
        const roomCount = Number(t.hotel_room_count ?? process.env.HOTEL_ROOM_COUNT ?? 24);
        occupancy = `${Math.round(((checkedIn?.length ?? 0) / roomCount) * 100)}%`;
      } catch { /* optional context */ }
      let topPosts: Array<{ title?: string; content_type?: string; engagement_likes?: number }> = [];
      try {
        topPosts = await dbGet(
          'content_calendar',
          `select=title,content_type,engagement_likes&tenant_id=eq.${TENANT}&engagement_likes=gt.0&order=engagement_likes.desc&limit=3`,
        );
      } catch { /* none posted yet */ }
      // Owner-curated REAL guest reviews (hotel_settings key 'marketing_reviews', one per
      // line, e.g. `Wonderful stay, very clean — Karim R.`). Testimonial posts may quote
      // ONLY these; with none present the model is forbidden from testimonial content —
      // an early draft invented a named 5-star review, which is the failure mode here.
      let realReviews: string[] = [];
      try {
        const rr = await dbGet(
          'hotel_settings',
          `select=value&tenant_id=eq.${TENANT}&key=eq.marketing_reviews&limit=1`,
        );
        realReviews = String(rr?.[0]?.value ?? '')
          .split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0, 10);
      } catch { /* none configured */ }
      // Viral-content intel for the niche (hotel_settings key 'marketing_trends').
      // Populated by Claude sessions from Virlo keyword research — this cron cannot
      // call the Virlo MCP connector itself, so the intel flows through the DB.
      let trendNotes = '';
      try {
        const tn = await dbGet(
          'hotel_settings',
          `select=value&tenant_id=eq.${TENANT}&key=eq.marketing_trends&limit=1`,
        );
        trendNotes = String(tn?.[0]?.value ?? '').trim().slice(0, 2500);
      } catch { /* none configured */ }

      const minRate = rooms.length ? Math.min(...rooms.map((r) => Number(r.rate) || Infinity)) : null;
      let drafts: DraftPost[] = [];
      let source = 'template';

      const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
      const budget = await checkAiBudget(TENANT);
      if (anthropicKey && budget.allowed) {
        const angles = realReviews.length
          ? 'ROOM_SPOTLIGHT, OFFER, TESTIMONIAL, LOCAL_EVENT, CORPORATE_PITCH, BEHIND_SCENES, SEASONAL'
          : 'ROOM_SPOTLIGHT, OFFER, LOCAL_EVENT, CORPORATE_PITCH, BEHIND_SCENES, SEASONAL';
        const prompt = `You are the marketing strategist for ${hotelName}, a hotel in ${hotelCity}, Bangladesh (near Dhaka airport, Nikunja-02). Today is ${today}. Current occupancy: ${occupancy || 'unknown'}. Available rooms: ${rooms.map((r) => `${r.name || r.room_type} ৳${r.rate}/night`).join(', ') || 'unknown'}. Booking WhatsApp: ${waLink}.
${topPosts.length ? `Best-performing past posts: ${topPosts.map((p) => `"${p.title}" (${p.content_type}, ${p.engagement_likes} reactions)`).join(', ')}.` : ''}
${realReviews.length
  ? `REAL guest reviews — TESTIMONIAL posts must quote one of these VERBATIM with its exact attribution and nothing else: ${realReviews.map((r) => `"${r}"`).join(' | ')}.`
  : 'IMPORTANT: never invent guest reviews, quotes, testimonials, or named guests. No TESTIMONIAL posts.'}
${trendNotes ? `VIRAL-CONTENT INTEL for this niche (from real trend research — model the FORMATS, hooks and angles; adapt to this hotel; never copy captions verbatim or claim things untrue of this hotel):\n${trendNotes}` : ''}
Use ONLY the room rates listed above — never invent prices or packages with made-up figures.
Draft ${wanted} Facebook posts for the coming week. Vary the angle: ${angles}. Keep each under 100 words, warm and concrete, with emoji, real rates in ৳, and the WhatsApp link as the call to action. Audience: Bangladeshi families, business travellers, airport transit guests.
ALSO design each post's 1080x1080 social graphic as "design_html" — one self-contained HTML snippet for the Satori renderer, under 3500 characters. STRICT RENDERER RULES: only <div>, <span>, <img>; ALL styling inline; EVERY div must include display:flex plus a flex-direction; position:absolute is allowed for overlays/glow shapes; no grid, no scripts, no external CSS; do not set font-family (Inter is default; use font-family:Bengali only for Bangla text and the ৳ sign). Images may ONLY be these exact URLs: https://fountainbd.com/logo-crest.png (logo), https://fountainbd.com/fountain-deluxe.jpeg, https://fountainbd.com/premium-deluxe.jpg, https://fountainbd.com/royal-suite.jpeg, https://fountainbd.com/superior-deluxe.jpeg, https://fountainbd.com/twin-deluxe.jpg (room photos). Root element: <div style="display:flex;flex-direction:column;width:1080px;height:1080px;...">.
ROTATE the visual style across the ${wanted} posts — assign each post ONE of these three house styles, never the same style twice in a row (owner-approved 2026-07-05):
STYLE A "Teal Glass": background linear-gradient(135deg,#03242B,#0A3F47,#052A31) with position:absolute radial-gradient glow circles; frosted cards (background rgba(255,255,255,0.06), 1px border rgba(94,234,212,0.4), border-radius 28); accent #5EEAD4 with text-shadow 0 0 28px rgba(45,212,191,0.75) on the hero number; pill-shaped CTA bar.
STYLE B "Ivory Editorial": background #FBF9F5, generous whitespace, deep slate #0F3B3E headline type, muted #8A8375 secondary, hairline 1px #E5E0D6 dividers, gold #C8A96E accents (thin bar, small ◆ separators), giant price or headline as the centerpiece, small logo bottom-right; photo optional.
STYLE C "Bento Grid": background #0B0A0F, asymmetric tile mosaic built from nested flex columns/rows with gap 20 (large photo tile + accent price tile with border rgba(94,234,212,0.45) and teal gradient + list tile with numbered/dotted rows + CTA tile background #DFFF45 with #171A05 bold text), tiles border-radius 20-24 with 1px borders rgba(255,255,255,0.16), gold #C8A96E for headers.
Always include the hotel name, the location line (Nikunja-02 · Dhaka), the WhatsApp number, and the rate when the post has one.
Reply with ONLY a JSON array; each element: {"content_type","title","body_en","body_bn","hashtags","cta","visual_brief","scheduled_for","post_time","design_html"}. scheduled_for = dates spread across the next 7 days (YYYY-MM-DD). post_time between 09:00 and 20:00.`;

        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
          });
          if (response.ok) {
            const data = await response.json();
            recordAiUsage(TENANT, data.usage);
            const text = Array.isArray(data.content) ? data.content.map((c: { text?: string }) => c.text || '').join('') : '';
            drafts = parseDrafts(text, today).slice(0, wanted);
            if (drafts.length) source = 'claude';
          } else {
            console.error('[marketing-strategist] Claude non-ok', response.status, (await response.text()).slice(0, 200));
          }
        } catch (e) {
          console.error('[marketing-strategist] Claude fetch error', e);
        }
      }

      // Template fallback — data-driven, never blocks the pipeline on AI availability.
      if (!drafts.length) {
        const room = rooms[0];
        if (room) {
          drafts.push({
            content_type: 'ROOM_SPOTLIGHT',
            title: `Room of the Week — ${room.name || room.room_type}`,
            body_en: `🏨 Room of the Week — ${room.name || room.room_type}\n\n✨ ${room.room_type || 'Comfort room'} | ৳${room.rate}/night\n✈️ 10 minutes from Dhaka Airport (Nikunja-02)\n\n📞 Book now on WhatsApp: ${waLink}`,
            hashtags: `#${String(hotelName).replace(/\s+/g, '')} #${hotelCity} #HotelBD`,
            scheduled_for: plusDays(today, 1),
            post_time: '10:00',
          });
        }
        if (minRate && Number.isFinite(minRate)) {
          drafts.push({
            content_type: 'OFFER',
            title: 'Weekend Getaway Offer',
            body_en: `🎉 Weekend at ${hotelName}!\n\n🛏️ ${rooms.length} rooms available this week\n💰 Starting ৳${minRate}/night\n✈️ Right next to Dhaka Airport — Nikunja-02\n\n📞 Reserve on WhatsApp: ${waLink}`,
            hashtags: `#${String(hotelName).replace(/\s+/g, '')} #DhakaHotel #WeekendOffer`,
            scheduled_for: plusDays(today, 3),
            post_time: '17:00',
          });
        }
        drafts = drafts.slice(0, wanted);
      }

      for (const d of drafts) {
        // Id generated here so image_url can point at the row's own Claude-designed
        // graphic (/api/marketing/design/{id} renders design_html, falling back to
        // the template poster on any validation/render failure — never a broken image).
        const rowId = crypto.randomUUID();
        await dbPost('content_calendar', {
          id: rowId,
          tenant_id: TENANT,
          platform: 'FACEBOOK',
          content_type: d.content_type,
          title: d.title,
          body_en: d.body_en,
          body_bn: d.body_bn ?? null,
          hashtags: d.hashtags ?? null,
          cta: d.cta ?? null,
          visual_brief: d.visual_brief ?? null,
          design_html: d.design_html ?? null,
          image_url: d.design_html ? `https://fountainbd.com/api/marketing/design/${rowId}` : null,
          scheduled_for: d.scheduled_for,
          post_time: d.post_time ?? '10:00',
          status: 'PENDING_REVIEW',
          created_by_agent: 'marketing-strategist',
        });
      }
      totalDrafted += drafts.length;
      result.drafted = drafts.length;
      result.source = source;
    } catch (e) {
      result.error = String(e).slice(0, 300);
    }
    perTenant.push(result);
  }

  // ── Approval nudge (home tenant, weekly with this cron) ───────────────────
  // The queue only moves when a human approves; without a nudge it silently
  // piles up. Sent via Brevo like fb-token-check's alert.
  try {
    const HOME = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
    const brevoKey = process.env.BREVO_API_KEY;
    if (brevoKey) {
      const pending = await dbGet(
        'content_calendar',
        `select=id&tenant_id=eq.${HOME}&posted_at=is.null&status=in.(DRAFT,PENDING_REVIEW,VARIATIONS_READY)&limit=50`,
      );
      const n = pending?.length ?? 0;
      if (n > 0) {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Lumea CRM', email: process.env.HOTEL_SENDER_EMAIL || 'hotellfountainbd@gmail.com' },
            to: [{ email: process.env.ALERT_EMAIL || 'ahmedshanwaz5@gmail.com', name: process.env.ALERT_NAME || 'Hotel Owner' }],
            subject: `📣 ${n} marketing draft${n === 1 ? '' : 's'} awaiting your approval`,
            textContent: `${n} Facebook draft${n === 1 ? ' is' : 's are'} waiting in the Marketing Studio.\n\nReview & approve: https://fountainbd.com/crm/marketing\n\nApproved posts go live automatically at 10:00 (max 2/day). Nothing publishes without your approval.`,
          }),
        });
      }
    }
  } catch { /* nudge is best-effort */ }

  try {
    await dbPost('workflow_runs', {
      workflow_name: 'marketing-strategist',
      status: 'success',
      duration_ms: Date.now() - startedAt,
      records_processed: totalDrafted,
      summary: { dhaka_date: today, tenants: perTenant },
      tenant_id: tenants[0]?.id,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, dhaka_date: today, drafted: totalDrafted, tenants: perTenant });
}
