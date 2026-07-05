// /api/marketing/design/[id] — renders a content_calendar row's Claude-designed
// social graphic (design_html) to a 1080×1080 PNG via Satori.
//
// This replaces the single fixed poster template as the DEFAULT creative path:
// the strategist now designs each post's graphic individually (varied layouts,
// brand palette, real hotel photos). The template poster remains the guaranteed
// fallback — ANY validation or render failure 302s to /api/marketing/poster, so
// a post's image_url can never 500 at Facebook/Instagram fetch time.
//
// Security model: design_html is written ONLY server-side (marketing-strategist).
// Satori executes nothing (no scripts, no CSS engine), so the residual risk is server-side
// image fetching — <img> sources are whitelisted to fountainbd.com png/jpeg. A
// forbidden-pattern check and a size cap guard the rest; anything odd → fallback.
import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { html as satoriHtml } from 'satori-html';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const MAX_HTML = 10_000;
// Satori tolerates unsupported markup by rendering an (almost) empty canvas
// instead of throwing — verified live with a <table> design: 8.5KB PNG, while
// every real branded card lands 90KB+ (flat bg + text ≈ 25-40KB). A 1080×1080
// output under this many bytes is a blank/degenerate render → template fallback.
const MIN_PNG_BYTES = 15_000;
const MIN_TEXT_CHARS = 12;
const FORBIDDEN = [/<script/i, /<iframe/i, /<link/i, /<object/i, /<embed/i, /<video/i, /<audio/i, /javascript:/i, /\son\w+\s*=/i, /expression\s*\(/i];
const IMG_SRC_RE = /src\s*=\s*["']([^"']+)["']/gi;
const ALLOWED_IMG = /^https:\/\/fountainbd\.com\/[\w\-./%]+\.(?:png|jpe?g)$/i;

async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)
    ).text();
    const m = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
    if (!m) return null;
    const res = await fetch(m[1]);
    return res.ok ? res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

// Satori hard-requires display:flex on any element with multiple children; models
// forget. Best-effort auto-fix: ensure every <div> declares a display.
function ensureFlex(input: string): string {
  return input
    .replace(/<div(?![^>]*style=)/gi, '<div style="display:flex;"')
    .replace(/(<div[^>]*style=["'])(?![^"']*display\s*:)/gi, '$1display:flex;');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = (title?: string | null) =>
    NextResponse.redirect(new URL(`/api/marketing/poster?title=${encodeURIComponent((title || 'Hotel Fountain BD').slice(0, 70))}`, req.url), 302);

  if (!UUID_RE.test(id) || !SB_SERVICE_KEY) return fallback();

  const svc = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await svc.from('content_calendar').select('title, design_html').eq('id', id).limit(1);
  const row = data?.[0];
  if (!row) return fallback();
  const raw = String(row.design_html || '');
  if (!raw || raw.length > MAX_HTML) return fallback(row.title);
  if (FORBIDDEN.some((re) => re.test(raw))) return fallback(row.title);
  for (const m of raw.matchAll(IMG_SRC_RE)) {
    if (!ALLOWED_IMG.test(m[1])) return fallback(row.title);
  }

  try {
    const processed = ensureFlex(raw);
    const text = processed.replace(/<[^>]+>/g, ' ');
    // A design with (almost) no visible text is not a usable marketing graphic.
    if (text.replace(/\s+/g, '').length < MIN_TEXT_CHARS) return fallback(row.title);
    const fontLoads: Promise<ArrayBuffer | null>[] = [
      loadGoogleFont('Inter:wght@400', text),
      loadGoogleFont('Inter:wght@700', text),
    ];
    const hasBengali = /[ঀ-৿]/.test(text);
    if (hasBengali) fontLoads.push(loadGoogleFont('Noto+Sans+Bengali:wght@700', text));
    const loaded = await Promise.all(fontLoads);
    const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700 }[] = [];
    if (loaded[0]) fonts.push({ name: 'Inter', data: loaded[0], weight: 400 });
    if (loaded[1]) fonts.push({ name: 'Inter', data: loaded[1], weight: 700 });
    if (hasBengali && loaded[2]) fonts.push({ name: 'Bengali', data: loaded[2], weight: 700 });
    if (!fonts.length) return fallback(row.title);

    const element = satoriHtml(processed);
    // Buffer the full render INSIDE the handler: Satori errors surface here (and
    // hit the catch → template fallback) instead of dying mid-stream as a 500.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ir = new ImageResponse(element as any, { width: 1080, height: 1080, fonts });
    const buf = await ir.arrayBuffer();
    if (buf.byteLength < MIN_PNG_BYTES) {
      console.warn(`[marketing/design] ${id}: near-blank render (${buf.byteLength}B) — template fallback`);
      return fallback(row.title);
    }
    return new Response(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e) {
    console.error('[marketing/design] render failed, falling back to template:', e instanceof Error ? e.message : String(e));
    return fallback(row.title);
  }
}
