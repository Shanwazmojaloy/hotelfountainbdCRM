// POST /api/crm/guest-id — session-gated upload of a guest ID scan (NID / passport / etc).
//
// The browser compresses the image to WebP first (src/lib/idUpload.js); this route only
// validates and stores. Files land in the `crm-assets` bucket under
//   guest-ids/<tenant>/<random-uuid>.<ext>
// and the returned public URL is what the client persists to guests.id_image_url.
//
// The bucket is PUBLIC (owner decision 2026-08-15), so the object NAME is the only thing
// standing between a scan and the open internet: it is a v4 UUID, never the guest's name,
// phone or id — unguessable and un-enumerable. Replacing a document deletes the old object
// so a stale scan can never be served from a link someone kept.
//
// Body: { data: base64 (no data: prefix), content_type, guest_id?, replace_url? }
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireSession } from '@/lib/session';
import { tenantScoped, tenantClient } from '@/lib/tenantDb';

export const runtime = 'nodejs';
export const maxDuration = 20;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const BUCKET = 'crm-assets';
const PREFIX = 'guest-ids';
// Post-compression payloads are ~60-140 KB; PDFs pass through uncompressed. 5 MB decoded is a
// generous ceiling that still refuses an accidental raw-video/huge-scan upload.
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const sess = requireSession(req);
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const TENANT = sess.tenant_id || ENV_TENANT; // tenant bound to the SIGNED session (env fallback)

  // session_v recheck — mirrors /api/crm/guest so a revoked login cannot keep uploading.
  const db = tenantScoped(tenantClient(TENANT), TENANT);
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  const contentType = String(body.content_type || '').toLowerCase();
  const ext = EXT[contentType];
  if (!ext) return NextResponse.json({ error: 'Unsupported file type — use JPG, PNG or PDF.' }, { status: 400 });

  const b64 = String(body.data || '');
  if (!b64) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  let buf: Buffer;
  try { buf = Buffer.from(b64, 'base64'); } catch { return NextResponse.json({ error: 'Could not read that file.' }, { status: 400 }); }
  if (!buf.length) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'File is too large.' }, { status: 413 });

  // Storage is not RLS-scoped by tenant_id, so it always uses the service-role client
  // (a crm_tenant JWT under TENANT_JWT_MODE has no storage grants).
  const storage = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const path = `${PREFIX}/${TENANT}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await storage.storage.from(BUCKET).upload(path, buf, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });
  if (upErr) {
    console.error('[crm/guest-id] upload:', upErr.message);
    return NextResponse.json({ error: 'Could not upload the ID document.' }, { status: 500 });
  }

  const { data: pub } = storage.storage.from(BUCKET).getPublicUrl(path);
  const url = pub?.publicUrl || '';
  if (!url) return NextResponse.json({ error: 'Could not upload the ID document.' }, { status: 500 });

  // Best-effort cleanup of the document this one replaces. Only ever removes an object under
  // THIS tenant's guest-ids prefix — a caller cannot point it at anything else in the bucket.
  const oldPath = storagePathOf(String(body.replace_url || ''));
  if (oldPath && oldPath !== path && oldPath.startsWith(`${PREFIX}/${TENANT}/`)) {
    const { error: rmErr } = await storage.storage.from(BUCKET).remove([oldPath]);
    if (rmErr) console.error('[crm/guest-id] stale object not removed:', rmErr.message);
  }

  return NextResponse.json({ ok: true, url, bytes: buf.length });
}

// Extract the in-bucket object path from a public URL, or '' if it is not one of ours.
function storagePathOf(url: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return '';
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}
