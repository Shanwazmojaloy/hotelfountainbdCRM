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
const GEMINI_MODEL = 'gemini-2.5-flash';
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function sbGet(table: string, q = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${q}`, { headers: H });
  const d = await r.json(); return Array.isArray(d) ? d : [];
}
async function sbPost(table: string, body: object) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  return r.json();
}
async function sbPatch(table: string, id: string, body: object) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
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

async function gemini(prompt: string, max = 800): Promise<string> {
  if (!GEMINI_KEY) return 'ERROR: GEMINI_API_KEY not set';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: max, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } } }) });
    if (!r.ok) { const e = await r.text(); return `ERROR: ${r.status}: ${e.slice(0,200)}`; }
    const d = await r.json();
    return geminiText(d) || 'ERROR: Empty';
  } catch (e: any) { return `ERROR: ${e.message}`; }
}

// AGENT 1: THE RECRUITER
async function agentRecruiter(action: string, partnerId?: string) {

  if (action === 'scan') {
    // Generate travel-agency RESEARCH leads (names only) for BD cities.
    // IMPORTANT: do NOT fabricate emails/phones. Invented contacts bounce
    // (see the 2026-06-18 bounce sweep: saudiabd.com / umrahexpress.bd etc.
    // were hallucinated domains). Leads are saved with NO contact channels and
    // status 'unverified' — a quarantine that every outreach path skips
    // (outreach-bot needs 'pending'; portal/billing need active/vip). A human
    // must add a verified email/phone and promote the lead before any outreach.
    const prompt = `List 5 real, well-known travel agencies in Bangladesh (mix of Dhaka, Chittagong, Sylhet) that a hotel could plausibly partner with for corporate or Umrah travel. Only include agencies you are confident genuinely exist.
Return ONLY a JSON array starting with [:
[{"agency_name":"Agency Name","city":"Dhaka","notes":"what they specialise in"},...]
Do NOT invent email addresses or phone numbers — omit them entirely. Return only JSON.`;
    const raw = await gemini(prompt, 600);
    let agencies: any[] = [];
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      const m = clean.match(/\[[\s\S]*\]/);
      if (m) agencies = JSON.parse(m[0]);
    } catch { return { error: 'Parse failed', raw: raw.slice(0, 200) }; }

    const saved: any[] = [];
    for (const a of agencies.slice(0, 5)) {
      try {
        const existing = await sbGet('b2b_partners', `?agency_name=eq.${encodeURIComponent(a.agency_name)}&tenant_id=eq.${TENANT}`);
        if (existing.length > 0) { saved.push({ ...a, status: 'already_exists' }); continue; }
        // Quarantine: no fabricated contact channels; 'unverified' is skipped by all outreach.
        const s = await sbPost('b2b_partners', {
          agency_name: a.agency_name,
          contact_name: null,
          email: null,
          phone: null,
          city: a.city ?? null,
          notes: `[UNVERIFIED auto-lead — verify a real contact before any outreach] ${a.notes ?? ''}`.trim(),
          status: 'unverified',
          tenant_id: TENANT,
        });
        saved.push(Array.isArray(s) ? s[0] : s);
      } catch (e: any) { saved.push({ ...a, _err: e.message }); }
    }
    return { agent: 'Recruiter', action: 'scan', agencies_found: saved.length, note: 'saved as unverified with no contact channels — human verification required before outreach', agencies: saved };
  }

  if (action === 'invite' && partnerId) {
    const partners = await sbGet('b2b_partners', `?id=eq.${partnerId}&select=*`);
    if (!partners.length) return { error: 'Partner not found' };
    const p = partners[0];

    const prompt = `Write a WhatsApp invite message for a travel agency to join Hotel Fountain's B2B partner program.
Agency: ${p.agency_name}, Contact: ${p.contact_name || 'Manager'}, City: ${p.city}
Hotel Fountain, Dhaka (Nikunja 2) offers:
- Wholesale net rate: ৳${p.wholesale_rate || 2800}/night for Umrah & corporate groups
- ${p.commission_pct || 10}% commission on all bookings  
- Instant online booking portal with room availability
- Dedicated B2B support
Write a friendly, professional WhatsApp message (3-4 sentences max). Use their agency name. End with a portal link placeholder: [PORTAL_LINK].`;

    const message = await gemini(prompt, 300);
    const portalLink = `https://hotelfountainbd-crm.vercel.app/b2b?key=${p.secret_key}`;
    const finalMessage = message.replace('[PORTAL_LINK]', portalLink);

    await sbPost('b2b_outreach_log', { partner_id: p.id, agency_name: p.agency_name, channel: 'whatsapp', message_type: 'invite', message_preview: finalMessage.slice(0, 500), tenant_id: TENANT });
    await sbPatch('b2b_partners', p.id, { whatsapp_sent: true, updated_at: new Date().toISOString() });

    return { agent: 'Recruiter', action: 'invite', partner: p.agency_name, whatsapp_message: finalMessage, portal_link: portalLink };
  }

  if (action === 'joining_letter' && partnerId) {
    const partners = await sbGet('b2b_partners', `?id=eq.${partnerId}&select=*`);
    if (!partners.length) return { error: 'Partner not found' };
    const p = partners[0];

    const prompt = `Write a formal B2B Partnership Joining Letter for a travel agency.
To: ${p.agency_name}, Attn: ${p.contact_name || 'The Manager'}, ${p.city}
From: Hotel Fountain, Nikunja 2, Dhaka
Date: ${new Date().toLocaleDateString('en-BD')}

Include:
1. Welcome as official B2B partner
2. Net wholesale rate: ৳${p.wholesale_rate || 2800}/room/night
3. Commission: ${p.commission_pct || 10}% on confirmed bookings, paid weekly
4. Their unique Partner Portal access (secret key: ${p.secret_key})
5. Booking process: login -> select room -> confirm -> auto-notification to front desk
6. Contact: reservations@hotelfountain.com

Write a formal business letter. Professional tone.`;

    const letter = await gemini(prompt, 700);
    await sbPost('b2b_outreach_log', { partner_id: p.id, agency_name: p.agency_name, channel: 'email', message_type: 'joining_letter', message_preview: letter.slice(0, 500), tenant_id: TENANT });
    await sbPatch('b2b_partners', p.id, { joining_letter_sent: true, status: 'active', joined_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    return { agent: 'Recruiter', action: 'joining_letter', partner: p.agency_name, letter };
  }

  return { error: `Unknown action: ${action}` };
}

// AGENT 2: THE PORTAL BUTLER
async function agentPortalButler(action: string, data: any) {

  if (action === 'authenticate') {
    const { secret_key } = data;
    if (!secret_key) return { authenticated: false, error: 'No key provided' };
    const partners = await sbGet('b2b_partners', `?secret_key=eq.${secret_key}&status=in.(active,vip)&tenant_id=eq.${TENANT}&select=id,agency_name,contact_name,wholesale_rate,commission_pct,status,total_bookings,total_revenue`);
    if (!partners.length) return { authenticated: false, error: 'Invalid key or inactive partner' };
    return { authenticated: true, partner: partners[0] };
  }

  if (action === 'book') {
    const { secret_key, room_number, guest_name, guest_phone, check_in, check_out } = data;
    const authResult = await agentPortalButler('authenticate', { secret_key });
    if (!authResult.authenticated) return authResult;
    const p = (authResult as any).partner;

    const booking = await sbPost('b2b_bookings', { partner_id: p.id, partner_name: p.agency_name, room_number, guest_name, guest_phone, check_in, check_out, rate_per_night: p.wholesale_rate, commission_pct: p.commission_pct, tenant_id: TENANT });
    const b = Array.isArray(booking) ? booking[0] : booking;

    await sbPatch('b2b_partners', p.id, { last_booking_at: new Date().toISOString(), total_bookings: (p.total_bookings || 0) + 1, updated_at: new Date().toISOString() });

    return { agent: 'PortalButler', action: 'book', booking: b, message: `Booking confirmed! Ref: ${b.booking_reference}. Room ${room_number} for ${guest_name}, ${check_in} -> ${check_out}. Rate: ৳${p.wholesale_rate}/night.` };
  }

  if (action === 'answer') {
    const { question, secret_key } = data;
    const authResult = await agentPortalButler('authenticate', { secret_key });
    if (!authResult.authenticated) return authResult;

    const prompt = `You are the AI assistant for Hotel Fountain, Nikunja 2, Dhaka, Bangladesh. Answer this question from a B2B travel agent partner:
"${question}"

Hotel facts:
- 28 rooms across 5 floors (301-510)
- Room types: Fountain Deluxe (৳4000), Superior Deluxe (৳5000), Royal Suite (৳9000), Twin Deluxe (৳6000), Premium Deluxe (৳4500)
- Beds: Double or Twin options available
- All rooms: AC, TV, WiFi, attached bathroom, hot water
- Balcony: Royal Suite (303) only
- Restaurant: Ground floor, serves BD/Chinese/Continental, 7am-11pm
- Conference room: 1st floor, capacity 30 people
- 24/7 front desk, CCTV, secure parking
- Standard check-in: 12:01 PM, check-out: 11:59 AM
- B2B wholesale rate: ৳2800/night for partner bookings

Answer concisely and helpfully.`;

    const answer = await gemini(prompt, 400);
    return { agent: 'PortalButler', action: 'answer', question, answer };
  }

  if (action === 'availability') {
    const { check_in, check_out, secret_key } = data;
    const authResult = await agentPortalButler('authenticate', { secret_key });
    if (!authResult.authenticated) return authResult;

    const rooms = await sbGet('rooms', `?tenant_id=eq.${TENANT}&select=room_number,category,status,price,floor,beds`);
    const conflicts = await sbGet('b2b_bookings', `?tenant_id=eq.${TENANT}&check_in=lt.${check_out}&check_out=gt.${check_in}&status=in.(confirmed,checked_in)&select=room_number`);
    const conflictRooms = new Set(conflicts.map((c: any) => c.room_number));
    const mainRes = await sbGet('reservations', `?tenant_id=eq.${TENANT}&check_in=lt.${check_out}&check_out=gt.${check_in}&status=in.(CHECKED_IN,RESERVED)&select=room_ids`);
    mainRes.forEach((r: any) => (r.room_ids || []).forEach((rn: string) => conflictRooms.add(rn)));

    const available = rooms.filter((r: any) => r.status === 'AVAILABLE' && !conflictRooms.has(r.room_number));
    const p = (authResult as any).partner;

    return { agent: 'PortalButler', action: 'availability', check_in, check_out, available_rooms: available.length, rooms: available.map((r: any) => ({ room_number: r.room_number, category: r.category, beds: r.beds, floor: r.floor, partner_rate: p.wholesale_rate, rack_rate: r.price })) };
  }

  return { error: `Unknown action: ${action}` };
}

// AGENT 3: THE BILLING ANALYST
async function agentBillingAnalyst(action: string, partnerId?: string) {

  if (action === 'weekly_run') {
    const partners = await sbGet('b2b_partners', `?tenant_id=eq.${TENANT}&status=in.(active,vip)&select=*`);
    const results: any[] = [];
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const periodStart = weekAgo.toISOString().slice(0, 10);
    const periodEnd = today.toISOString().slice(0, 10);

    for (const p of partners) {
      const bookings = await sbGet('b2b_bookings', `?partner_id=eq.${p.id}&created_at=gte.${weekAgo.toISOString()}&status=neq.cancelled&select=*`);
      const totalRev = bookings.reduce((a: number, b: any) => a + (+b.total_amount || 0), 0);
      const totalComm = bookings.reduce((a: number, b: any) => a + (+b.commission_amount || 0), 0);
      const lastBook14 = new Date(p.last_booking_at || 0);
      const daysSince = Math.floor((today.getTime() - lastBook14.getTime()) / 86400000);

      if (bookings.length > 0) {
        const prompt = `Write a brief commission statement email for a travel agency B2B partner.
To: ${p.agency_name} (${p.contact_name || 'Manager'})
Period: ${periodStart} to ${periodEnd}
Bookings: ${bookings.length}
Total room revenue: ৳${totalRev.toLocaleString()}
Your commission (${p.commission_pct}%): ৳${totalComm.toLocaleString()}
Payment will be processed within 3 business days.
Sign off from Hotel Fountain Accounts Team. Keep it professional and brief (3 sentences max).`;
        const statement = await gemini(prompt, 300);

        await sbPost('b2b_invoices', { partner_id: p.id, partner_name: p.agency_name, period_start: periodStart, period_end: periodEnd, total_bookings: bookings.length, total_revenue: totalRev, commission_amount: totalComm, status: 'sent', sent_at: new Date().toISOString(), tenant_id: TENANT });
        await sbPost('b2b_outreach_log', { partner_id: p.id, agency_name: p.agency_name, channel: 'email', message_type: 'commission_statement', message_preview: statement.slice(0, 500), tenant_id: TENANT });

        if ((p.total_bookings || 0) + bookings.length >= 10 && p.status !== 'vip') {
          await sbPatch('b2b_partners', p.id, { status: 'vip', updated_at: new Date().toISOString() });
        }

        results.push({ partner: p.agency_name, action: 'commission_sent', bookings: bookings.length, commission: totalComm, statement });
      } else if (daysSince >= 14) {
        const prompt = `Write a brief re-engagement message for a travel agency B2B partner who hasn't booked in ${daysSince} days.
To: ${p.agency_name}, Contact: ${p.contact_name || 'Manager'}
Offer: ৳200 discount on their next corporate guest booking (valid 7 days)
From Hotel Fountain, Dhaka
Keep it friendly, 2-3 sentences. Mention the discount code: RE-${p.id.slice(0,6).toUpperCase()}.`;
        const reengagement = await gemini(prompt, 200);

        await sbPost('b2b_outreach_log', { partner_id: p.id, agency_name: p.agency_name, channel: 'whatsapp', message_type: 'reengagement', message_preview: reengagement.slice(0, 500), tenant_id: TENANT });
        results.push({ partner: p.agency_name, action: 're-engagement_sent', days_inactive: daysSince, message: reengagement });
      } else {
        results.push({ partner: p.agency_name, action: 'no_action_needed', bookings: 0, days_since_booking: daysSince });
      }
    }

    return { agent: 'BillingAnalyst', action: 'weekly_run', partners_processed: partners.length, results };
  }

  if (action === 'get_dashboard') {
    const partners = await sbGet('b2b_partners', `?tenant_id=eq.${TENANT}&select=*&order=total_revenue.desc`);
    const bookings = await sbGet('b2b_bookings', `?tenant_id=eq.${TENANT}&select=*&order=created_at.desc&limit=20`);
    const invoices = await sbGet('b2b_invoices', `?tenant_id=eq.${TENANT}&select=*&order=created_at.desc&limit=10`);
    const totalRevenue = partners.reduce((a: number, p: any) => a + (+p.total_revenue || 0), 0);
    const activePartners = partners.filter((p: any) => p.status === 'active' || p.status === 'vip').length;
    const vipPartners = partners.filter((p: any) => p.status === 'vip').length;
    return { agent: 'BillingAnalyst', action: 'dashboard', summary: { total_partners: partners.length, active_partners: activePartners, vip_partners: vipPartners, total_revenue: totalRevenue }, partners, recent_bookings: bookings, recent_invoices: invoices };
  }

  if (action === 'partner_statement' && partnerId) {
    const partners = await sbGet('b2b_partners', `?id=eq.${partnerId}&select=*`);
    if (!partners.length) return { error: 'Partner not found' };
    const p = partners[0];
    const bookings = await sbGet('b2b_bookings', `?partner_id=eq.${partnerId}&select=*&order=created_at.desc&limit=50`);
    const totalComm = bookings.reduce((a: number, b: any) => a + (+b.commission_amount || 0), 0);
    return { agent: 'BillingAnalyst', partner: p, bookings, total_commission_owed: totalComm };
  }

  return { error: `Unknown action: ${action}` };
}

// Main Router
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get('check') === '1') {
    return new Response(JSON.stringify({ status: 'ok', version: 2, agents: ['recruiter', 'portal_butler', 'billing_analyst'] }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  let result: any = {};
  try {
    const body = await req.json().catch(() => ({}));
    const { agent, action, partner_id, ...data } = body;

    if (agent === 'recruiter') result = await agentRecruiter(action || 'scan', partner_id);
    else if (agent === 'portal_butler') result = await agentPortalButler(action || 'availability', { ...data, partner_id });
    else if (agent === 'billing_analyst') result = await agentBillingAnalyst(action || 'get_dashboard', partner_id);
    else result = { status: 'ok', version: 2, agents: ['recruiter', 'portal_butler', 'billing_analyst'] };
  } catch (e: any) {
    result = { error: e.message };
  }

  return new Response(JSON.stringify(result, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
