import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendMail } from '../_shared/mailer.ts';

// ── Competitor Monitor ────────────────────────────────────────────────────────
// Scheduled 06:00 AM Asia/Dhaka. Pulls own occupancy/pricing and (if a Gemini key
// is set) an AI snapshot of nearby Nikunja/airport hotel rates, emails the owner,
// and logs to workflow_runs as 'competitor-monitor'.
//
// TRUNCATION FIX 2026-08-17 — the 08-17 email cut off mid-sentence at
// "* Grace 21 Smart Hotel (Strong". The cause was here, not in the template:
//   1. gemini-2.5-flash is a THINKING model and its reasoning tokens are billed
//      against maxOutputTokens. The old call set maxOutputTokens: 1200 and NO
//      thinkingConfig, so the model used a dynamic (unbounded) thinking budget,
//      spent most of the 1200 reasoning, and the visible answer was cut with
//      finishReason = MAX_TOKENS. Now: an explicit thinkingBudget of 512 inside
//      a 4096 ceiling. Measured on 2026-08-17: 391 thinking + 235 answer tokens,
//      finishReason STOP.
//   2. the response reader was `parts.find(p => p.text)?.text` - it returned the
//      FIRST text part and silently discarded every part after it. Now every
//      non-thought part is concatenated. (Latent; hardened, not the 08-17 cause.)
// Belt and braces: a MAX_TOKENS finish is retried once at a higher cap, and if
// it still truncates the email carries a visible notice and the run is logged
// 'partial'. A green dot must never mean "half an email". (Same rule as H-12.)
//
// NOTE verify_jwt MUST stay false. The Vercel cron forwarder authenticates with
// the sb_publishable_... key, which is not a JWT; turning verification on breaks
// the 06:00 run silently.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const SENDER_EMAIL = Deno.env.get('CRM_FROM_EMAIL') ?? 'reservations@fountainbd.com';  // gmail.com is NOT a verified Resend domain - verified by live invoke 2026-08-15 (H-12)
const TO_EMAIL = 'shanwazahmed@fountainbd.com';
const HOTEL = 'Hotel Fountain BD';
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function db(table: string, q = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${q}`, { headers: H });
  return r.json();
}
async function log(name: string, status: string, records: number, summary: object) {
  await fetch(`${SB_URL}/rest/v1/workflow_runs`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ workflow_name: name, status, records_processed: records, summary, tenant_id: TENANT })
  }).catch(() => {});
}

interface GeminiResult { text: string; finishReason: string; usage: Record<string, number>; error: string | null }

// maxTokens covers thinking + answer, so it is sized well above the ~250 tokens
// of prose we actually want, and thinking is capped explicitly.
async function geminiOnce(prompt: string, maxTokens: number, thinkingBudget: number): Promise<GeminiResult> {
  const empty = { text: '', finishReason: '', usage: {}, error: null as string | null };
  if (!GEMINI_KEY) return { ...empty, error: 'no GEMINI_API_KEY' };
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: maxTokens,
            thinkingConfig: { thinkingBudget },
          },
        }),
      }
    );
    if (!r.ok) return { ...empty, error: `gemini HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const d = await r.json();
    const cand = d.candidates?.[0];
    const parts: Array<{ text?: string; thought?: boolean }> = cand?.content?.parts ?? [];
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
    const u = d.usageMetadata ?? {};
    return {
      text,
      finishReason: String(cand?.finishReason ?? ''),
      usage: {
        prompt: u.promptTokenCount ?? 0,
        thoughts: u.thoughtsTokenCount ?? 0,
        answer: u.candidatesTokenCount ?? 0,
        total: u.totalTokenCount ?? 0,
      },
      error: null,
    };
  } catch (e) {
    return { ...empty, error: `gemini threw: ${(e as Error).message}` };
  }
}

// Retries once at a higher ceiling if the model still ran out of room.
async function gemini(prompt: string): Promise<GeminiResult & { retried: boolean }> {
  const first = await geminiOnce(prompt, 4096, 512);
  if (first.finishReason !== 'MAX_TOKENS') return { ...first, retried: false };
  const second = await geminiOnce(prompt, 8192, 1024);
  return { ...second, retried: true };
}

// The model answers with markdown bullets and **bold** despite being asked not
// to. Rendering that raw is what put literal asterisks in the owner's inbox.
// Bullets become real bullets, trailing-colon lines become section labels.
function toHtml(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#EEE9E2;font-weight:600">$1</strong>')
    .replace(/\*(.+?)\*/g, '$1');
  const out: string[] = [];
  let first = true;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^([*\-•]|\d+\.)\s+/.test(line)) {
      out.push(`<div style="margin:0 0 7px;padding-left:15px;text-indent:-15px">&bull;&nbsp;${inline(line.replace(/^([*\-•]|\d+\.)\s+/, ''))}</div>`);
    } else if (line.length < 60 && line.endsWith(':')) {
      out.push(`<div style="margin:${first ? '0' : '18px'} 0 9px;font-size:10px;color:#9A907C;letter-spacing:.14em;text-transform:uppercase">${inline(line.replace(/:$/, ''))}</div>`);
    } else {
      out.push(`<div style="margin:0 0 9px">${inline(line)}</div>`);
    }
    first = false;
  }
  return out.join('');
}

