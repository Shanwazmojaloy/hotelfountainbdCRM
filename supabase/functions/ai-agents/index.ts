import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

const SB_URL = 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
const GEMINI_MODEL = 'gemini-2.5-flash';

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

async function gemini(prompt: string, maxTokens = 1024): Promise<string> {
  if (!GEMINI_KEY) return 'ERROR: GEMINI_API_KEY not set';
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );
    if (!r.ok) {
      const e = await r.text();
      return `ERROR: Gemini ${r.status}: ${e.slice(0, 300)}`;
    }
    const d = await r.json();
    return geminiText(d) || 'ERROR: Empty response';
  } catch (e: any) {
    return `ERROR: ${e.message}`;
  }
}

async function sbGet(table: string, q = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${q}`, { headers: H });
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}
async function sbPost(table: string, body: object) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  return r.json();
}
async function sbPatch(table: string, id: string, body: object) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(body)
  });
}

// Robust JSON extractor — handles code fences, nested braces, trailing text, leading prose.
function extractJSON(raw: string): any[] {
  if (!raw || raw.startsWith('ERROR:')) return [];
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json|JSON)?\s*/g, '')
    .replace(/```/g, '')
    .trim();
  // Try direct
  try { const p = JSON.parse(cleaned); return Array.isArray(p) ? p : (p ? [p] : []); } catch {}
  // Find first '[' and scan balanced brackets tracking strings
  const start = cleaned.indexOf('[');
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          const slice = cleaned.slice(start, i + 1);
          try { return JSON.parse(slice); } catch { break; }
        }
      }
    }
  }
  // Fallback: find first balanced object
  const objStart = cleaned.indexOf('{');
  if (objStart >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = objStart; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const slice = cleaned.slice(objStart, i + 1);
          try { const o = JSON.parse(slice); return [o]; } catch { break; }
        }
      }
    }
  }
  return [];
}

async function agentProspector(query: string) {
  const prompt = `You are a hotel sales prospector for Hotel Fountain, Dhaka, Bangladesh.
Generate exactly 3 realistic leads for: "${query}"
Return ONLY a JSON array starting with [ and ending with ] — no markdown, no code fence, no explanation before or after.
Each object must have these exact keys: name, email, phone, company, source, notes.
Example shape:
[{"name":"Full Name","email":"email@company.com","phone":"+8801XXXXXXXXX","company":"Company Name","source":"LinkedIn","notes":"Why they need Dhaka hotel rooms (1-2 specific sentences)."}]`;

  const raw = await gemini(prompt, 1200);
  if (raw.startsWith('ERROR:')) return { error: raw, agent: 'Prospector' };

  const leads = extractJSON(raw);
  if (!leads.length) return { error: 'Parse failed', raw: raw.slice(0, 500), agent: 'Prospector' };

  const saved: any[] = [];
  const raw_leads: any[] = [];
  for (const lead of leads.slice(0, 3)) {
    const clean = {
      name: String(lead.name || 'Unknown').slice(0, 100),
      email: String(lead.email || '').slice(0, 200),
      phone: String(lead.phone || '').slice(0, 50),
      company: String(lead.company || '').slice(0, 200),
      source: String(lead.source || 'AI').slice(0, 100),
      notes: String(lead.notes || '').slice(0, 1000),
    };
    raw_leads.push(clean);
    try {
      const s = await sbPost('leads', { ...clean, status: 'new', tenant_id: TENANT });
      const sl = Array.isArray(s) ? s[0] : s;
      if (sl?.id) {
        const er = await agentCloser(sl.id, clean);
        saved.push({ ...sl, email_draft: er.email_draft });
      } else {
        saved.push({ ...clean, _err: JSON.stringify(s).slice(0, 150) });
      }
    } catch (e: any) {
      saved.push({ ...clean, _err: e.message });
    }
  }
  return {
    agent: 'Prospector',
    model: GEMINI_MODEL,
    query,
    leads_found: saved.length,
    raw_leads,
    leads: saved,
    generated_at: new Date().toISOString()
  };
}

async function agentCloser(leadId: string, leadData?: any) {
  const lead = leadData ?? (await sbGet('leads', `?id=eq.${leadId}&select=*`))?.[0];
  if (!lead) return { error: `Lead not found: ${leadId}`, email_draft: null };

  const clientName = lead.name || 'Sir/Madam';
  const clientCompany = lead.company ? ` from ${lead.company}` : '';
  const clientNeed = lead.notes || 'hotel accommodation in Dhaka';

  const prompt = `You are writing a sales email on behalf of Hotel Fountain, Dhaka, Bangladesh.
You are the Hotel Fountain Reservations Team writing TO: ${clientName}${clientCompany}
Their need: ${clientNeed}

Hotel Fountain offers:
- Fountain Deluxe rooms from ৳4,000/night
- Superior Deluxe at ৳5,000/night
- Royal Suite at ৳9,000/night
- Conference rooms, restaurant, 24/7 front desk, prime Dhaka location

Write a complete outreach email:
Subject: [write a relevant subject about their specific need]

Dear ${clientName},

[Paragraph 1: Reference their specific need (${clientNeed}) and show you understand their requirement]

[Paragraph 2: How Hotel Fountain specifically addresses this — mention relevant rooms/facilities with prices]

[Paragraph 3: Invite them to contact us. End with: Please contact us at +880-2-XXXXXXXX or reservations@hotelfountain.com]

Warm regards,
Reservations Team
Hotel Fountain, Dhaka

RULES: Use ${clientName} in the salutation. Write FROM Hotel Fountain TO the client. No placeholder text like [Name] or [X]. Complete sentences only.`;

  const draft = await gemini(prompt, 700);
  if (!draft.startsWith('ERROR:') && leadId) {
    await sbPatch('leads', leadId, {
      email_draft: draft,
      status: 'email_drafted',
      updated_at: new Date().toISOString()
    });
  }
  return { agent: 'Closer', lead_name: clientName, lead_id: leadId, email_draft: draft, error: draft.startsWith('ERROR:') ? draft : null };
}

