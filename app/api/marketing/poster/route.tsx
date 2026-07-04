// /api/marketing/poster — branded 1080×1080 offer posters rendered from HTML (Satori).
//
// WHY THIS EXISTS: AI image models mangle Bengali script, so rate cards / offer
// posters with ৳ prices and Bangla lines need deterministic text rendering. This is
// the right-sized version of the blueprint's "Puppeteer poster microservice" — one
// Next.js route on the existing deployment, no headless browser, no new infra.
//
// Usage (all params optional, lengths clamped):
//   /api/marketing/poster?badge=WEEKEND%20OFFER&title=Deluxe%20Room%20Getaway
//     &bn=সপ্তাহান্তের%20বিশেষ%20অফার&rate=2900&sub=Free%20breakfast%20·%20Airport%20pickup
//
// The Studio / strategist put this URL in a post's image_url; the publisher posts it
// via the Graph /photos endpoint (Facebook fetches the URL — must stay PUBLIC, which
// is safe: it renders only the caller-supplied marketing text, no data reads).
//
// KNOWN LIMIT (verified 2026-07-04): Satori has no full complex-script shaping —
// Bengali conjuncts/pre-base matras can reorder incorrectly (বিশেষ → বশিষে). Keep
// `bn` to short simple phrases or omit it; ৳ + digits render perfectly, which is the
// main win over AI image generation.
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';

const clamp = (v: string | null, max: number, fallback = '') =>
  (v ?? fallback).slice(0, max).replace(/[<>]/g, '');

// Google Fonts css2 with `text=` returns a TTF subset containing exactly the glyphs
// we render — tiny payloads, and Satori accepts TTF (it cannot read woff2).
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const badge = clamp(searchParams.get('badge'), 40, 'HOTEL FOUNTAIN BD');
  const title = clamp(searchParams.get('title'), 70, 'Comfort Near the Airport');
  const bn = clamp(searchParams.get('bn'), 80);
  const rate = clamp(searchParams.get('rate'), 12).replace(/[^0-9,]/g, '');
  const sub = clamp(searchParams.get('sub'), 90, 'Nikunja-02 · 10 minutes from Dhaka Airport');
  const wa = clamp(searchParams.get('wa'), 20, '01322 840 799').replace(/[^0-9 +-]/g, '');

  const latinText = `HOTEL FOUNTAIN${badge}${title}${sub}${rate}/night${wa}WhatsApp DHAKA·`;
  const bengaliText = `${bn}৳${rate}`;

  const [inter, interBold, bengali] = await Promise.all([
    loadGoogleFont('Inter:wght@400', latinText),
    loadGoogleFont('Inter:wght@700', latinText),
    loadGoogleFont('Noto+Sans+Bengali:wght@700', bengaliText),
  ]);

  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700 }[] = [];
  if (inter) fonts.push({ name: 'Inter', data: inter, weight: 400 });
  if (interBold) fonts.push({ name: 'Inter', data: interBold, weight: 700 });
  if (bengali) fonts.push({ name: 'Bengali', data: bengali, weight: 700 });
  if (!fonts.length) return new Response('Font service unavailable', { status: 503 });

  const gold = '#C8A96E';
  const ivory = '#F5EFE4';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundImage: 'linear-gradient(160deg, #241B12 0%, #14100B 55%, #1C1510 100%)',
          fontFamily: 'Inter',
          padding: 54,
        }}
      >
        {/* gold frame */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: `3px solid ${gold}`,
            borderRadius: 24,
            opacity: 0.55,
          }}
        />

        {/* header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 46 }}>
          <div style={{ fontSize: 30, letterSpacing: 14, color: gold, fontWeight: 700 }}>HOTEL</div>
          <div style={{ fontSize: 76, letterSpacing: 6, color: ivory, fontWeight: 700, marginTop: -6 }}>FOUNTAIN</div>
          <div style={{ display: 'flex', marginTop: 26 }}>
            <div
              style={{
                fontSize: 26,
                letterSpacing: 6,
                color: '#14100B',
                fontWeight: 700,
                backgroundColor: gold,
                padding: '12px 34px',
                borderRadius: 999,
              }}
            >
              {badge.toUpperCase()}
            </div>
          </div>
        </div>

        {/* center: title + bangla + rate */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 70px' }}>
          <div
            style={{
              fontSize: 62,
              color: ivory,
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          {bn ? (
            <div
              style={{
                fontSize: 44,
                color: gold,
                fontFamily: 'Bengali',
                fontWeight: 700,
                marginTop: 22,
                textAlign: 'center',
              }}
            >
              {bn}
            </div>
          ) : null}
          {rate ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 34 }}>
              <div style={{ fontSize: 110, color: gold, fontWeight: 700, fontFamily: 'Bengali' }}>{`৳${rate}`}</div>
              <div style={{ fontSize: 34, color: ivory, marginBottom: 20, marginLeft: 12 }}>/night</div>
            </div>
          ) : null}
        </div>

        {/* footer */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 28, color: ivory, opacity: 0.9 }}>{sub}</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 30, color: gold, fontWeight: 700 }}>{`WhatsApp ${wa}`}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts,
      headers: {
        // Facebook fetches once per URL; long CDN cache keeps repeat renders free.
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
