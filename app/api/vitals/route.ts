import { NextResponse } from 'next/server';

// Lightweight, self-hosted Web Vitals attribution sink. The client
// WebVitalsReporter beacons a session's WORST CLS/INP (with the shifting element
// and the slow interaction target) here; we write it to the same
// public.audit_logs table the admin dashboard reads, as event_type='web_vital'.
//
// Purpose: Vercel Speed Insights shows a poor field CLS that neither Lighthouse
// lab nor Google CrUX can reproduce/attribute. This endpoint captures the real
// element that shifts in real sessions so the fix can be targeted, not guessed.
//
// BEST-EFFORT telemetry: if the write fails we log server-side and still return
// ok, so the reporter can never surface an error to a visitor.

export const runtime = 'nodejs';
export const maxDuration = 15;

const TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const clip = (v: unknown, n = 512) => (typeof v === 'string' ? v.slice(0, n) : v == null ? null : String(v).slice(0, n));
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);

export async function POST(req: Request) {
  // Always resolve to 200 - telemetry must never break the page it reports on.
  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ignore malformed */ }

    const cls = num(body.cls);
    const inp = num(body.inp);
    const worstShift = (body.worstShift || {}) as Record<string, unknown>;
    const shiftEl = clip(worstShift.el, 300);
    const shiftDelta = num(worstShift.deltaY);
    const inpTarget = clip(body.inpTarget, 300);
    const path = clip(body.path, 256) || '/';

    // Always log server-side so the data is visible in Vercel runtime logs even
    // if the DB insert is skipped/fails.
    console.log('[web_vital]', JSON.stringify({ path, cls, shiftEl, shiftDelta, inp, inpTarget }));

    if (!SB_URL || !SB_KEY) return NextResponse.json({ ok: true, stored: false });

    const breaching = (cls != null && cls >= 0.1) || (inp != null && inp >= 200);

    const ipHeader = req.headers.get('x-forwarded-for') || '';
    const ip = ipHeader.split(',')[0].trim() || null;
    const ua = clip(req.headers.get('user-agent'), 512);

    const summaryBits: string[] = [];
    if (cls != null && cls >= 0.1) summaryBits.push(`CLS ${cls} @ ${shiftEl || 'unknown'} (dy ${shiftDelta ?? '?'})`);
    if (inp != null && inp >= 200) summaryBits.push(`INP ${inp}ms @ ${inpTarget || 'unknown'}`);

    const row = {
      event_type: 'web_vital',
      role: 'anon',
      result: breaching ? 'failure' : 'success',
      action_target: clip(body.url, 512) || path,
      duration_ms: inp != null ? Math.round(inp) : null,
      payload_summary: {
        path,
        cls,
        worstShiftEl: shiftEl,
        worstShiftDeltaY: shiftDelta,
        worstShiftValue: num(worstShift.value),
        inp,
        inpTarget,
        viewport: body.viewport ?? null,
        ts_client: clip(body.ts_client, 64),
      },
      error: summaryBits.join(' | ') || null,
      ip,
      user_agent: ua,
      tenant_id: TENANT,
    };

    const r = await fetch(`${SB_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!r.ok) {
      console.error('[web_vital] insert failed', r.status, (await r.text()).slice(0, 300));
      return NextResponse.json({ ok: true, stored: false });
    }
    return NextResponse.json({ ok: true, stored: true });
  } catch (e) {
    console.error('[web_vital] handler error', String(e).slice(0, 300));
    return NextResponse.json({ ok: true, stored: false });
  }
}
