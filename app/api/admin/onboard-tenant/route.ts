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
//   facebook_page_token?, facebook_page_id?, anthropic_api_key?
//
// Returns: { ok: true, tenant_id, slug, cron_secret, subdomain }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invalidateTenantCache } from '@/lib/tenant';

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
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${adminSecret}`) {
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
    // Secrets (optional — can be added later via UPDATE)
    brevo_api_key:       body.brevo_api_key        ?? null,
    gmail_user:          body.gmail_user           ?? null,
    gmail_app_password:  body.gmail_app_password   ?? null,
    facebook_page_token: body.facebook_page_token  ?? null,
    facebook_page_id:    body.facebook_page_id     ?? null,
    anthropic_api_key:   body.anthropic_api_key    ?? null,
  };

  const { data, error } = await sb
    .from('tenants')
    .insert(insertData)
    .select('id, slug, cron_secret')
    .single();

  if (error) {
    // Duplicate slug
    if (error.code === '23505') {
      return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 });
    }
    console.error('[onboard-tenant] Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate cache in case slug was previously looked up with no result
  invalidateTenantCache(slug);

  const apexDomain = process.env.NEXT_PUBLIC_APEX_DOMAIN || 'lumea.app';

  return NextResponse.json({
    ok:           true,
    tenant_id:    data.id,
    slug:         data.slug,
    cron_secret:  data.cron_secret,
    subdomain:    `${slug}.${apexDomain}`,
    next_steps: [
      `1. Add wildcard domain *.${apexDomain} to Vercel project (if not done)`,
      `2. Add DNS CNAME: ${slug}.${apexDomain} → cname.vercel-dns.com`,
      `3. Set CRON_SECRET=${data.cron_secret} in Vercel env for this tenant's crons`,
      `4. Seed rooms: run db/01_setup_and_rooms.sql with tenant_id='${data.id}'`,
    ],
  }, { status: 201 });
}
