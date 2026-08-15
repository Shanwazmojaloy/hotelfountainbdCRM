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

// Upsell catalog — all available offers with prices
const UPSELL_CATALOG: Record<string, { title: string; price: number; stage: string; description: string }> = {
  airport_pickup:  { title: 'Airport Pickup',          price: 500,  stage: 'pre_arrival_24h', description: 'Private car from any Dhaka airport to hotel' },
  early_checkin:   { title: 'Early Check-in (9AM-12PM)',price: 1000, stage: 'pre_arrival_24h', description: 'Guaranteed room access from 9:00 AM' },
  jet_lag_menu:    { title: "Chef Samim's Jet Lag Menu", price: 850,  stage: 'pre_arrival_4h',  description: 'Light recovery meal waiting in room on arrival' },
  room_upgrade:    { title: 'Royal Suite Upgrade',      price: 4000, stage: 'pre_arrival_4h',  description: 'Upgrade to Royal Suite (Room 303) — balcony, premium amenities' },
  sim_card:        { title: 'Welcome SIM Pack',          price: 800,  stage: 'pre_arrival_4h',  description: 'Local SIM with 10GB data waiting in room' },
  late_checkout:   { title: 'Late Check-out (till 6PM)', price: 1500, stage: 'day_of',          description: 'Keep your room until 6:00 PM' },
};

