import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// gemini-2.5-flash is a THINKING model: reasoning tokens bill against
// maxOutputTokens. With no thinkingConfig the budget is dynamic and effectively
// unbounded, so a caller asking for N tokens can get a fragment - or nothing -
// with finishReason MAX_TOKENS. Measured live 2026-08-17: seo-geo-agent's
// 512-token GBP post came back as 113 characters, cut mid-sentence, and was
// saved as a draft. thinkingBudget 0 makes every caller's cap mean what it says.
// Full write-up in supabase/functions/wf-competitor-monitor/index.ts.
function geminiText(d: any): string {
  const parts: Array<{ text?: string; thought?: boolean }> = d?.candidates?.[0]?.content?.parts ?? [];
  // Concatenate EVERY non-thought part - parts[0] alone drops continuations.
  return parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
}

async function callGemini(prompt: string, apiKey: string, maxTokens = 2048): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini error');
  return geminiText(data);
}

async function saveToSupabase(sbUrl: string, sbKey: string, record: Record<string, unknown>) {
  const res = await fetch(`${sbUrl}/rest/v1/marketing_content`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ ...record, tenant_id: TENANT }),
  });
  const saved = await res.json();
  return Array.isArray(saved) ? saved[0] : saved;
}

async function updateSupabase(sbUrl: string, sbKey: string, id: string, patch: Record<string, unknown>) {
  await fetch(`${sbUrl}/rest/v1/marketing_content?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

function extractJSON(raw: string): unknown[] {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return [];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
  const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: 'Invalid JSON body' }, 400);
  }

  const action = body.action as string;

  try {
    // ── POST_GBP ──────────────────────────────────────────────
    if (action === 'post_gbp') {
      const topic = (body.topic as string) || 'Hotel Fountain latest offers';
      if (!GEMINI_KEY) return jsonRes({ error: 'GEMINI_API_KEY not configured — add it in Supabase Edge Function Secrets' });

      const prompt = `You are a luxury hotel social media manager for Hotel Fountain, a premium hotel in Nikunja 2, Dhaka — 5 minutes from Hazrat Shahjalal International Airport.

Write a Google Business Profile post about: "${topic}"

Requirements:
- 150-200 words, warm and professional tone
- Include the hotel name and location (Nikunja 2, Dhaka)
- Mention proximity to HSIA airport
- Include a call-to-action (book direct / call us)
- Use relevant emojis sparingly
- End with contact: +880-1319407384

Return ONLY the post text, no extra commentary.`;

      const postContent = await callGemini(prompt, GEMINI_KEY, 512);
      const saved = await saveToSupabase(SB_URL, SB_KEY, {
        content_type: 'gbp_post',
        title: `GBP Post: ${topic.slice(0, 60)}`,
        content: postContent,
        status: 'draft',
        meta_description: topic,
        keywords: ['Hotel Fountain', 'Nikunja 2', 'Dhaka hotel', 'airport hotel'],
      });

      return jsonRes({ post_content: postContent, saved_id: saved?.id, post_url: `https://business.google.com/n/dashboard/6462181989202463603`, status: 'draft' });
    }

    // ── GENERATE_CONTENT ──────────────────────────────────────
    if (action === 'generate_content') {
      const topic = (body.topic as string) || 'Hotel Fountain Nikunja 2';
      const type = (body.type as string) || 'blog_post';
      if (!GEMINI_KEY) return jsonRes({ error: 'GEMINI_API_KEY not configured — add it in Supabase Edge Function Secrets' });

      const typeDesc: Record<string, string> = {
        blog_post: 'an SEO-optimised blog post (800-1000 words)',
        landing_page: 'a local landing page (500-700 words with clear sections)',
        gbp_post: 'a Google Business Profile post (150-200 words)',
      };

      const prompt = `You are an expert hotel SEO copywriter specialising in Generative Engine Optimisation (GEO) for Hotel Fountain — a premium 4-star hotel in Nikunja 2, Dhaka, Bangladesh, 5 minutes from Hazrat Shahjalal International Airport.

Write ${typeDesc[type] || 'content'} about: "${topic}"

GEO requirements:
- Include local landmarks: Cityscape Tower, HSIA airport, Nikunja 2 residential area
- Include statistics: 28 rooms, ৳3,500–৳9,000/night, 4.8 star rating
- Use Schema.org compatible language
- Include FAQ section
- Natural keyword density for: best hotel Nikunja 2, hotel near Dhaka airport, corporate accommodation Dhaka
- End with contact: +880-1319407384

Return a JSON object with ONLY these keys:
{"title":"SEO title (60 chars max)","meta_description":"Meta description (155 chars max)","content":"Full content","keywords":["array","of","5-8","keywords"]}

Return ONLY valid JSON, no markdown fences.`;

      const raw = await callGemini(prompt, GEMINI_KEY, 2048);
      let parsed: Record<string, unknown> = { title: topic, content: raw, keywords: [] };
      try {
        const cleaned = raw.replace(/^```json\n?|^```\n?|```$/gm, '').trim();
        parsed = JSON.parse(cleaned);
      } catch { /* use raw as content */ }

      const saved = await saveToSupabase(SB_URL, SB_KEY, {
        content_type: type,
        title: parsed.title,
        content: parsed.content,
        meta_description: parsed.meta_description,
        keywords: parsed.keywords,
        status: 'draft',
      });

      return jsonRes({ ...parsed, saved_id: saved?.id });
    }

    // ── GENERATE_SCHEMA ───────────────────────────────────────
    if (action === 'generate_schema') {
      const rooms = (body.rooms as unknown[]) || [];
      const amenities = ['Free WiFi', 'Air Conditioning', '24-Hour Front Desk', 'Airport Shuttle', 'Room Service', 'Restaurant', 'Business Center', 'CCTV Security'];
      const schema = {
        '@context': 'https://schema.org',
        '@type': ['Hotel', 'LocalBusiness'],
        name: 'Hotel Fountain',
        description: 'Premium 4-star hotel in Nikunja 2, Dhaka — 5 minutes from Hazrat Shahjalal International Airport.',
        url: 'https://hotelfountainbd-crm.vercel.app',
        telephone: '+880-1319407384',
        address: { '@type': 'PostalAddress', streetAddress: 'Nikunja 2', addressLocality: 'Dhaka', addressRegion: 'Dhaka Division', addressCountry: 'BD' },
        geo: { '@type': 'GeoCoordinates', latitude: 23.8491, longitude: 90.4053 },
        priceRange: '৳3,500 – ৳9,000',
        starRating: { '@type': 'Rating', ratingValue: '4.8', bestRating: '5' },
        numberOfRooms: rooms.length || 28,
        amenityFeature: amenities.map(a => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
        checkinTime: '14:00',
        checkoutTime: '12:00',
      };
      return jsonRes({ schema: JSON.stringify(schema, null, 2) });
    }

    // ── CHECK_RANKINGS ────────────────────────────────────────
    if (action === 'check_rankings') {
      const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY') ?? '';
      const keywords = ['Best hotel in Nikunja 2', 'Hotel near Dhaka Airport', 'Corporate accommodation Dhaka', 'Nikunja 2 hotel booking', 'Transit hotel Dhaka', 'Hotel near HSIA airport'];
      if (!SERPAPI_KEY) {
        return jsonRes({ rankings: keywords.map(k => ({ keyword: k, position: null, url: null, change: 0, note: 'Add SERPAPI_KEY secret to enable live tracking' })), message: 'SERPAPI_KEY not configured' });
      }
      const rankings = await Promise.all(keywords.map(async (kw) => {
        try {
          const url = `https://serpapi.com/search.json?q=${encodeURIComponent(kw)}&location=Dhaka,Bangladesh&hl=en&gl=bd&api_key=${SERPAPI_KEY}`;
          const res = await fetch(url);
          const data = await res.json();
          const results = (data.organic_results || []) as Array<{link?: string}>;
          const pos = results.findIndex(r => r.link?.includes('hotelfountain') || r.link?.includes('fountain'));
          return { keyword: kw, position: pos >= 0 ? pos + 1 : null, url: pos >= 0 ? results[pos].link : null, change: 0 };
        } catch { return { keyword: kw, position: null, url: null, change: 0 }; }
      }));
      return jsonRes({ rankings });
    }

    // ── PUBLISH_CONTENT ───────────────────────────────────────
    if (action === 'publish_content') {
      const contentId = body.content_id as string;
      if (!contentId) return jsonRes({ error: 'content_id required' });
      await updateSupabase(SB_URL, SB_KEY, contentId, { status: 'published' });
      return jsonRes({ success: true, content_id: contentId, status: 'published' });
    }

    return jsonRes({ error: `Unknown action: ${action}. Valid: post_gbp, generate_content, generate_schema, check_rankings, publish_content` });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message });
  }
});
