// ─────────────────────────────────────────────────────────────────────────────
// Lumea — POST /api/admin/onboard-tenant
//
// Creates a new tenant row in public.tenants.
// Protected by ADMIN_SECRET env var (Bearer token).
//
// Body (JSON):
//   slug, hotel_name, hotel_location, hotel_address, hotel_phone,
//   hotel_whatsapp, hotel_city, hotel_room_count, hotel_description,
//   hotel_email, sender_name, alert_email, alert_name, plan_tier,
//   brevo_api_key?, gmail_user?, gmail_app_password?,
//   facebook_page_token?, facebook_page_id?, anthropic_api_key?,
//   office_ips?: string[], remote_roles?: string[],            (Phase B perimeter)
//   rooms?: [{room_number, category?, price?, floor?, beds?}], (Phase B seed)
//   owner?: {name, email}                                      (Phase B owner staff)
//
// Phase B (2026-07-02): secrets go to Supabase Vault via tenant_secret_set()
// (columns stay NULL; getTenantBySlug overlays Vault values at read time).
// rooms[] seeds the room matrix; owner{} creates an unactivated owner staff row
// so the new hotel's owner can activate via send-otp on their own subdomain.
//
// Returns: { ok: true, tenant_id, slug, subdomain }  (cron_secret is NOT returned — fetch from the tenants table)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { invalidateTenantCache } from '@/lib/tenant';
import { logEvent } from '@/lib/audit';

export const runtime = 'nodejs';

