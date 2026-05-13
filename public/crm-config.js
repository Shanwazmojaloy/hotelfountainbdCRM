// ─────────────────────────────────────────────────────────────────────────────
// CRM White-Label Config
// Update this file when deploying Lumea for a new hotel client.
// Loaded by crm.html before crm-bundle.js — sets window.CRM_CONFIG globally.
// ─────────────────────────────────────────────────────────────────────────────

window.CRM_CONFIG = {
  // ── Identity ──────────────────────────────────────────────────────────────
  tenantId:     '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8',
  hotelName:    'Hotel Fountain BD',
  hotelShort:   'Fountain',
  tagline:      'The Gilded Threshold · Luxury In Comfort',
  sbProjectRef: 'mynwfkgksqqwlqowlscj',   // shown in superadmin panel only

  // ── Location ──────────────────────────────────────────────────────────────
  city:         'Dhaka, Bangladesh',
  address:      'House 05, Road 02, Nikunja 02, Dhaka 1229, Bangladesh',
  location:     'Nikunja 2 · Airport Corridor · Dhaka',
  website:      'hotelfountainbd.vercel.app',

  // ── Contact ───────────────────────────────────────────────────────────────
  phone:        '+880 1322-840799',
  whatsapp:     '+8801322840799',          // digits only for wa.me link
  email:        'hotellfountainbd@gmail.com',

  // ── Finance ───────────────────────────────────────────────────────────────
  currency:     '৳',
  currencyCode: 'BDT',
  vatPct:       15,
  svcPct:       5,

  // ── Operations ────────────────────────────────────────────────────────────
  checkInTime:  '14:00',
  checkOutTime: '12:00',
  roomCount:    28,
  timezone:     'Asia/Dhaka',
};

// Update browser tab title immediately
document.title = 'Lumea — ' + window.CRM_CONFIG.hotelName + ' CRM';
