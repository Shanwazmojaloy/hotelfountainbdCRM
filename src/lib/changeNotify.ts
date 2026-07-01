// changeNotify.ts -- server-only. Emails the hotel admin a before/after diff whenever a
// reservation is edited (house rule 2026-07-01). Best-effort: never throws, never blocks the
// save (caller should `.catch(()=>{})`). Sends through the same Brevo transactional pipeline
// every other Lumea mail uses (sender = HOTEL_SENDER_EMAIL, the hotel Gmail address) so the
// notice lands in the owner's Gmail inbox. Never import client-side -- it reads BREVO_API_KEY.
//
// IMPORTANT: this file is intentionally ASCII-only on disk. The Cowork F: mount corrupts/empties
// files when multibyte UTF-8 is written. Runtime glyphs use String.fromCharCode (Taka, em-dash)
// and HTML entities in markup -- both pure ASCII bytes. Do NOT paste literal glyphs here.
type Actor = { id: number; name: string; role: string };
type ResLike = Record<string, unknown>;

const TAKA = String.fromCharCode(0x09F3); // Bangladeshi Taka sign
const DASH = String.fromCharCode(0x2014); // em-dash (empty-value placeholder)

const SENDER_NAME  = process.env.HOTEL_SENDER_NAME  || `Hotel Fountain BD ${DASH} Lumea`;
const SENDER_EMAIL = process.env.HOTEL_SENDER_EMAIL || 'hotellfountainbd@gmail.com';
const ADMIN_EMAIL  = process.env.ADMIN_NOTIFY_EMAIL || 'ahmedshanwaz5@gmail.com';

const bdt    = (n: unknown) => TAKA + Number(n || 0).toLocaleString('en-US');
const dstr   = (v: unknown) => (v ? String(v).slice(0, 10) : DASH);
const arrKey = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).map(String).sort().join(', ') : String(v ?? ''));
const esc    = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

// Fields we track for the audit diff + display formatter for each.
const FIELDS: Array<{ key: string; label: string; fmt: (v: unknown) => string }> = [
  { key: 'check_in',        label: 'Check-In',  fmt: dstr },
  { key: 'check_out',       label: 'Check-Out', fmt: dstr },
  { key: 'room_ids',        label: 'Rooms',     fmt: (v) => arrKey(v) || DASH },
  { key: 'status',          label: 'Status',    fmt: (v) => String(v ?? DASH) },
  { key: 'paid_amount',     label: 'Paid',      fmt: bdt },
  { key: 'discount_amount', label: 'Discount',  fmt: bdt },
  { key: 'notes',           label: 'Notes',     fmt: (v) => (v ? String(v) : DASH) },
  { key: 'guest_name',      label: 'Guest',     fmt: (v) => String(v ?? DASH) },
];

export function diffReservation(prev: ResLike, next: ResLike): Array<{ label: string; from: string; to: string }> {
  const changes: Array<{ label: string; from: string; to: string }> = [];
  for (const f of FIELDS) {
    const a = f.fmt(prev[f.key]);
    const b = f.fmt(next[f.key]);
    if (a !== b) changes.push({ label: f.label, from: a, to: b });
  }
  return changes;
}

export async function notifyReservationChange(opts: {
  prev: ResLike; next: ResLike; actor: Actor; resId: string;
}): Promise<void> {
  const BREVO_KEY = (process.env.BREVO_API_KEY || '').trim();
  if (!BREVO_KEY) { console.warn('[changeNotify] BREVO_API_KEY unset - admin edit email skipped'); return; }

  const changes = diffReservation(opts.prev, opts.next);
  if (!changes.length) return; // nothing actually changed - don't spam

  const guest = String(opts.next.guest_name || opts.prev.guest_name || 'Unknown');
  const rooms = (arrKey(opts.next.room_ids) || arrKey(opts.prev.room_ids)) || DASH;
  const when  = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  const actor = `${opts.actor.name} (${opts.actor.role})`;

  const rows = changes.map((c) =>
    `<tr>`
    + `<td style="padding:8px 14px;border-bottom:1px solid #EAE6DD;font-weight:600;color:#1C1A17">${esc(c.label)}</td>`
    + `<td style="padding:8px 14px;border-bottom:1px solid #EAE6DD;color:#9A907C;text-decoration:line-through">${esc(c.from)}</td>`
    + `<td style="padding:8px 14px;border-bottom:1px solid #EAE6DD;color:#8B6914;font-weight:700">${esc(c.to)}</td>`
    + `</tr>`
  ).join('');

  const html = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>',
    '<body style="margin:0;background:#F7F4EF;font-family:Arial,Helvetica,sans-serif;padding:32px 0">',
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">',
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #EAE6DD;border-radius:12px;overflow:hidden">',
    '<tr><td style="padding:22px 28px;border-bottom:1px solid #EAE6DD">',
    '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9A907C">Lumea &middot; Reservation Edited</div>',
    `<div style="font-size:19px;color:#1C1A17;margin-top:4px">${esc(guest)} &middot; Room ${esc(rooms)}</div>`,
    `<div style="font-size:12px;color:#9A907C;margin-top:6px">Edited by <strong>${esc(actor)}</strong> &middot; ${esc(when)} (Dhaka)</div>`,
    '</td></tr>',
    '<tr><td style="padding:8px 28px 22px">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">',
    '<tr><th align="left" style="padding:8px 14px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9A907C;border-bottom:1px solid #EAE6DD">Field</th>',
    '<th align="left" style="padding:8px 14px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9A907C;border-bottom:1px solid #EAE6DD">Before</th>',
    '<th align="left" style="padding:8px 14px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9A907C;border-bottom:1px solid #EAE6DD">After</th></tr>',
    rows,
    '</table>',
    `<div style="font-size:11px;color:#B8AE9C;margin-top:18px">Reservation ID: ${esc(opts.resId)}</div>`,
    '</td></tr></table></td></tr></table></body></html>',
  ].join('\n');

  const text = [
    `Reservation edited - ${guest} (Room ${rooms})`,
    `By: ${actor} | ${when} (Dhaka)`,
    '',
    ...changes.map((c) => `* ${c.label}: ${c.from} -> ${c.to}`),
    '',
    `Reservation ID: ${opts.resId}`,
  ].join('\n');

  await sendAdminMail(
    BREVO_KEY,
    `Reservation edited - ${guest} (Room ${rooms}) by ${opts.actor.name}`,
    html,
    text,
  );
}