async function sendBrevo(subject: string, html: string, text: string) {
  // Resend via the shared mailer. Audit 2026-08-15 H-12.
  return await sendMail({ to: TO_EMAIL, subject, html, text, fromName: `${HOTEL} CRM`, fromEmail: SENDER_EMAIL });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    // { "dry_run": true } renders and returns the email without sending it or
    // writing workflow_runs. Use this to verify the snapshot before 06:00.
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun = body?.dry_run === true;

    const date = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
    const rooms = await db('rooms', `?tenant_id=eq.${TENANT}&select=room_number,status,price,category`);
    const occupied = (rooms || []).filter((r: any) => r.status === 'OCCUPIED').length;
    const total = (rooms || []).length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const prices = (rooms || []).map((r: any) => +r.price || 0).filter((p: number) => p > 0);
    const avgRate = prices.length ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length) : 0;

    const g = await gemini(
      `You are a revenue-management analyst for Hotel Fountain, a 4-star hotel in Nikunja 2, Dhaka, 5 min from Hazrat Shahjalal International Airport. ` +
      `Our average room rate is about ৳${avgRate}/night and today's occupancy is ${occupancyRate}%. ` +
      `Give a concise competitor pricing snapshot (3-5 bullet points) of comparable airport/Nikunja Dhaka hotels and ONE pricing recommendation for today. ` +
      `Plain text, no markdown headings. Finish every sentence - do not stop mid-thought.`
    );
    const intel = g.text;
    const truncated = g.finishReason === 'MAX_TOKENS';

    let intelHtml: string;
    if (intel) {
      intelHtml = toHtml(intel);
      if (truncated) {
        intelHtml += `<div style="margin-top:12px;padding-top:9px;border-top:1px solid rgba(255,107,107,.25);color:#FF9B9B;font-size:11px">` +
          `Snapshot cut short by the model's output limit - the text above is incomplete.</div>`;
      }
    } else {
      intelHtml = `<div style="color:#FF9B9B">AI competitor snapshot unavailable${g.error ? ` (${g.error.replace(/</g, '&lt;')})` : ''}. Showing internal pricing only.</div>`;
    }

    const summary = {
      date, occupied, total,
      occupancy_rate: occupancyRate,
      avg_rate: avgRate,
      ai_used: !!intel,
      ai_chars: intel.length,
      ai_finish_reason: g.finishReason || null,
      ai_truncated: truncated,
      ai_retried: g.retried,
      ai_tokens: g.usage,
      ai_error: g.error,
    };

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#07090E;border:1px solid rgba(200,169,110,.2)">
<tr><td style="padding:24px 40px 18px;border-bottom:1px solid rgba(200,169,110,.12)">
  <div style="font-size:11px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase">Competitor Monitor · ${date}</div>
  <div style="font-size:20px;color:#EEE9E2;font-weight:300;margin-top:4px">${HOTEL}</div>
</td></tr>
<tr><td style="padding:28px 40px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
      <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Our Avg Rate</div>
      <div style="font-size:26px;color:#C8A96E;font-weight:300;margin-top:4px">৳${avgRate.toLocaleString()}</div>
    </td>
    <td style="width:16px"></td>
    <td style="padding:14px 18px;background:rgba(200,169,110,.06);border:1px solid rgba(200,169,110,.12)">
      <div style="font-size:10px;color:#9A907C;letter-spacing:.15em;text-transform:uppercase">Occupancy</div>
      <div style="font-size:26px;color:#EEE9E2;font-weight:300;margin-top:4px">${occupancyRate}%</div>
    </td>
  </tr></table>
  <div style="margin-top:18px;padding:18px 20px;background:rgba(88,166,255,.04);border:1px solid rgba(88,166,255,.15);font-size:12px;color:#C8C0B0;line-height:1.7">
    <div style="font-size:10px;color:#58A6FF;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px">Market Snapshot</div>
    ${intelHtml}
  </div>
</td></tr>
<tr><td style="padding:14px 40px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
  <p style="font-size:10px;color:#5a5a4a;margin:0">Automated competitor monitor from ${HOTEL} CRM</p>
</td></tr>
</table></td></tr></table></body></html>`;

    const text = `${HOTEL} Competitor Monitor — ${date}\nOur avg rate: ৳${avgRate} · Occupancy: ${occupancyRate}%\n\n${intel || 'AI snapshot unavailable.'}${truncated ? '\n\n[Snapshot cut short by the model output limit - incomplete.]' : ''}`;

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dry_run: true, summary, intel, html, text }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const email = await sendBrevo(`[${HOTEL}] Competitor Monitor — ${date}`, html, text);

    // status mirrors the real send outcome - a green dot must mean delivered. H-12.
    // A truncated snapshot is 'partial' even when the send succeeds: a half email
    // is not a success.
    const status = !email.ok ? 'partial' : truncated ? 'partial' : 'success';
    await log('competitor-monitor', status, total, { ...summary, email_sent: email.ok, email_error: email.error ?? null });
    return new Response(JSON.stringify({ ok: true, summary, email }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    await log('competitor-monitor', 'error', 0, { error: e.message }).catch(() => {});
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
