'use client';

// idUpload — guest ID-scan capture helper (Guests tab / guest form).
//
// Hotel staff photograph an NID or passport with a phone: a 3–6 MB JPEG. Storing those raw
// would bloat every guest read and drag the CRM down on hotel wifi (see the 2026-07-30
// slowness saga), so images are compressed IN THE BROWSER before they ever reach the server:
// downscaled to <= MAX_EDGE on the long side and re-encoded as WebP (JPEG fallback when the
// browser cannot encode WebP). A 4 MB phone photo lands at ~60–140 KB and is still perfectly
// legible for front-desk verification.
//
// PDFs cannot be canvas-compressed, so they pass through untouched under a hard size cap.
// The upload itself goes through the session-gated /api/crm/guest-id route — the browser
// never talks to storage directly, and since 2026-08-15 the bucket is PRIVATE: what gets
// stored in guests.id_image_url is an object PATH, and viewing one means asking that same
// route for a short-lived signed URL. idDocHref() below is the only thing that needs to know.

export const ID_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,image/webp,application/pdf';
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB — what we accept BEFORE compression
const MAX_EDGE = 1400;   // long-edge px — an ID card stays readable well below this
const QUALITY = 0.72;    // WebP quality — visually clean for text on a card

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const extOf = (name = '') => String(name).split('.').pop().toLowerCase();

// Some Androids hand back an empty file.type — fall back to the extension.
export function typeOf(file) {
  const t = String(file?.type || '').toLowerCase();
  if (t) return t;
  const e = extOf(file?.name);
  if (e === 'pdf') return 'application/pdf';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  return '';
}

// Works on both a stored path (<tenant>/<uuid>.pdf) and a legacy absolute URL.
export function isPdfUrl(url) {
  return /\.pdf($|\?)/i.test(String(url || ''));
}

// Turn a stored guests.id_image_url into something an <img src> / <a href> can use.
//   private path  -> /api/crm/guest-id?path=…  (route 307s to a 5-minute signed URL)
//   legacy http…  -> returned as-is, so documents uploaded to the old public bucket keep
//                    rendering until that guest's ID is re-uploaded.
export function idDocHref(value) {
  const v = String(value || '');
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `/api/crm/guest-id?path=${encodeURIComponent(v)}`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result || '').split(',')[1] || '');
  fr.onerror = () => reject(new Error('Could not read that file.'));
  fr.readAsDataURL(blob);
});

// Returns { blob, contentType, bytes } — the payload actually uploaded.
export async function compressIdFile(file) {
  const type = typeOf(file);
  if (!type) throw new Error('Unsupported file — use JPG, PNG or PDF.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);

  if (type === 'application/pdf') return { blob: file, contentType: 'application/pdf', bytes: file.size };
  if (!IMAGE_TYPES.includes(type)) throw new Error('Unsupported file — use JPG, PNG or PDF.');

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';            // flatten PNG transparency — a scan is opaque paper
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let blob = await canvasToBlob(canvas, 'image/webp', QUALITY);
  let contentType = 'image/webp';
  // Safari < 16 / older WebViews return null (or a PNG) for webp — fall back to JPEG.
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', QUALITY);
    contentType = 'image/jpeg';
  }
  if (!blob) throw new Error('Could not compress that image — try a different file.');
  // Never upload something LARGER than the original (tiny, already-optimised inputs).
  if (blob.size >= file.size && IMAGE_TYPES.includes(type)) return { blob: file, contentType: type, bytes: file.size };
  return { blob, contentType, bytes: blob.size };
}

// Compress + upload. Resolves to the stored object PATH (not a URL — the bucket is private).
// `replacing` is the guest's current id_image_url; a private path is deleted server-side once
// the new object lands, a legacy public URL is simply dropped from the record.
export async function uploadGuestId(file, { guestId, replacing } = {}) {
  const { blob, contentType } = await compressIdFile(file);
  const data = await blobToBase64(blob);
  const prev = String(replacing || '');
  const r = await fetch('/api/crm/guest-id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      content_type: contentType,
      guest_id: guestId || null,
      replace_path: /^https?:\/\//i.test(prev) ? null : (prev || null),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || !j.path) throw new Error(j.error || 'Could not upload the ID document.');
  return j.path;
}
