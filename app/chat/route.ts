import { NextRequest, NextResponse } from 'next/server';

// Public AI chat widget proxy. The browser only ever talks to fountainbd.com
// (same-origin); this route forwards to the bot backend server-side, so no
// third-party origin, DNS record, or TLS cert for the widget is needed.
// Swap BOT_ORIGIN (or set CHAT_BOT_ORIGIN) if the assistant host changes.
const BOT_ORIGIN = process.env.CHAT_BOT_ORIGIN || 'https://187-127-187-66.sslip.io';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const upstream = await fetch(`${BOT_ORIGIN}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Guard against a hung upstream holding the function open.
      signal: AbortSignal.timeout(20_000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { reply: "Sorry, I'm having trouble connecting. Please call +880 1322-840799." },
      { status: 502 },
    );
  }
}
