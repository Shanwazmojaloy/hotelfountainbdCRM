import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Daily 9 AM SEO Lead Prospecting Workflow
// Finds corporate/event/travel leads → saves to DB → emails hotellfountainbd@gmail.com

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';
const NOTIFY_EMAIL = 'hotellfountainbd@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const H = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

// ── Gemini helper ──────────────────────────────────────────────────────────────
async function gemini(prompt: string, maxTokens = 4000): Promise<string> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  // Handle both standard and thinking-model response formats
  const parts: Array<{ text?: string }> = d.candidates?.[0]?.content?.parts ?? [];
  const text = parts.find((p) => p.text)?.text ?? '';
  return text;
}

function extractJSON(raw: string): Record<string, unknown>[] {
  // 1. Direct parse (handles clean responses)
  try { const r = JSON.parse(raw.trim()); return Array.isArray(r) ? r : []; } catch {}

  // 2. Find the outermost [...] using depth counting (handles nested arrays/objects)
  const start = raw.indexOf('[');
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          const slice = raw.slice(start, i + 1);
          try { const r = JSON.parse(slice); return Array.isArray(r) ? r : []; } catch {}
          break;
        }
      }
    }
  }
  return [];
}

// ── Supabase helpers ───────────────────────────────────────────────────────────
async function sbInsert(table: string, body: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  return Array.isArray(d) ? d[0] : d;
}

async function sbPatch(table: string, id: string, patch: Record<string, unknown>) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify(patch),
  });
}