async function agentAnalyst() {
  const leads = await sbGet('leads', `?tenant_id=eq.${TENANT}&status=in.(new,email_drafted)&order=created_at.desc&limit=10&select=id,name,email,phone,company,notes,email_draft`);
  const txs = await sbGet('transactions', `?tenant_id=eq.${TENANT}&fiscal_day=gte.${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}&select=amount,fiscal_day,created_at`);
  const rooms = await sbGet('rooms', `?tenant_id=eq.${TENANT}&select=status`);

  const rev7 = txs.filter((t: any) => new Date(t.fiscal_day || t.created_at) >= new Date(Date.now() - 7 * 86400000)).reduce((a: number, t: any) => a + (+t.amount || 0), 0);
  const occ = rooms.filter((r: any) => r.status === 'OCCUPIED').length;
  const avail = rooms.filter((r: any) => r.status === 'AVAILABLE').length;
  const rate = rooms.length > 0 ? Math.round(occ / rooms.length * 100) : 0;

  // Day-of-week averages (last 30d)
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayBuckets: Record<string, { total: number, count: number }> = {};
  for (const t of txs) {
    const d = new Date(t.fiscal_day || t.created_at);
    const key = dayNames[d.getUTCDay()];
    if (!dayBuckets[key]) dayBuckets[key] = { total: 0, count: 0 };
    dayBuckets[key].total += (+t.amount || 0);
    dayBuckets[key].count += 1;
  }
  const day_averages: Record<string, number> = {};
  for (const k of dayNames) {
    const b = dayBuckets[k];
    day_averages[k] = b && b.count > 0 ? Math.round(b.total / b.count) : 0;
  }
  const sorted = Object.entries(day_averages).filter(([,v])=>v>0).sort(([,a],[,b])=>a-b);
  const lowest_day = sorted[0]?.[0] || '';
  const highest_day = sorted[sorted.length - 1]?.[0] || '';

  const lt = leads.length > 0
    ? leads.map((l: any, i: number) =>
        `${i + 1}. ${l.name} (${l.company || 'Individual'}) — ${l.notes || 'hotel accommodation'}`
      ).join('\n')
    : 'No pending leads.';

  const prompt = `You are the Hotel Fountain Dhaka revenue analyst. Write a concise analysis brief.

CURRENT STATUS:
- Occupancy: ${rate}% (${occ}/${rooms.length} rooms; ${avail} available)
- Revenue (last 7d): ৳${rev7.toLocaleString()}
- Lowest-revenue day: ${lowest_day || 'n/a'} | Highest-revenue day: ${highest_day || 'n/a'}
- Pending leads (${leads.length}):
${lt}

Write a 4-paragraph brief in plain text (NO markdown, NO JSON):
Paragraph 1: Occupancy & revenue read.
Paragraph 2: Which day-of-week is underperforming and why it matters.
Paragraph 3: Concrete #1 priority action for the front desk today.
Paragraph 4: A specific discount recommendation (e.g. "15% off Fountain Deluxe on ${lowest_day || 'Tue'} nights") that front desk should apply.`;

  const analysis = await gemini(prompt, 1200);

  // Extract suggested_discount heuristically from the last paragraph
  const paras = analysis.split(/\n\s*\n/);
  const suggested_discount = paras[paras.length - 1]?.replace(/^Paragraph\s*4:?\s*/i, '').slice(0, 240) || 'No discount suggested';

  await fetch(`${SB_URL}/rest/v1/hotel_settings`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      key: 'front_desk_brief',
      value: JSON.stringify({ brief: analysis, leads_count: leads.length, generated_at: new Date().toISOString() }),
      tenant_id: TENANT
    })
  });
  for (const l of leads) if (l.id) await sbPatch('leads', l.id, { status: 'briefed_to_front_desk' });

  return {
    agent: 'Analyst',
    model: GEMINI_MODEL,
    analysis,
    brief: analysis,
    day_averages,
    lowest_day,
    highest_day,
    needs_approval: !analysis.startsWith('ERROR:') && suggested_discount.length > 10,
    suggested_discount,
    occupancy_rate: rate,
    week_revenue: rev7,
    available_rooms: avail,
    leads_briefed: leads.length,
    generated_at: new Date().toISOString(),
    error: analysis.startsWith('ERROR:') ? analysis : null
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get('check') === '1') {
    return new Response(JSON.stringify({
      gemini_key_set: !!GEMINI_KEY,
      gemini_key_length: GEMINI_KEY.length,
      sb_key_set: !!SB_KEY,
      model: GEMINI_MODEL,
      version: 13
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  let result: any = {};
  try {
    const { action, query, lead_id } = await req.json().catch(() => ({}));
    if (action === 'prospect') result = await agentProspector(query || 'corporate clients in Dhaka needing hotel rooms');
    else if (action === 'close') result = lead_id ? await agentCloser(lead_id) : { error: 'lead_id required' };
    else if (action === 'analyze') result = await agentAnalyst();
    else result = { status: 'ok', version: 13, model: GEMINI_MODEL, gemini_ready: !!GEMINI_KEY };
  } catch (e: any) {
    result = { error: e.message };
  }

  return new Response(JSON.stringify(result, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