// Sent when a reservation is hard-deleted (cascade removes its folios/transactions). A delete
// has no after-state, so we snapshot the key fields that were removed. Best-effort.
export async function notifyReservationDeleted(opts: { prev: ResLike; actor: Actor; resId: string }): Promise<void> {
  const BREVO_KEY = (process.env.BREVO_API_KEY || '').trim();
  if (!BREVO_KEY) { console.warn('[changeNotify] BREVO_API_KEY unset - delete email skipped'); return; }

  const guest = String(opts.prev.guest_name || 'Unknown');
  const rooms = arrKey(opts.prev.room_ids) || DASH;
  const when  = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  const actor = `${opts.actor.name} (${opts.actor.role})`;

  const snap = FIELDS.map((f) => ({ label: f.label, val: f.fmt(opts.prev[f.key]) }));
  const rows = snap.map((s) =>
    `<tr><td style="padding:8px 14px;border-bottom:1px solid #EAE6DD;font-weight:600;color:#1C1A17">${esc(s.label)}</td>`
    + `<td style="padding:8px 14px;border-bottom:1px solid #EAE6DD;color:#1C1A17">${esc(s.val)}</td></tr>`
  ).join('');

  const html = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>',
    '<body style="margin:0;background:#F7F4EF;font-family:Arial,Helvetica,sans-serif;padding:32px 0">',
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">',
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #EAE6DD;border-radius:12px;overflow:hidden">',
    '<tr><td style="padding:22px 28px;border-bottom:1px solid #EAE6DD;background:#FDF3F2">',
    '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#DC2626">Lumea &middot; Reservation DELETED</div>',
    `<div style="font-size:19px;color:#1C1A17;margin-top:4px">${esc(guest)} &middot; Room ${esc(rooms)}</div>`,
    `<div style="font-size:12px;color:#9A907C;margin-top:6px">Deleted by <strong>${esc(actor)}</strong> &middot; ${esc(when)} (Dhaka)</div>`,
    '</td></tr>',
    '<tr><td style="padding:8px 28px 22px">',
    '<div style="font-size:12px;color:#9A907C;margin:10px 0 4px">This reservation and its linked folios &amp; transactions were permanently removed (cascade delete). Snapshot of what was deleted:</div>',
    '<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">',
    rows,
    '</table>',
    `<div style="font-size:11px;color:#B8AE9C;margin-top:18px">Reservation ID: ${esc(opts.resId)}</div>`,
    '</td></tr></table></td></tr></table></body></html>',
  ].join('\n');

  const text = [
    `Reservation DELETED - ${guest} (Room ${rooms})`,
    `By: ${actor} | ${when} (Dhaka)`,
    'Permanently removed with its folios & transactions (cascade delete).',
    '',
    ...snap.map((s) => `* ${s.label}: ${s.val}`),
    '',
    `Reservation ID: ${opts.resId}`,
  ].join('\n');

  await sendAdminMail(BREVO_KEY, `Reservation DELETED - ${guest} (Room ${rooms}) by ${opts.actor.name}`, html, text);
}

// Shared Brevo transactional send to the admin inbox. Swallows all errors.
async function sendAdminMail(brevoKey: string, subject: string, html: string, text: string): Promise<void> {
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:  { name: SENDER_NAME, email: SENDER_EMAIL },
        to:      [{ email: ADMIN_EMAIL }],
        replyTo: { name: SENDER_NAME, email: SENDER_EMAIL },
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!r.ok) console.warn('[changeNotify] Brevo', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.warn('[changeNotify]', e instanceof Error ? e.message : e);
  }
}