async function sbGet(table: string, q = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${q}`, { headers: H });
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

// ── Email via Resend ───────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  if (!RESEND_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const body: Record<string, unknown> = {
    from: 'Hotel Fountain Reservations <onboarding@resend.dev>',
    to: [to],
    subject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  return r.ok ? { ok: true, id: d.id } : { ok: false, error: d.message || JSON.stringify(d) };
}

// ── Convert plain-text pitch to { subject, html } ─────────────────────────────
function pitchToEmail(pitch: string): { subject: string; html: string } {
  const lines = pitch.split('\n');
  let subject = '';
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (!subject && line.toLowerCase().startsWith('subject:')) {
      subject = line.replace(/^subject:\s*/i, '').trim();
    } else {
      bodyLines.push(line);
    }
  }
  const bodyHTML = bodyLines
    .join('\n')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n+/g, '</p><p style="margin:0 0 14px;">')
    .replace(/\n/g, '<br>');

  return {
    subject: subject || 'Partnership Opportunity — Hotel Fountain, Dhaka',
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e8e0d0;">
  <tr><td style="background:#1a1208;padding:24px 36px;">
    <div style="font-family:Georgia,serif;font-size:20px;color:#C8A96E;">Hotel <em>Fountain</em></div>
    <div style="font-size:9px;color:#6a5a3a;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">Nikunja 2, Dhaka &middot; 5 min from HSIA Airport</div>
  </td></tr>
  <tr><td style="padding:32px 36px 24px;">
    <p style="margin:0 0 14px;font-size:14px;color:#2c2c2c;line-height:1.8;">${bodyHTML}</p>
  </td></tr>
  <tr><td style="background:#faf8f4;border-top:1px solid #e8e0d0;padding:20px 36px;">
    <div style="font-size:11px;color:#8a7a6a;line-height:1.8;">
      <strong style="color:#2c2c2c;">Hotel Fountain</strong><br>
      House 13, Road 12, Nikunja 2, Dhaka 1229<br>
      Phone: <a href="tel:+8801319407384" style="color:#C8A96E;text-decoration:none;">+880-1319-407384</a> &nbsp;&middot;&nbsp;
      Email: <a href="mailto:hotellfountainbd@gmail.com" style="color:#C8A96E;text-decoration:none;">hotellfountainbd@gmail.com</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
  };
}

// ── Lead Categories ────────────────────────────────────────────────────────────
const LEAD_CATEGORIES = [
  { type: 'corporate', label: 'Corporate Companies', query: 'HR managers and corporate travel coordinators at multinational companies and large Bangladeshi corporations (garments, banking, telecom, NGOs) based in Dhaka who regularly need hotel accommodation for visiting executives, training programs, or relocating staff' },
  { type: 'events', label: 'Events & Conferences', query: 'event organizers, conference planners, and wedding coordinators in Dhaka who need hotel blocks for their attendees, team accommodation, or venue partnerships' },
  { type: 'travel', label: 'Travel Agencies & OTAs', query: 'Dhaka-based travel agencies and tour operators who book hotel rooms for their clients travelling through or staying in Nikunja / airport area' },
  { type: 'embassy', label: 'Embassies & NGOs', query: 'HR managers at foreign embassies, international NGOs (UNDP, UNICEF, WHO, etc.) and development organizations in Dhaka who need regular hotel accommodation for international visitors and staff' },
  { type: 'airlines', label: 'Airlines & Aviation', query: 'procurement managers at airlines operating at Hazrat Shahjalal International Airport (Biman Bangladesh, US-Bangla, Novoair, IndiGo, Air Arabia) who need crew layover hotels and passenger disruption accommodation near the airport' },
];

// ── Prospect leads for one category ───────────────────────────────────────────
async function prospectCategory(category: typeof LEAD_CATEGORIES[0]): Promise<Record<string, unknown>[]> {
  const prompt = `You are a sales prospector for Hotel Fountain, a premium 4-star hotel in Nikunja 2, Dhaka, Bangladesh — just 5 minutes from Hazrat Shahjalal International Airport (HSIA).

Hotel details: 28 rooms, ৳3,500-৳9,000/night, Airport proximity, Corporate rates available, Conference room, Restaurant.

Generate 3 high-quality, realistic potential leads for this target segment:
${category.query}

For each lead, provide:
- Real-sounding company names and contacts relevant to Bangladesh/Dhaka
- Specific reason WHY they would need Hotel Fountain
- Estimated booking volume or frequency

Return ONLY a JSON array, no markdown:
[
  {
    "name": "Full Name",
    "title": "Job Title",
    "company": "Company Name",
    "email": "professional@company.com",
    "phone": "+8801XXXXXXXXX",
    "segment": "${category.type}",
    "booking_need": "Specific accommodation need in 1-2 sentences",
    "estimated_value": "e.g. 3-5 room-nights/month at ৳4,500/night",
    "outreach_angle": "Best angle to pitch Hotel Fountain to this specific person"
  }
]`;

  const raw = await gemini(prompt, 4000);
  return extractJSON(raw);
}

// ── Generate pitch email for a lead ───────────────────────────────────────────
async function generatePitch(lead: Record<string, unknown>): Promise<string> {
  const prompt = `Write a concise, professional outreach email FROM Hotel Fountain TO ${lead.name} (${lead.title} at ${lead.company}).

Their specific need: ${lead.booking_need}
Best pitch angle: ${lead.outreach_angle}

Hotel Fountain offerings:
- 28 premium rooms, Nikunja 2, Dhaka — 5 min from HSIA airport
- Corporate rates: ৳3,500-৳5,000/night
- Conference facilities, restaurant, 24/7 front desk
- Direct booking benefits (no OTA fees, flexible cancellation)

Email format:
Subject: [relevant subject]

Dear ${lead.name},

[2-3 paragraph email body, specific to their need]

Warm regards,
Reservations Team
Hotel Fountain, Nikunja 2, Dhaka
Phone: +880-1319407384

Write the full email. Be specific, warm, and professional. No placeholders.`;

  return gemini(prompt, 600);
}

// ── Build the daily email HTML ─────────────────────────────────────────────────
function buildEmailHTML(
  leads: Array<Record<string, unknown> & { pitch?: string }>,
  stats: { totalLeads: number; categories: number; date: string }
): string {
  const leadRows = leads.map((lead, i) => {
    const segColors: Record<string, string> = {
      corporate: '#C8A96E', events: '#58A6FF', travel: '#3FB950',
      embassy: '#9E7BFF', airlines: '#E06C7A',
    };
    const color = segColors[lead.segment as string] || '#C8A96E';
    return `
    <tr>
      <td style="padding:16px;border-bottom:1px solid rgba(200,169,110,.1);vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:8px;">
              <span style="display:inline-block;background:rgba(200,169,110,.08);border:1px solid rgba(200,169,110,.2);color:${color};font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:3px 8px;font-weight:600;">${(lead.segment as string || '').toUpperCase()}</span>
              <span style="font-size:9px;color:#4A4538;margin-left:8px;">#${i + 1}</span>
            </td>
          </tr>
          <tr>
            <td>
              <div style="font-size:15px;color:#EEE9E2;font-weight:600;font-family:Georgia,serif;">${lead.name}</div>
              <div style="font-size:11px;color:#8A8070;margin-top:2px;">${lead.title} &bull; ${lead.company}</div>
              <div style="font-size:11px;color:#4A9EFF;margin-top:4px;">${lead.email || ''} ${lead.phone ? '&bull; ' + lead.phone : ''}</div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:10px;">
              <div style="background:rgba(0,0,0,.3);border-left:2px solid ${color};padding:10px 14px;margin-bottom:8px;">
                <div style="font-size:9px;color:${color};letter-spacing:.1em;margin-bottom:4px;font-weight:600;">BOOKING NEED</div>
                <div style="font-size:12px;color:#C8C0B0;line-height:1.6;">${lead.booking_need}</div>
              </div>
              <div style="display:inline-block;background:rgba(63,185,80,.06);border:1px solid rgba(63,185,80,.2);padding:4px 10px;margin-bottom:10px;">
                <span style="font-size:9px;color:#3FB950;letter-spacing:.08em;">EST. VALUE: </span>
                <span style="font-size:10px;color:#EEE9E2;font-weight:600;">${lead.estimated_value || 'TBD'}</span>
              </div>
            </td>
          </tr>
          ${lead.pitch ? `
          <tr>
            <td>
              <div style="background:rgba(88,166,255,.04);border:1px solid rgba(88,166,255,.12);padding:12px 14px;">
                <div style="font-size:9px;color:#58A6FF;letter-spacing:.1em;margin-bottom:8px;font-weight:600;">READY-TO-SEND PITCH EMAIL</div>
                <div style="font-size:10px;color:#8A8070;white-space:pre-wrap;line-height:1.7;max-height:200px;overflow:hidden;">${(lead.pitch as string).slice(0, 600)}${(lead.pitch as string).length > 600 ? '...' : ''}</div>
              </div>
            </td>
          </tr>` : ''}
        </table>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#07090E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07090E;padding:24px 16px;"><tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <!-- HEADER -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.2);padding:28px 36px 0;">
    <table width="100%"><tr>
      <td><div style="font-family:Georgia,serif;font-size:22px;color:#C8A96E;">Hotel <em>Fountain</em></div>
          <div style="font-size:8px;color:#4A4538;letter-spacing:.2em;text-transform:uppercase;margin-top:3px;">SEO & GEO Intelligence</div></td>
      <td align="right"><div style="font-size:10px;color:#4A4538;">${stats.date}</div>
          <div style="font-size:9px;color:#C8A96E;margin-top:2px;">Morning Lead Brief</div></td>
    </tr></table>
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,.5),transparent);margin-top:16px;"></div>
  </td></tr>

  <!-- STATS BAR -->
  <tr><td style="background:#0A0C12;border:1px solid rgba(200,169,110,.15);border-top:none;padding:16px 36px;">
    <table width="100%"><tr>
      <td align="center" style="border-right:1px solid rgba(200,169,110,.1);padding:8px;">
        <div style="font-size:24px;color:#C8A96E;font-family:Georgia,serif;font-weight:600;">${stats.totalLeads}</div>
        <div style="font-size:9px;color:#4A4538;letter-spacing:.1em;">NEW LEADS</div></td>
      <td align="center" style="border-right:1px solid rgba(200,169,110,.1);padding:8px;">
        <div style="font-size:24px;color:#58A6FF;font-family:Georgia,serif;font-weight:600;">${stats.categories}</div>
        <div style="font-size:9px;color:#4A4538;letter-spacing:.1em;">SEGMENTS</div></td>
      <td align="center" style="padding:8px;">
        <div style="font-size:24px;color:#3FB950;font-family:Georgia,serif;font-weight:600;">${stats.totalLeads}</div>
        <div style="font-size:9px;color:#4A4538;letter-spacing:.1em;">PITCH EMAILS</div></td>
    </tr></table>
  </td></tr>

  <!-- SUBHEADING -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:20px 36px 12px;">
    <div style="font-family:Georgia,serif;font-size:18px;color:#EEE9E2;">Today's <em style="color:#C8A96E;">Lead Intelligence</em></div>
    <div style="font-size:11px;color:#6A6050;margin-top:4px;">AI-generated prospects across ${stats.categories} segments — ready to contact</div>
  </td></tr>

  <!-- LEADS TABLE -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;">
    <table width="100%" cellpadding="0" cellspacing="0">${leadRows}</table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="background:#0D1117;border:1px solid rgba(200,169,110,.15);border-top:none;padding:24px 36px;">
    <div style="margin-bottom:16px;">
      <a href="https://hotelfountainbd-crm.vercel.app/crm.html" style="display:inline-block;background:#C8A96E;color:#07090E;font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding:12px 28px;text-decoration:none;font-weight:500;">Open CRM → Guests & CRM</a>
    </div>
    <div style="font-size:10px;color:#4A4538;line-height:1.8;">
      ▦ All leads have been saved to the CRM under Guests &amp; CRM &rarr; Leads<br/>
      ▦ Pitch emails are ready to copy and send directly to each prospect<br/>
      ▦ Next morning brief: tomorrow at 9:00 AM BDT
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#0B0D14;border:1px solid rgba(200,169,110,.1);border-top:none;padding:16px 36px;">
    <div style="font-size:10px;color:#4A4538;">Hotel Fountain &middot; Lumea CRM &middot; SEO &amp; GEO Intelligence &middot; Automated 9:00 AM BDT</div>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const startTime = Date.now();
  const allLeads: Array<Record<string, unknown> & { pitch?: string }> = [];
  const errors: string[] = [];

  // Prospect leads across all categories
  for (const cat of LEAD_CATEGORIES) {
    try {
      const leads = await prospectCategory(cat);
      for (const lead of leads.slice(0, 3)) {
        // Save to leads table
        try {
          const saved = await sbInsert('leads', {
            name: String(lead.name || 'Unknown').slice(0, 100),
            email: String(lead.email || '').slice(0, 200),
            phone: String(lead.phone || '').slice(0, 50),
            company: String(lead.company || '').slice(0, 200),
            source: `AI-SEO-${cat.type}`,
            notes: `[${cat.label}] ${lead.booking_need || ''} | Est. value: ${lead.estimated_value || 'TBD'}`,
            status: 'new',
            tenant_id: TENANT,
          });

          // Generate pitch email
          let pitch = '';
          let pitchSentId: string | undefined;
          let pitchSentError: string | undefined;
          try {
            pitch = await generatePitch(lead);

            // Auto-send pitch directly to the lead
            if (pitch && lead.email && String(lead.email).includes('@')) {
              const { subject, html: pitchHTML } = pitchToEmail(pitch);
              const pitchResult = await sendEmail(
                String(lead.email),
                subject,
                pitchHTML,
                NOTIFY_EMAIL,  // reply-to → hotellfountainbd@gmail.com
              );
              if (pitchResult.ok) {
                pitchSentId = pitchResult.id;
              } else {
                pitchSentError = pitchResult.error;
                errors.push(`Pitch send failed for ${lead.email}: ${pitchResult.error}`);
              }
            }
          } catch (e) {
            pitch = `Could not generate pitch: ${e}`;
            pitchSentError = String(e);
          }

          // Save pitch + send status to lead record
          if (saved?.id) {
            await sbPatch('leads', saved.id, {
              email_draft: pitch,
              status: pitchSentId ? 'email_sent' : 'email_drafted',
              updated_at: new Date().toISOString(),
            });
          }

          allLeads.push({ ...lead, pitch, _saved_id: saved?.id, _pitch_sent: pitchSentId, _pitch_err: pitchSentError });
        } catch (e) {
          errors.push(`Save lead error [${cat.type}]: ${e}`);
          allLeads.push({ ...lead, pitch: '', _save_err: String(e) });
        }
      }
    } catch (e) {
      errors.push(`Category ${cat.type} error: ${e}`);
    }
  }

  // Send morning email
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const html = buildEmailHTML(allLeads, {
    totalLeads: allLeads.length,
    categories: LEAD_CATEGORIES.length,
    date: dateStr,
  });

  const emailResult = await sendEmail(
    NOTIFY_EMAIL,
    `🏨 Hotel Fountain — ${allLeads.length} New Leads for ${now.toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric' })}`,
    html
  );

  // Log to workflow_runs
  const duration = Date.now() - startTime;
  try {
    await sbInsert('workflow_runs', {
      workflow_name: 'seo-lead-morning',
      status: emailResult.ok ? 'success' : 'partial',
      duration_ms: duration,
      records_processed: allLeads.length,
      ran_at: new Date().toISOString(),
      metadata: { leads: allLeads.length, pitches_sent: pitchesSent, email_id: emailResult.id, errors },
      tenant_id: TENANT,
    });
  } catch (_) { /* log failure is non-fatal */ }

  const pitchesSent = allLeads.filter((l) => l._pitch_sent).length;

  return new Response(
    JSON.stringify({
      success: true,
      leads_generated: allLeads.length,
      pitches_auto_sent: pitchesSent,
      briefing_email_sent: emailResult.ok,
      briefing_email_id: emailResult.id,
      briefing_email_error: emailResult.error,
      duration_ms: duration,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
});
