// /api/crm/guest-id — guest ID scans (NID / passport / etc). PRIVATE storage.
//
// POST  { data: base64, content_type, guest_id?, replace_path? }  -> { ok, path }
// GET   ?path=<tenant>/<uuid>.<ext>                               -> 307 to a signed URL
//
// Objects live in the PRIVATE `guest-ids` bucket at <tenant_id>/<uuid-v4>.<ext>, and
// `guests.id_image_url` stores that PATH — not a URL. Nothing is publicly reachable: a scan can
// only be viewed through the GET below, which re-verifies the staff session and hands back a
// short-lived signed URL. The browser holds only the anon key and never touches storage.
//
// History: shipped 2026-08-15 against the public `crm-assets` bucket, moved private the same
// day. Values that still look like an absolute http(s) URL are legacy public objects — the
// client renders those as-is (see idDocHref in src/lib/idUpload.js) so nothing 404s mid-
// migration. Re-uploading a guest's document writes to the private bucket and the legacy
// value is replaced.
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

const BUCKET = 'guest-ids';
// Post-compression payloads are ~60-140 KB; PDFs pass through uncompressed. 5 MB decoded is a
// generous ceiling that still refuses an accidental raw-video/huge-scan upload. The bucket
// carries the same limit plus a MIME whitelist, so this is defence in depth, not the only gate.
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_TTL_S = 300; // long enough to actually read a PDF, short enough to be useless if leaked
const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

// Storage is not RLS-scoped by tenant_id, so it always uses the service-role client
// (a crm_tenant JWT under TENANT_JWT_MODE has no storage grants).
const storageClient = () =>
  createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Verify the signed session AND that it is still current. Returns the tenant, or a response.
async function auth(req: NextRequest): Promise<{ tenant: string } | { fail: NextResponse }> {
  const sess = requireSession(req);
  if (!sess) return { fail: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const tenant = sess.tenant_id || ENV_TENANT; // tenant bound to the SIGNED session (env fallback)
  const db = tenantScoped(tenantClient(tenant), tenant);
  const { data: srow } = await db.from('staff').select('session_v').eq('id', sess.id).limit(1);
  if (!srow || !srow[0] || (srow[0].session_v || 1) !== sess.session_v) {
    return { fail: NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 }) };
  }
  return { tenant };
}

// A path is only ever <tenant>/<uuid>.<ext>. Anchored and tenant-pinned, so a caller cannot
// traverse out of their own folder or probe another tenant's scans.
const pathOk = (p: string, tenant: string) =>
  new RegExp(`^${tenant}/[0-9a-f-]{36}\\.(webp|jpg|png|pdf)$`).test(p);

export async function POST(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const a = await auth(req);
  if ('fail' in a) return a.fail;
  const TENANT = a.tenant;

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

  const storage = storageClient();
  const path = `${TENANT}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await storage.storage.from(BUCKET).upload(path, buf, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });
  if (upErr) {
    console.error('[crm/guest-id] upload:', upErr.message);
    return NextResponse.json({ error: 'Could not upload the ID document.' }, { status: 500 });
  }

  // Best-effort cleanup of the document this one replaces. pathOk pins it to THIS tenant's
  // folder, so a caller cannot point it at anything else.
  const oldPath = String(body.replace_path || '');
  if (oldPath && oldPath !== path && pathOk(oldPath, TENANT)) {
    const { error: rmErr } = await storage.storage.from(BUCKET).remove([oldPath]);
    if (rmErr) console.error('[crm/guest-id] stale object not removed:', rmErr.message);
  }

  return NextResponse.json({ ok: true, path, bytes: buf.length });
}

export async function GET(req: NextRequest) {
  if (!SB_SERVICE_KEY) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const a = await auth(req);
  if ('fail' in a) return a.fail;
  const TENANT = a.tenant;

  const path = String(new URL(req.url).searchParams.get('path') || '');
  if (!pathOk(path, TENANT)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const { data, error } = await storageClient().storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL_S);
  if (error || !data?.signedUrl) {
    console.error('[crm/guest-id] sign:', error?.message);
    return NextResponse.json({ error: 'Could not open the ID document.' }, { status: 404 });
  }

  // Redirect rather than proxy: <img src="/api/crm/guest-id?path=…"> just works, and the file
  // bytes never pass through a serverless function. no-store keeps the browser from caching the
  // redirect past the signed URL's TTL.
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