const REQUIRED_FIELDS = [
  'slug', 'hotel_name', 'hotel_location', 'hotel_address',
  'hotel_phone', 'hotel_email', 'sender_name', 'alert_email',
  'alert_name', 'plan_tier',
] as const;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured on this deployment' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') || '';
  const requestId = req.headers.get('x-request-id');
  // Constant-time compare via equal-length SHA-256 digests so the admin token can't be
  // recovered through response-timing (plain !== short-circuits at the first wrong byte).
  const expectedAuth = `Bearer ${adminSecret}`;
  const authOk = crypto.timingSafeEqual(
    crypto.createHash('sha256').update(auth).digest(),
    crypto.createHash('sha256').update(expectedAuth).digest(),
  );
  if (!authOk) {
    void logEvent({
      event_type:    'admin_onboard_tenant',
      action_target: 'POST /api/admin/onboard-tenant',
      status_code:   401,
      result:        'denied',
      role:          'anon',
      request_id:    requestId,
      ip:            (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null,
      user_agent:    req.headers.get('user-agent'),
      payload_summary: { reason: 'bad_admin_secret' },
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validate required fields ──────────────────────────────────────────────
  const missing = REQUIRED_FIELDS.filter(f => !body[f]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 });
  }

  // ── Validate slug format ──────────────────────────────────────────────────
  const slug = String(body.slug).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (slug !== body.slug) {
    return NextResponse.json({
      error: `Invalid slug "${body.slug}" — use lowercase letters, numbers, hyphens only`,
    }, { status: 400 });
  }

  // ── Validate plan_tier ────────────────────────────────────────────────────
  if (!['starter', 'growth', 'full'].includes(String(body.plan_tier))) {
    return NextResponse.json({ error: 'plan_tier must be: starter | growth | full' }, { status: 400 });
  }

  // ── Insert into Supabase ──────────────────────────────────────────────────
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const strArr = (v: unknown): string[] | null =>
    Array.isArray(v) && v.length ? v.map((x) => String(x).trim()).filter(Boolean) : null;

  const insertData = {
    slug,
    plan_tier:           body.plan_tier,
    hotel_name:          body.hotel_name,
    hotel_location:      body.hotel_location      ?? '',
    hotel_address:       body.hotel_address        ?? '',
    hotel_phone:         body.hotel_phone          ?? '',
    hotel_whatsapp:      body.hotel_whatsapp       ?? '',
    hotel_city:          body.hotel_city           ?? '',
    hotel_room_count:    Number(body.hotel_room_count ?? 24),
    hotel_description:   body.hotel_description    ?? '',
    hotel_email:         body.hotel_email,
    sender_name:         body.sender_name,
    alert_email:         body.alert_email,
    alert_name:          body.alert_name,
    // Phase B perimeter overrides (NULL = deployment defaults in middleware)
    office_ips:          strArr(body.office_ips),
    remote_roles:        strArr(body.remote_roles)?.map((r) => r.toLowerCase()) ?? null,
    // Secrets live in Supabase Vault (written below) — columns stay NULL.
  };

  const { data, error } = await sb
    .from('tenants')
    .insert(insertData)
    .select('id, slug')
    .single();

  if (error) {
    // Duplicate slug
    if (error.code === '23505') {
      return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 });
    }
    console.error('[onboard-tenant] Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Phase B: secrets → Supabase Vault (fail-soft; report per-key results) ──
  const SECRET_KEYS = ['brevo_api_key', 'gmail_user', 'gmail_app_password',
    'facebook_page_token', 'facebook_page_id', 'anthropic_api_key'] as const;
  const vaultResults: Record<string, string> = {};
  for (const key of SECRET_KEYS) {
    const value = body[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const { error: vErr } = await sb.rpc('tenant_secret_set', {
      p_tenant_id: data.id, p_key: key, p_value: value.trim(),
    });
    vaultResults[key] = vErr ? `FAILED: ${vErr.message}` : 'vault';
    if (vErr) console.error(`[onboard-tenant] vault write ${key}:`, vErr.message);
  }

  // ── Phase B: seed rooms (optional; status UPPERCASE per DB constraint) ──────
  let roomsSeeded = 0;
  if (Array.isArray(body.rooms) && body.rooms.length) {
    const roomRows = (body.rooms as Array<Record<string, unknown>>)
      .filter((r) => r && String(r.room_number ?? '').trim())
      .map((r) => ({
        room_number: String(r.room_number).trim(),
        category:    String(r.category ?? 'Standard'),
        price:       Number(r.price) || 0,
        status:      'AVAILABLE',
        tenant_id:   data.id,
        ...(r.floor != null ? { floor: String(r.floor) } : {}),
        ...(r.beds  != null ? { beds:  String(r.beds)  } : {}),
      }));
    if (roomRows.length) {
      const { error: rErr } = await sb.from('rooms').insert(roomRows);
      if (rErr) console.error('[onboard-tenant] rooms seed:', rErr.message);
      else roomsSeeded = roomRows.length;
    }
  }

  // ── Phase B: owner staff bootstrap (optional) — unactivated owner row so the
  //    hotel owner activates via send-otp/activate on their own subdomain. ─────
  let ownerStaffId: number | null = null;
  const owner = body.owner as { name?: string; email?: string } | undefined;
  if (owner?.name && owner?.email) {
    // staff.id is an integer PK shared across tenants → global next id (same rule
    // as /api/crm/staff create).
    const { data: mx } = await sb.from('staff').select('id').order('id', { ascending: false }).limit(1);
    const nextId = ((mx && mx[0]?.id) || 0) + 1;
    const initials = String(owner.name).split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
    const { error: sErr } = await sb.from('staff').insert({
      id: nextId, name: String(owner.name), email: String(owner.email).toLowerCase(),
      role: 'owner', device: `${owner.name} Terminal`, av: initials,
      tenant_id: data.id, activated: false, pwh: null, session_v: 1,
    });
    if (sErr) console.error('[onboard-tenant] owner staff:', sErr.message);
    else ownerStaffId = nextId;
  }

  // Invalidate cache in case slug was previously looked up with no result
  invalidateTenantCache(slug);

  const apexDomain = process.env.NEXT_PUBLIC_APEX_DOMAIN || 'lumea.app';

  void logEvent({
    event_type:    'admin_onboard_tenant',
    action_target: `tenants:${data.id}`,
    status_code:   201,
    result:        'success',
    role:          'admin',
    tenant_id:     data.id,
    request_id:    requestId,
    payload_summary: { slug: data.slug, plan_tier: body.plan_tier, hotel_name: body.hotel_name },
  });

  return NextResponse.json({
    ok:            true,
    tenant_id:     data.id,
    slug:          data.slug,
    subdomain:     `${slug}.${apexDomain}`,
    secrets_vault: vaultResults,       // per-key: 'vault' | 'FAILED: …' (absent = not provided)
    rooms_seeded:  roomsSeeded,
    owner_staff_id: ownerStaffId,      // null = no owner provided (or insert failed — see logs)
    next_steps: [
      `1. Add wildcard domain *.${apexDomain} to Vercel project (if not done)`,
      `2. Add DNS CNAME: ${slug}.${apexDomain} → cname.vercel-dns.com`,
      `3. Retrieve this tenant's cron_secret from the tenants table (Supabase) and set CRON_SECRET in Vercel env — it is intentionally NOT returned here to keep secrets out of HTTP responses/logs`,
      ...(roomsSeeded === 0 ? [`4. Seed rooms: POST again with rooms[] or insert into rooms with tenant_id='${data.id}'`] : []),
      ...(ownerStaffId == null ? [`5. Create the owner staff row (POST again with owner{name,email}), then have them activate at https://${slug}.${apexDomain}/crm`] : [`5. Owner activates at https://${slug}.${apexDomain}/crm → Activate tab (staff id ${ownerStaffId})`]),
    ],
  }, { status: 201 });
}
