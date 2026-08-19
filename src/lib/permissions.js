// Lumea RBAC -- single source of truth for what each department role may see and do.
// Owner-defined 2026-06-10, rewritten 2026-07-21 for the 7-role hotel + restaurant matrix.
//
// Roles in staff.role (lowercased):
//   'owner' | 'admin'  -- full access (every route + every capability)
//   'manager'          -- full hotel ops, NO Settings, NO Restaurant/POS
//   'front_desk_supervisor' -- like manager for hotel ops (adds Close Day/Reports vs receptionist)
//   'receptionist'     -- front-desk operations, NO Reports, NO Close Day, NO revenue metrics
//   'restaurant_supervisor' -- Restaurant/POS + register/discounts/voids + F&B reports; Rooms view
//   'restaurant_staff' -- Restaurant/POS ordering only (waiter)
//   'housekeeping'     -- Housekeeping board + Rooms status only
//   (legacy 'accountant' is intentionally left to the fail-safe -> Dashboard only, unchanged)
//
// Enforcement layers that consume this: Header/BottomNav (hide), Layout route guard
// (redirect to homeRoute), capability gates (`can()`), and the server route (independent re-check).

const norm = (r) => String(r || '').trim().toLowerCase();

// Owner + Admin are the ONLY true superusers (all routes + all capabilities, incl Settings/POS).
const SUPER_ROLES = ['owner', 'admin'];
export const isOwnerAdmin = (role) => SUPER_ROLES.includes(norm(role));

// isAdmin stays owner/admin/manager for BACKWARD COMPAT: it still gates admin-level WRITE
// actions in RoomStatusModal / RoomFolioModal / ReservationEditModal, where Manager must keep
// power (matrix: Rooms/Reservations/Billing = TRUE). It is NO LONGER used for route wildcards.
const ADMIN_WRITE_ROLES = ['owner', 'admin', 'manager'];
export const isAdmin = (role) => ADMIN_WRITE_ROLES.includes(norm(role));

// Route prefixes each role may open. Owner/Admin bypass this (full access).
// '/crm' (Dashboard) is matched EXACTLY so it doesn't wildcard everything.
// Order matters: the FIRST entry is used as the role's landing route by homeRoute().
// '/crm/billing' removed from all roles (owner decision 2026-07-31 — Billing tab retired;
// the route itself now redirects to /crm).
const ROLE_ROUTES = {
  // '/crm/referrals' added 2026-08-09 — front-desk sender for the referral queue. Guest PII
  // (name + phone), so it stays off housekeeping/restaurant roles; the API re-checks the role.
  manager:               ['/crm', '/crm/rooms', '/crm/reservations', '/crm/guests', '/crm/referrals', '/crm/housekeeping', '/crm/reports'],
  front_desk_supervisor: ['/crm', '/crm/rooms', '/crm/reservations', '/crm/guests', '/crm/referrals', '/crm/housekeeping', '/crm/reports'],
  receptionist:          ['/crm', '/crm/rooms', '/crm/reservations', '/crm/guests', '/crm/referrals', '/crm/housekeeping'],
  restaurant_supervisor: ['/crm/restaurant', '/crm/rooms'],
  restaurant_staff:      ['/crm/restaurant'],
  housekeeping:          ['/crm/housekeeping', '/crm/rooms'],
};

// ── PLATFORM routes — ours, not the customer's ───────────────────────────────
// These are Hotel Growth OS business surfaces, not hotel operations:
//   /crm/growth       our sales pipeline (prospects, scores, our notes on them)
//   /crm/subscribers  who is paying, who is blocked, across every tenant
//
// Role is NOT a sufficient gate for them. demo_provision() gives every demo and
// every future customer an OWNER-role account, so a role-only check cleared these
// for the entire customer base. Access requires the HOME tenant as well.
//
// This is the display layer. The real boundary is server-side: app/api/growth
// re-checks the signed cookie's tenant_id and 404s anyone else.
const PLATFORM_ROUTES = ['/crm/growth', '/crm/subscribers'];
export const HOME_TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