async function sbGet(table: string, q = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${q}`, { headers: H });
  const d = await r.json(); return Array.isArray(d) ? d : [];
}
async function sbPost(table: string, body: object) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body)
  }); return r.json();
}
async function sbPatch(table: string, filter: string, body: object) {
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
}

async function gemini(prompt: string, max = 600): Promise<string> {
  if (!GEMINI_KEY) return 'GEMINI_API_KEY not set';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: max, temperature: 0.6 } }) });
    if (!r.ok) return `ERROR: ${r.status}`;
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch (e: any) { return `ERROR: ${e.message}`; }
}

// ════════════════════════════════════════════
// AGENT 1: PRE-ARRIVAL SPECIALIST
// Triggered 24h before check-in
// Generates personalised WhatsApp welcome + offers
// ════════════════════════════════════════════
async function agentPreArrival(reservationId?: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // Get reservations checking in tomorrow (or specific one)
  let reservations: any[];
  if (reservationId) {
    reservations = await sbGet('reservations', `?id=eq.${reservationId}&select=*`);
  } else {
    reservations = await sbGet('reservations', `?check_in=gte.${tomorrowStr}T00:00:00&check_in=lte.${tomorrowStr}T23:59:59&status=in.(RESERVED,PENDING)&tenant_id=eq.${TENANT}&select=*`);
  }

  if (!reservations.length) return { agent: 'PreArrival', message: 'No arrivals tomorrow', offers_sent: 0 };

  const results: any[] = [];
  for (const res of reservations) {
    // Get guest details
    const guestId = (res.guest_ids || [])[0];
    const guests = guestId ? await sbGet('guests', `?id=eq.${guestId}&select=name,phone,email,nationality`) : [];
    const guest = guests[0];
    const guestName = guest?.name || 'Valued Guest';
    const roomNo = (res.room_ids || [])[0] || '';
    const checkIn = res.check_in?.slice(0, 10) || tomorrowStr;

    // Check if offers already sent
    const existing = await sbGet('upsell_offers', `?reservation_id=eq.${res.id}&send_stage=eq.pre_arrival_24h`);
    if (existing.length > 0) { results.push({ guest: guestName, skipped: 'offers already sent' }); continue; }

    // Generate personalised WhatsApp message with airport pickup + early check-in offers
    const prompt = `Write a warm, professional WhatsApp message for a hotel guest arriving tomorrow.
Guest name: ${guestName}\nRoom: ${roomNo}\nCheck-in: ${checkIn}\nHotel: Hotel Fountain, Nikunja 2, Dhaka

Message must:
1. Welcome them warmly by first name
2. Confirm their reservation
3. Offer TWO services with clear prices:
   - Private Airport Pickup: ৳500 (reply YES PICKUP)
   - Early Check-in from 9 AM: ৳1,000 (reply YES EARLY)
4. End with: "Our team is excited to welcome you! — Hotel Fountain"

Keep under 5 sentences. Friendly but not pushy. Use actual guest name.`;

    const message = await gemini(prompt, 400);

    // Save both offer records
    const offersSaved: any[] = [];
    for (const offerKey of ['airport_pickup', 'early_checkin']) {
      const offer = UPSELL_CATALOG[offerKey];
      const saved = await sbPost('upsell_offers', {
        reservation_id: res.id, guest_name: guestName, room_number: roomNo,
        check_in: checkIn, offer_type: offerKey, offer_title: offer.title,
        offer_price: offer.price, offer_message: message,
        send_stage: 'pre_arrival_24h', status: 'sent', tenant_id: TENANT
      });
      offersSaved.push(Array.isArray(saved) ? saved[0] : saved);
    }

    results.push({
      guest: guestName, room: roomNo, check_in: checkIn,
      whatsapp_message: message, offers: offersSaved.length,
      phone: guest?.phone || 'no phone on file'
    });
  }

  return { agent: 'PreArrival', stage: '24h_before_checkin', processed: reservations.length, results };
}

// ════════════════════════════════════════════
// AGENT 2: ROOM CUSTOMIZER
// Triggered 4h before arrival
// Offers Jet Lag Menu + Room Upgrade + SIM pack
// ════════════════════════════════════════════
async function agentRoomCustomizer(reservationId?: string) {
  const today = new Date().toISOString().slice(0, 10);

  let reservations: any[];
  if (reservationId) {
    reservations = await sbGet('reservations', `?id=eq.${reservationId}&select=*`);
  } else {
    reservations = await sbGet('reservations', `?check_in=gte.${today}T00:00:00&check_in=lte.${today}T23:59:59&status=in.(RESERVED,PENDING)&tenant_id=eq.${TENANT}&select=*`);
  }

  if (!reservations.length) return { agent: 'RoomCustomizer', message: 'No arrivals today', offers_sent: 0 };

  const results: any[] = [];
  for (const res of reservations) {
    const guestId = (res.guest_ids || [])[0];
    const guests = guestId ? await sbGet('guests', `?id=eq.${guestId}&select=name,phone,nationality`) : [];
    const guest = guests[0];
    const guestName = guest?.name || 'Valued Guest';
    const roomNo = (res.room_ids || [])[0] || '';
    const isInternational = guest?.nationality && guest.nationality.toLowerCase() !== 'bangladeshi' && guest.nationality.toLowerCase() !== 'bd';

    const existing = await sbGet('upsell_offers', `?reservation_id=eq.${res.id}&send_stage=eq.pre_arrival_4h`);
    if (existing.length > 0) { results.push({ guest: guestName, skipped: 'offers already sent' }); continue; }

    // Determine expected arrival time (use check_in_time if set, else estimate noon)
    const arrivalTime = res.check_in_time ? new Date(res.check_in_time).toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' }) : '12:00 PM';

    const prompt = `Write a brief, enticing WhatsApp message for a hotel guest arriving today at ${arrivalTime}.
Guest: ${guestName}\nRoom: ${roomNo}${isInternational ? '\nNote: International traveler — likely jet-lagged' : ''}

Offer these services (choose most relevant 2 based on guest profile):
- Chef Samim's Jet Lag Recovery Meal: ৳850 (light grilled protein + fresh juice, ready in room on arrival) — reply YES MEAL${isInternational ? ' (RECOMMEND THIS)' : ''}
- Royal Suite Upgrade (Room 303, balcony view): ৳4,000 extra — reply YES UPGRADE
- Welcome SIM Pack (10GB local data): ৳800 — reply YES SIM${isInternational ? ' (RECOMMEND THIS)' : ''}

Write 3-4 sentences max. Mention the arrival time. Sound like a personal concierge, not an ad.`;

    const message = await gemini(prompt, 350);
    const offersToSend = isInternational ? ['jet_lag_menu', 'sim_card'] : ['jet_lag_menu', 'room_upgrade'];
    const saved: any[] = [];

    for (const offerKey of offersToSend) {
      const offer = UPSELL_CATALOG[offerKey];
      const s = await sbPost('upsell_offers', {
        reservation_id: res.id, guest_name: guestName, room_number: roomNo,
        check_in: res.check_in?.slice(0,10), offer_type: offerKey,
        offer_title: offer.title, offer_price: offer.price,
        offer_message: message, send_stage: 'pre_arrival_4h',
        status: 'sent', tenant_id: TENANT
      });
      saved.push(Array.isArray(s) ? s[0] : s);
    }

    results.push({
      guest: guestName, room: roomNo, arrival_time: arrivalTime,
      international: isInternational, whatsapp_message: message,
      offers_sent: offersToSend, phone: guest?.phone || 'no phone'
    });
  }

  return { agent: 'RoomCustomizer', stage: '4h_before_arrival', processed: reservations.length, results };
}

// ════════════════════════════════════════════
// AGENT 3: LOGISTICS COORDINATOR
// Post-acceptance: bills to folio + alerts front desk
// Called when guest replies YES to an offer
// ════════════════════════════════════════════
async function agentLogistics(offerId: string, guestReply?: string) {
  const offers = await sbGet('upsell_offers', `?id=eq.${offerId}&select=*`);
  if (!offers.length) return { error: 'Offer not found' };
  const offer = offers[0];

  // Parse guest intent from reply
  const reply = (guestReply || 'yes').toLowerCase();
  const accepted = reply.includes('yes') || reply.includes('ok') || reply.includes('sure') || reply === 'y';

  if (!accepted) {
    await sbPatch('upsell_offers', `id=eq.${offerId}`, { status: 'declined', responded_at: new Date().toISOString() });
    return { agent: 'Logistics', result: 'declined', offer_type: offer.offer_type };
  }

  // Mark accepted
  await sbPatch('upsell_offers', `id=eq.${offerId}`, { status: 'accepted', responded_at: new Date().toISOString() });

  // Determine assigned staff based on offer type
  const assignedTo = offer.offer_type === 'airport_pickup' ? 'Shovon' :
                     offer.offer_type === 'jet_lag_menu' ? 'Chef Samim' : 'Mamun';

  // 1. Add to guest folio
  let folioResult: any = null;
  if (offer.reservation_id) {
    try {
      const folioEntry = await sbPost('folios', {
        reservation_id: offer.reservation_id,
        room_number: offer.room_number,
        description: `[UPSELL] ${offer.offer_title}`,
        category: offer.offer_type === 'airport_pickup' ? 'Transport' :
                  offer.offer_type === 'jet_lag_menu' ? 'F&B' :
                  offer.offer_type === 'room_upgrade' ? 'Room Upgrade' : 'Service',
        amount: offer.offer_price,
        tenant_id: TENANT
      });
      folioResult = Array.isArray(folioEntry) ? folioEntry[0] : folioEntry;

      // Also log as transaction
      await sbPost('transactions', {
        type: `Upsell — ${offer.offer_title}`,
        amount: offer.offer_price,
        room_number: offer.room_number,
        guest_name: offer.guest_name,
        fiscal_day: new Date().toISOString().slice(0, 10),
        res_id: offer.reservation_id,
        tenant_id: TENANT
      });

      // Update offer with folio link
      if (folioResult?.id) {
        await sbPatch('upsell_offers', `id=eq.${offerId}`, { folio_id: folioResult.id, billed: true });
      }
    } catch (e: any) {
      console.error('Folio error:', e.message);
    }
  }

  // 2. Generate front desk alert message
  const alertPrompt = `Write a brief, urgent front desk notification (2 sentences max).
Situation: Guest ${offer.guest_name} in Room ${offer.room_number} (arriving ${offer.check_in}) just accepted: ${offer.offer_title} (৳${offer.offer_price}).
Assigned to: ${assignedTo}
Action needed: ${offer.offer_type === 'airport_pickup' ? 'Arrange driver and confirm pickup time with guest' :
  offer.offer_type === 'jet_lag_menu' ? 'Notify Chef Samim to prepare recovery meal for room delivery on arrival' :
  offer.offer_type === 'early_checkin' ? 'Ensure room is ready by 9:00 AM and key is prepared' :
  offer.offer_type === 'room_upgrade' ? 'Move booking to Room 303 (Royal Suite) and update CRM' :
  offer.offer_type === 'sim_card' ? 'Place SIM welcome pack in room before arrival' : 'Prepare service before guest arrival'}
Make it sound like a priority dispatch.`;

  const alertMessage = await gemini(alertPrompt, 200);

  // Save alert
  await sbPatch('upsell_offers', `id=eq.${offerId}`, {
    alert_sent: true,
    alert_message: alertMessage,
    assigned_to: assignedTo
  });

  // Log to notifications
  await sbPost('notifications_log', {
    workflow: 'upsell-logistics',
    recipient_email: 'fo.hotelfountain799@gmail.com',
    subject: `🔔 UPSELL ACCEPTED: ${offer.offer_title} — ${offer.guest_name} Room ${offer.room_number}`,
    body: alertMessage,
    status: 'sent',
    metadata: { offer_type: offer.offer_type, amount: offer.offer_price, assigned_to: assignedTo, guest: offer.guest_name, room: offer.room_number },
    tenant_id: TENANT
  });

  return {
    agent: 'Logistics',
    result: 'accepted_and_processed',
    offer_type: offer.offer_type,
    offer_title: offer.offer_title,
    amount: offer.offer_price,
    guest: offer.guest_name,
    room: offer.room_number,
    billed_to_folio: !!folioResult,
    assigned_to: assignedTo,
    front_desk_alert: alertMessage,
    message: `✓ ৳${offer.offer_price} added to ${offer.guest_name}'s folio. ${assignedTo} has been alerted.`
  };
}

