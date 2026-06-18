// ─────────────────────────────────────────────────────────────────────────────
// Shared tenant resolver for PER-HOTEL OPERATIONS agents only.
//
// Used by: daily-ops, weekly-retention. Each active tenant is one customer
// hotel; ops agents must run once per hotel using that hotel's own settings.
//
// NOT for the Lumea B2B sales-funnel agents (payment-send, payment-confirm,
// deal-alert, reply-intake, reply-intake-poll, reply-digest, ceo-auditor,
// follow-up-bot). Those are the SELLER's pipeline (operate on corporate_leads /
// outreach_log, email Shan or prospects from Shan's own accounts) and MUST stay
// anchored to the home tenant. Do not call this from them.
//
// Safety net: if the tenants query fails or returns nothing, fall back to a
// single synthetic tenant (env NEXT_PUBLIC_TENANT_ID || legacy UUID) with null
// secret columns. Callers read `t.<col> ?? process.env.<X>`, so a null-column
// tenant behaves byte-identically to the pre-multitenant single-tenant code —
// the loop can never do LESS than today.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpsTenant {
  id: string;
  hotel_name: string | null;
  hotel_city: string | null;
  hotel_room_count: number | null;
  hotel_whatsapp: string | null;
  facebook_page_id: string | null;
  facebook_page_token: string | null;
}

const FALLBACK_TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

function singleTenant(): OpsTenant[] {
  return [{
    id: FALLBACK_TENANT_ID,
    hotel_name: null,
    hotel_city: null,
    hotel_room_count: null,
    hotel_whatsapp: null,
    facebook_page_id: null,
    facebook_page_token: null,
  }];
}

export async function activeOpsTenants(): Promise<OpsTenant[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return singleTenant();

  const cols =
    'id,hotel_name,hotel_city,hotel_room_count,hotel_whatsapp,facebook_page_id,facebook_page_token';
  try {
    const res = await fetch(`${url}/rest/v1/tenants?select=${cols}&is_active=eq.true`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      const rows = (await res.json()) as OpsTenant[];
      if (Array.isArray(rows) && rows.length > 0) return rows;
    }
  } catch {
    /* fall through to single-tenant safety net */
  }
  return singleTenant();
}