// FAILS CLOSED on a missing tenantId, and that differs from the API routes ON PURPOSE.
//
// The routes read tenant_id from the SIGNED cookie, where absent can only mean a legacy
// session predating tenant binding — ours. This function reads the localStorage blob,
// where absent also happens to a CUSTOMER whose session was stored before hotel_name and
// tenant_id were persisted. With a permissive fallback that customer saw the Growth and
// Subscriber Access pills (caught 2026-08-19 on a demo tenant with a stale session).
//
// No data leaked — /api/growth and /api/crm/subscribers re-check the cookie and 404 —
// but a customer must not see tabs naming a system they are not part of. The cost of
// failing closed is that a stale session loses the pills until the next sign-in.
export const isPlatformOwner = (role, tenantId) =>
  isOwnerAdmin(role) && !!tenantId && tenantId === HOME_TENANT_ID;

export function canAccess(role, path, tenantId) {
  const p0 = String(path || '').split('?')[0].replace(/\/$/, '') || '/crm';
  if (PLATFORM_ROUTES.some((a) => p0 === a || p0.startsWith(a + '/'))) {
    return isPlatformOwner(role, tenantId);
  }
  if (isOwnerAdmin(role)) return true;
  const allowed = ROLE_ROUTES[norm(role)];
  if (!allowed) return path === '/crm'; // unknown role (e.g. accountant) -> Dashboard only (fail safe)
  const p = p0;
  return allowed.some((a) => (a === '/crm' ? p === '/crm' : p === a || p.startsWith(a + '/')));
}

// Fine-grained capability matrix (within an accessible page). Owner/Admin get everything.
//   delete           -- hard deletes / cancellations
//   adminTools       -- Settings / admin tools (OWNER/ADMIN ONLY)
//   viewRevenue      -- aggregate revenue metrics on the Dashboard
//   viewGuestDetails -- guest names / contact / full PII
//   recordPayment    -- take PMS payments in Billing
//   closeDay         -- run the Reports night audit / day close
//   postFbToRoom     -- post a restaurant (F&B) order to a guest's room folio
//   posDiscount      -- apply POS discounts / voids
//   posRegister      -- open / close the POS register & shift
//   viewFbReports    -- view F&B (restaurant) sales reports
//   compItem         -- mark a POS line complimentary (e.g. included breakfast). Front Office
//                       does this manually; NOT the waiter (restaurant_staff).
const CAPS = {
  manager:               { delete: true, viewRevenue: true, viewGuestDetails: true, recordPayment: true, closeDay: true, postFbToRoom: true, compItem: true },
  front_desk_supervisor: { delete: true, viewRevenue: true, viewGuestDetails: true, recordPayment: true, closeDay: true, postFbToRoom: true, compItem: true },
  receptionist:          { viewGuestDetails: true, recordPayment: true, postFbToRoom: true, compItem: true },
  restaurant_supervisor: { postFbToRoom: true, posDiscount: true, posRegister: true, viewFbReports: true, compItem: true },
  restaurant_staff:      { postFbToRoom: true },
  housekeeping:          {},
};

export function can(role, capability) {
  const r = norm(role);
  if (isOwnerAdmin(r)) return true; // owner/admin = every capability, incl adminTools + POS
  return !!(CAPS[r] && CAPS[r][capability]);
}

// Default landing route for a role (its first accessible page). Housekeeping and restaurant
// roles have NO Dashboard access, so they land on their department page instead.
export function homeRoute(role) {
  const r = norm(role);
  if (isOwnerAdmin(r)) return '/crm';
  const allowed = ROLE_ROUTES[r];
  if (!allowed || allowed.length === 0) return '/crm';
  return allowed.includes('/crm') ? '/crm' : allowed[0];
}