// ════════════════════════════════════════════
// Dashboard: get all upsell activity
// ════════════════════════════════════════════
async function getDashboard() {
  const offers = await sbGet('upsell_offers', `?tenant_id=eq.${TENANT}&order=created_at.desc&limit=100&select=*`);
  const accepted = offers.filter((o: any) => o.status === 'accepted');
  const totalRevenue = accepted.reduce((a: number, o: any) => a + (+o.offer_price || 0), 0);
  const byType: Record<string, { sent: number; accepted: number; revenue: number }> = {};
  for (const o of offers) {
    if (!byType[o.offer_type]) byType[o.offer_type] = { sent: 0, accepted: 0, revenue: 0 };
    byType[o.offer_type].sent++;
    if (o.status === 'accepted') { byType[o.offer_type].accepted++; byType[o.offer_type].revenue += +o.offer_price || 0; }
  }
  return {
    agent: 'Dashboard',
    summary: { total_offers_sent: offers.length, total_accepted: accepted.length, total_upsell_revenue: totalRevenue, conversion_rate: offers.length > 0 ? Math.round(accepted.length / offers.length * 100) : 0 },
    by_type: byType,
    recent_offers: offers.slice(0, 20)
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  if (url.searchParams.get('check') === '1') {
    return new Response(JSON.stringify({ status: 'ok', version: 1, agents: ['pre_arrival', 'room_customizer', 'logistics', 'dashboard'] }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  let result: any = {};
  try {
    const { action, reservation_id, offer_id, guest_reply } = await req.json().catch(() => ({}));
    if (action === 'pre_arrival') result = await agentPreArrival(reservation_id);
    else if (action === 'room_customizer') result = await agentRoomCustomizer(reservation_id);
    else if (action === 'accept_offer') result = offer_id ? await agentLogistics(offer_id, guest_reply || 'yes') : { error: 'offer_id required' };
    else if (action === 'dashboard') result = await getDashboard();
    else result = { status: 'ok', version: 1, catalog: UPSELL_CATALOG };
  } catch (e: any) {
    result = { error: e.message };
  }

  return new Response(JSON.stringify(result, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
