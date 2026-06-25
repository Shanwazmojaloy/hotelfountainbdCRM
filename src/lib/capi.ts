// src/lib/capi.ts
// Meta Conversions API (Graph v25.0) — server-side event sender for fountainbd.com.
//
// Design invariants:
//   • FAIL-SOFT. A CAPI failure must NEVER throw into a booking or payment path.
//     Every entry point returns {ok,error}; callers ignore the result.
//   • RESERVATION-CENTRIC. external_id and the browser↔server dedup key both derive
//     from reservation_id (UUID), per the project's reservation-centric architecture.
//   • Browser Pixel + this server module send the SAME event_id within 48h so Meta
//     counts each conversion exactly once (the ৳13,600-class "double-count" guard,
//     applied to ad attribution).
//
// Env (server-only): META_CAPI_TOKEN (system-user token), META_PIXEL_ID (= dataset id;
// falls back to NEXT_PUBLIC_FB_PIXEL_ID), META_CAPI_TEST_CODE (set ONLY while validating
// in Events Manager → Test Events; unset for production traffic).
import crypto from 'crypto';

const API_VERSION = 'v25.0';
const PIXEL_ID = (process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_FB_PIXEL_ID || '').trim();
const ACCESS_TOKEN = (process.env.META_CAPI_TOKEN || '').trim();
const TEST_EVENT_CODE = (process.env.META_CAPI_TEST_CODE || '').trim();

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

// Meta PII normalization: trim → lowercase → sha256. Empty becomes undefined (omitted).
function hashLower(v?: string | null): string | undefined {
  const s = (v || '').trim().toLowerCase();
  return s ? sha256(s) : undefined;
}

// Phone → E.164 digits (no '+'), forced to Bangladesh 880, then sha256.
//   01XXXXXXXXX → 8801XXXXXXXXX ; +880 1XXX → 8801XXX ; 00880… → 880…
function hashPhoneBD(v?: string | null): string | undefined {
  let d = (v || '').replace(/\D/g, '');
  if (!d) return undefined;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('880')) {
    /* already country-coded */
  } else if (d.startsWith('0')) {
    d = '880' + d.slice(1);
  } else if (d.length === 10 && d.startsWith('1')) {
    d = '880' + d;
  }
  return sha256(d);
}

export type CapiUser = {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null; // reservation_id (raw; hashed here)
  fbp?: string | null;        // _fbp cookie — NOT hashed
  fbc?: string | null;        // _fbc cookie — NOT hashed
  ip?: string | null;
  userAgent?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;    // ISO-2 lowercase, e.g. 'bd'
};

export type CapiEvent = {
  eventName: 'Lead' | 'Purchase' | 'InitiateCheckout' | 'ViewContent' | 'Schedule';
  eventId: string;            // shared with the browser Pixel for dedup
  eventTime?: number;         // unix seconds; defaults to now
  actionSource?: 'website' | 'system_generated';
  eventSourceUrl?: string;
  value?: number;
  currency?: string;          // 'BDT'
  contentIds?: string[];
  contentName?: string;
  user: CapiUser;
};

function buildUserData(u: CapiUser): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  const em = hashLower(u.email); if (em) ud.em = [em];
  const ph = hashPhoneBD(u.phone); if (ph) ud.ph = [ph];
  const ext = u.externalId ? sha256(String(u.externalId).trim().toLowerCase()) : undefined;
  if (ext) ud.external_id = [ext];
  const ct = hashLower(u.city); if (ct) ud.ct = [ct];
  const st = hashLower(u.state); if (st) ud.st = [st];
  const zp = hashLower(u.zip); if (zp) ud.zp = [zp];
  const cn = hashLower(u.country); if (cn) ud.country = [cn];
  if (u.fbp) ud.fbp = u.fbp;
  if (u.fbc) ud.fbc = u.fbc;
  if (u.ip) ud.client_ip_address = u.ip;
  if (u.userAgent) ud.client_user_agent = u.userAgent;
  return ud;
}

export async function sendCapiEvent(ev: CapiEvent): Promise<{ ok: boolean; error?: string }> {
  if (!PIXEL_ID || !ACCESS_TOKEN) return { ok: false, error: 'capi_not_configured' };

  const custom: Record<string, unknown> = {};
  if (ev.value != null) custom.value = Number(ev.value.toFixed(2));
  if (ev.currency) custom.currency = ev.currency;
  if (ev.contentIds) { custom.content_ids = ev.contentIds; custom.content_type = 'hotel_room'; }
  if (ev.contentName) custom.content_name = ev.contentName;

  const body: Record<string, unknown> = {
    data: [{
      event_name: ev.eventName,
      event_time: ev.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: ev.eventId,
      action_source: ev.actionSource ?? 'website',
      ...(ev.eventSourceUrl ? { event_source_url: ev.eventSourceUrl } : {}),
      user_data: buildUserData(ev.user),
      custom_data: custom,
    }],
  };
  if (TEST_EVENT_CODE) body.test_event_code = TEST_EVENT_CODE;

  try {
    const r = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!r.ok) {
      console.error('[capi] send failed', r.status, (await r.text()).slice(0, 300));
      return { ok: false, error: `http_${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[capi] send threw', e);
    return { ok: false, error: 'exception' };
  }
}

// Pull _fbp / _fbc from a raw Cookie header (server-side fallback when the client
// didn't forward them explicitly).
export function fbCookiesFrom(cookieHeader?: string | null): { fbp?: string; fbc?: string } {
  const out: { fbp?: string; fbc?: string } = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === '_fbp') out.fbp = decodeURIComponent(v);
    if (k === '_fbc') out.fbc = decodeURIComponent(v);
  }
  return out;
}
