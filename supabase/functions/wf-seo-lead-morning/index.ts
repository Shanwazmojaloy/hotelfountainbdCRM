import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeForecast, planProspecting, dhakaToday, type ForecastSummary, type ProspectingPlan } from './forecast.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const NOTIFY_EMAIL = 'hotellfountainbd@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function gemini(prompt: string, maxTokens = 4096): Promise<string> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens } }) }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

function extractJSON(raw: string): Record<string, unknown>[] {
  const a0 = raw.indexOf('[');
  const a1 = raw.lastIndexOf(']');
  if (a0 !== -1 && a1 > a0) {
    try {
      const p = JSON.parse(raw.slice(a0, a1 + 1));
      return Array.isArray(p) ? p : [p];
    } catch {}
  }
  const o0 = raw.indexOf('{');
  const o1 = raw.lastIndexOf('}');
  if (o0 !== -1 && o1 > o0) {
    try { return [JSON.parse(raw.slice(o0, o1 + 1))]; } catch {}
  }
  return [];
}

async function sbInsert(table: string, body: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const d = await r.json();
  return Array.isArray(d) ? d[0] : d;
}
async function sbPatch(table: string, id: string, patch: Record<string, unknown>) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(patch) });
}

async function getResendKey(): Promise<string> {
  const envKey = Deno.env.get('RESEND_API_KEY');
  if (envKey) return envKey;
  const sb = createClient(SB_URL, SB_KEY);
  const { data } = await sb.rpc('vault_secret', { secret_name: 'RESEND_API_KEY' });
  if (data) return data;
  throw new Error('RESEND_API_KEY not found');
}
async function sendEmail(to: string, subject: string, html: string) {
  try {
    const key = await getResendKey();
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Hotel Fountain CRM <onboarding@resend.dev>', to: [to], subject, html }),
    });
    const d = await r.json();
    return r.ok ? { ok: true, id: d.id } : { ok: false, error: d.message || JSON.stringify(d) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ── Demand forecast: pull live rooms + reservations, compute outlook + plan ────
async function buildForecast(sb: ReturnType<typeof createClient>): Promise<{ forecast: ForecastSummary; plan: ProspectingPlan }> {
  const { count: roomCount } = await sb
    .from('rooms').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT);
  const totalRooms = roomCount ?? 0;
  const today = dhakaToday();
  const horizonEnd = new Date(new Date(today + 'T00:00:00Z').getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const { data: reservations } = await sb
    .from('reservations')
    .select('check_in,check_out,room_ids,status')
    .eq('tenant_id', TENANT)
    .in('status', ['RESERVED', 'CHECKED_IN', 'CONFIRMED', 'PENDING'])
    .lt('check_in', horizonEnd)
    .gt('check_out', today);
  const forecast = computeForecast(reservations || [], totalRooms, 14, today);
  const plan = planProspecting(forecast);
  return { forecast, plan };
}

const LEAD_CATEGORIES = [
  { type: 'corporate', label: 'Corporate Companies', query: 'HR managers and travel coordinators at multinational companies and large Bangladeshi corporations (garments, banking, telecom) in Dhaka who regularly need hotel accommodation for executives and training programs' },
  { type: 'events',    label: 'Events & Conferences', query: 'event organizers and conference planners in Dhaka who need hotel room blocks for attendees and team accommodation' },
  { type: 'travel',    label: 'Travel Agencies', query: 'Dhaka-based travel agencies and tour operators who book hotel rooms for clients in the Nikunja / airport area' },
  { type: 'embassy',   label: 'Embassies & NGOs', query: 'HR managers at foreign embassies, UNDP, UNICEF, WHO, and international development organizations in Dhaka who need hotel accommodation for international visitors' },
  { type: 'airlines',  label: 'Airlines & Aviation', query: 'procurement managers at airlines operating at HSIA (Biman, US-Bangla, Novoair, IndiGo, Air Arabia) who need crew layover hotels near the airport' },
];

// demandContext injected so leads are tailored to the actual occupancy gap.
async function prospectCategory(cat: typeof LEAD_CATEGORIES[0], count: number, demandContext: string): Promise<{ leads: Record<string,unknown>[]; error?: string }> {
  const prompt = `You are a sales prospector for Hotel Fountain, a 4-star hotel in Nikunja 2, Dhaka (5 min from HSIA airport). 28 rooms, BDT 3500-9000/night.\n\n${demandContext}\n\nGenerate ${count} realistic leads for: ${cat.query}\n\nRespond with ONLY a JSON array. No explanation, no markdown, no code fences. Your entire response must be valid JSON starting with [ and ending with ].\n\n[{"name":"Full Name","title":"Job Title","company":"Dhaka Company Name","email":"email@company.com","phone":"+8801XXXXXXXXX","segment":"${cat.type}","booking_need":"Why they need Hotel Fountain in 1-2 sentences","estimated_value":"e.g. 4 nights/month at BDT 4500","outreach_angle":"Best pitch angle for this lead"}]`;
  try {
    const raw = await gemini(prompt, 4096);
    const leads = extractJSON(raw);
    if (!leads.length) return { leads: [], error: `No JSON found. Raw[:100]: ${raw.slice(0, 100)}` };
    return { leads };
  } catch (e) { return { leads: [], error: String(e) }; }
}

async function generatePitch(lead: Record<string, unknown>): Promise<string> {
  const prompt = `Write a short outreach email FROM Hotel Fountain TO ${lead.name} (${lead.title} at ${lead.company}).\nNeed: ${lead.booking_need}. Angle: ${lead.outreach_angle}.\nHotel: Nikunja 2 Dhaka, 5min HSIA, BDT 3500-5000/night corporate rate.\nFormat: Subject line, blank line, Dear ${lead.name}, 2 paragraphs, sign off as Reservations Team +880-1319407384. No placeholders.`;
  try { return await gemini(prompt, 600); } catch (e) { return `Pitch error: ${e}`; }
}

// ── Forecast block for the morning email ──────────────────────────────────────
function buildForecastHTML(f: ForecastSummary, plan: ProspectingPlan): string {
  const dc: Record<string,string> = { HIGH:'#E06C7A', MED:'#C8A96E', LOW:'#58A6FF' };
  const bars = f.days.map(d => {
    const h = Math.max(3, Math.round(d.occPct * 0.5)); // px height, occ% scaled
    const c = dc[d.demand];
    return `<td align="center" style="vertical-align:bottom;padding:0 1px;">
      <div style="height:54px;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="font-size:7px;color:#6A6050;margin-bottom:2px;">${d.occPct}</div>
        <div style="height:${h}px;background:${c};opacity:${d.isWeekend?1:0.6};"></div>
      </div>
      <div style="font-size:6.5px;color:${d.isWeekend?'#C8A96E':'#4A4538'};margin-top:3px;">${d.dow}</div>
      <div style="font-size:6.5px;color:#4A4538;">${d.date.slice(8)}</div>
    </td>`;
  }).join('');
  const emph = plan.emphasis.length ? plan.emphasis.join(', ') : 'balanced';
  return `<tr><td style="background:#0A0C12;border:1px solid rgba(200,169,110,.15);border-top:none;padding:18px 28px;">
    <div style="font-family:Georgia,serif;font-size:14px;color:#C8A96E;margin-bottom:2px;">14-Day Demand Forecast</div>
    <div style="font-size:10px;color:#8A8070;line-height:1.6;margin-bottom:12px;">${f.avgOccPct}% avg occupancy &bull; ${f.overallDemand} demand &bull; ${f.roomNightsFree} room-nights to fill &bull; focus: <span style="color:#C8A96E;">${emph}</span></div>
    <table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>${bars}</tr></table>
    <div style="font-size:8px;color:#4A4538;margin-top:8px;">Bars = % occupancy by day. Brighter bars = weekend (Fri/Sat). Today's prospecting was weighted toward the segments above to fill these empty nights.</div>
  </td></tr>`;
}

function buildEmailHTML(leads: Array<Record<string,unknown>>, stats: { total: number; date: string; errors: string[] }, f: ForecastSummary, plan: ProspectingPlan): string {
  const segColor: Record<string,string> = { corporate:'#C8A96E', events:'#58A6FF', travel:'#3FB950', embassy:'#9E7BFF', airlines:'#E06C7A' };
  const rows = leads.map(lead => {
    const c = segColor[lead.segment as string] || '#C8A96E';
    return `<tr><td style="padding:16px 20px;border-bottom:1px solid rgba(200,169,110,.08);">
      <span style="font-size:9px;background:rgba(200,169,110,.08);border:1px solid rgba(200,169,110,.2);color:${c};letter-spacing:.12em;text-transform:uppercase;padding:2px 8px;font-weight:600;">${String(lead.segment||'').toUpperCase()}</span>
      <div style="margin-top:8px;font-size:15px;color:#EEE9E2;font-weight:600;font-family:Georgia,serif;">${lead.name}</div>
      <div style="font-size:11px;color:#8A8070;">${lead.title} &bull; ${lead.company}</div>
      <div style="font-size:11px;color:#4A9EFF;margin-top:3px;">${lead.email||''} ${lead.phone ? '| '+lead.phone : ''}</div>
      <div style="margin-top:10px;background:rgba(0,0,0,.3);border-left:2px solid ${c};padding:8px 12px;font-size:11px;color:#C8C0B0;line-height:1.6;">${lead.booking_need}</div>
      <div style="margin-top:6px;font-size:10px;color:#3FB950;">Est. value: ${lead.estimated_value||'TBD'}</div>
      ${lead.pitch ? `<div style="margin-top:10px;background:rgba(88,166,255,.04);border:1px solid rgba(88,166,255,.1);padding:10px 12px;"><div style="font-size:9px;color:#58A6FF;letter-spacing:.1em;margin-bottom:5px;font-weight:600;">READY-TO-SEND PITCH</div><div style="font-size:10px;color:#8A8070;white-space:pre-wrap;line-height:1.7;">${String(lead.pitch).slice(0,600)}</div></div>` : ''}
    </td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#07090E;padding:20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0"><tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.2);padding:24px 28px 0;"><div style="font-family:Georgia,serif;font-size:20px;color:#C8A96E;">Hotel <em>Fountain</em> &mdash; Morning Lead Brief</div><div style="font-size:10px;color:#4A4538;margin-top:4px;">${stats.date}</div><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,.5),transparent);margin-top:14px;"></div></td></tr><tr><td style="background:#0A0C12;border:1px solid rgba(200,169,110,.15);border-top:none;padding:14px 28px;"><table width="100%"><tr><td align="center" style="border-right:1px solid rgba(200,169,110,.1);padding:8px;"><div style="font-size:26px;color:#C8A96E;font-family:Georgia,serif;">${stats.total}</div><div style="font-size:9px;color:#4A4538;letter-spacing:.1em;">NEW LEADS</div></td><td align="center" style="border-right:1px solid rgba(200,169,110,.1);padding:8px;"><div style="font-size:26px;color:#58A6FF;font-family:Georgia,serif;">${f.avgOccPct}%</div><div style="font-size:9px;color:#4A4538;letter-spacing:.1em;">AVG OCCUPANCY</div></td><td align="center" style="padding:8px;"><div style="font-size:26px;color:#3FB950;font-family:Georgia,serif;">${f.roomNightsFree}</div><div style="font-size:9px;color:#4A4538;letter-spacing:.1em;">NIGHTS TO FILL</div></td></tr></table></td></tr>${buildForecastHTML(f, plan)}<tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;"><table width="100%">${rows}</table></td></tr><tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:20px 28px;"><a href="https://hotelfountainbd-crm.vercel.app/crm.html" style="display:inline-block;background:#C8A96E;color:#07090E;font-size:10px;letter-spacing:.16em;text-transform:uppercase;padding:11px 24px;text-decoration:none;">Open CRM &rarr;</a><div style="margin-top:10px;font-size:10px;color:#4A4538;">Leads weighted to demand gap &bull; Next brief: tomorrow 9:00 AM BDT</div>${stats.errors.length ? `<div style="margin-top:8px;font-size:9px;color:#E06C7A;">Note: ${stats.errors.length} of 5 segments had issues</div>` : '<div style="margin-top:8px;font-size:10px;color:#3FB950;">All 5 segments processed successfully</div>'}</td></tr><tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:12px 28px;"><div style="font-size:10px;color:#4A4538;">Hotel Fountain &middot; Lumea CRM &middot; Demand-Aware Lead Intelligence &middot; Auto 9 AM BDT</div></td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const start = Date.now();
  const sb = createClient(SB_URL, SB_KEY);
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';

  // ── DRY RUN: compute forecast + plan only, no writes, bypasses dedup. ────
  if (dry) {
    const { forecast, plan } = await buildForecast(sb);
    return new Response(JSON.stringify({ dry_run: true, forecast, plan }, null, 2),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── DEDUP GUARD: skip if already ran successfully today ─────────────────
  const { data: shouldRun } = await sb.rpc('workflow_should_run', { p_workflow_name: 'seo-lead-morning' });
  if (!shouldRun) {
    return new Response(JSON.stringify({
      skipped: true,
      reason: 'already_ran_today_or_in_flight',
      message: 'seo-lead-morning already ran successfully today. Skipping duplicate run.'
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── ACQUIRE LOCK: prevent concurrent in-flight runs ─────────────────────
  await sb.rpc('workflow_acquire_lock', { p_workflow_name: 'seo-lead-morning' });

  // ── DEMAND FORECAST: drives which segments to prospect and how hard ─────
  const { forecast, plan } = await buildForecast(sb);

  const allLeads: Array<Record<string,unknown>> = [];
  const errors: string[] = [];

  for (const cat of LEAD_CATEGORIES) {
    const count = plan.perCategory[cat.type] || 3;
    const { leads, error } = await prospectCategory(cat, count, plan.demandContext);
    if (error) { errors.push(`[${cat.type}] ${error}`); continue; }
    for (const lead of leads.slice(0, count)) {
      try {
        const saved = await sbInsert('leads', {
          name:    String(lead.name   ||'Unknown').slice(0,100),
          email:   String(lead.email  ||'').slice(0,200),
          phone:   String(lead.phone  ||'').slice(0,50),
          company: String(lead.company||'').slice(0,200),
          source:  `AI-${cat.type}`,
          notes:   `[${cat.label}] ${lead.booking_need||''} | Est: ${lead.estimated_value||''}`,
          status:  'new',
          tenant_id: TENANT,
        });
        const pitch = await generatePitch(lead);
        if (saved?.id) await sbPatch('leads', saved.id, { email_draft: pitch, status: 'email_drafted', updated_at: new Date().toISOString() });
        allLeads.push({ ...lead, pitch, _id: saved?.id });
      } catch (e) { errors.push(`save[${cat.type}]: ${e}`); }
    }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const html = buildEmailHTML(allLeads, { total: allLeads.length, date: dateStr, errors }, forecast, plan);
  const emailResult = await sendEmail(
    NOTIFY_EMAIL,
    `🏨 Hotel Fountain — ${allLeads.length} New Leads | ${forecast.avgOccPct}% occ | ${now.toLocaleDateString('en-US',{timeZone:'Asia/Dhaka',month:'short',day:'numeric'})}`,
    html
  );

  const runStatus = emailResult.ok ? 'success' : 'partial';
  try {
    await sbInsert('workflow_runs', {
      workflow_name: 'seo-lead-morning',
      status: runStatus,
      duration_ms: Date.now() - start,
      records_processed: allLeads.length,
      ran_at: new Date().toISOString(),
      tenant_id: TENANT
    });
  } catch(_){}

  // ── RELEASE LOCK ─────────────────────────────────────────────────────────
  await sb.rpc('workflow_release_lock', { p_workflow_name: 'seo-lead-morning' });

  return new Response(JSON.stringify({
    success: true,
    leads_generated: allLeads.length,
    forecast: { avgOccPct: forecast.avgOccPct, overallDemand: forecast.overallDemand, roomNightsFree: forecast.roomNightsFree },
    prospecting_emphasis: plan.emphasis,
    email_sent: emailResult.ok,
    email_id: (emailResult as {id?:string}).id,
    email_error: (emailResult as {error?:string}).error,
    errors: errors.length ? errors : undefined,
    duration_ms: Date.now() - start,
  }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
