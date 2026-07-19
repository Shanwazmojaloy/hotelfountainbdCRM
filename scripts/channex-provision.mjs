// [Hotel-CRM] Channex provisioning - creates property + 6 room types +
// BAR rate plans + webhook, prints the channel_accounts config JSON.
// Same code that built staging (2026-07-12), parameterized for prod cutover.
//
// Usage:
//   node scripts/channex-provision.mjs staging
//   node scripts/channex-provision.mjs production
// Reads CHANNEX_API_KEY + CHANNEL_WEBHOOK_SECRET from .env.local.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const MODE = process.argv[2] === 'production' ? 'production' : 'staging';
const BASE = MODE === 'production'
  ? 'https://app.channex.io/api/v1'
  : 'https://staging.channex.io/api/v1';

const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const KEY = get('CHANNEX_API_KEY');
const SECRET = get('CHANNEL_WEBHOOK_SECRET');
if (!KEY || !SECRET) { console.error('Missing CHANNEX_API_KEY or CHANNEL_WEBHOOK_SECRET in .env.local'); process.exit(1); }
if (MODE === 'production') {
  console.log('NOTE: production needs the PROD account api key in CHANNEX_API_KEY (staging keys do not work).');
}

const H = { 'user-api-key': KEY, 'content-type': 'application/json' };
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status >= 300) { console.error('FAIL', method, path, r.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
  return j;
};

// 1) property
const prop = await api('POST', '/properties', { property: {
  title: 'Hotel Fountain BD', currency: 'BDT', country: 'BD', city: 'Dhaka',
  address: 'Panthapath, Dhaka', timezone: 'Asia/Dhaka', property_type: 'hotel',
  email: 'shanwazahmed@fountainbd.com',
}});
const pid = prop.data.id;
console.log('property_id:', pid);

// 2) room types + BAR rate plans (rate seeds; real rates pushed by drain)
const cats = [
  ['Fountain Deluxe', 11, 6500], ['Premium Deluxe', 10, 5500], ['Twin Deluxe', 5, 5000],
  ['Royal Suite', 1, 9000], ['Superior Deluxe', 1, 7000], ['Single Deluxe', 1, 3500],
];
const mappings = [];
for (const [title, count, rate] of cats) {
  const rt = await api('POST', '/room_types', { room_type: {
    property_id: pid, title, count_of_rooms: count,
    occ_adults: 2, occ_children: 1, occ_infants: 0, default_occupancy: 2, rm_kind: 'room',
  }});
  const rp = await api('POST', '/rate_plans', { rate_plan: {
    property_id: pid, room_type_id: rt.data.id, title: `${title} BAR`, currency: 'BDT',
    sell_mode: 'per_room', rate_mode: 'manual',
    options: [{ occupancy: 2, is_primary: true, rate: rate * 100 }],
  }});
  mappings.push({ category: title, cm_room_id: rt.data.id, cm_rate_plan_id: rp.data.id });
}

// 3) webhook (event_mask MUST include plain 'booking' - CRS/OTA bookings emit it)
const wh = await api('POST', '/webhooks', { webhook: {
  property_id: pid,
  callback_url: 'https://fountainbd.com/api/channel/webhook/channex',
  event_mask: 'booking;booking_new;booking_modification;booking_cancellation',
  headers: { 'x-channel-signature': SECRET },
  request_params: {}, is_active: true, send_data: true,
}});
console.log('webhook_id:', wh.data.id);

// 4) config for the channel_accounts row
console.log('\n--- channel_accounts.config (paste into SQL UPDATE) ---');
console.log(JSON.stringify({ hotel_id: pid, api_base: BASE, mappings }, null, 2));
