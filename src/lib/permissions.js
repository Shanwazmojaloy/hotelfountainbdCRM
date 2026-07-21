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
const ROLE_ROUTES = {
  manager:               ['/crm', '/crm/rooms', '/crm/reservations', '/crm/guests', '/crm/housekeeping', '/crm/billing', '/crm/reports'],
  front_desk_supervisor: ['/crm', '/crm/rooms', '/crm/reservations', '/crm/guests', '/crm/housekeeping', '/crm/billing', '/crm/reports'],
  receptionist:          ['/crm', '/crm/rooms', '/crm/reservations', '/crm/guests', '/crm/housekeeping', '/crm/billing'],
  restaurant_supervisor: ['/crm/restaurant', '/crm/rooms'],
  restaurant_staff:      ['/crm/restaurant'],
  housekeeping:          ['/crm/housekeeping', '/crm/rooms'],
};

export function canAccess(role, path) {
  if (isOwnerAdmin(role)) return true;
  const allowed = ROLE_ROUTES[norm(role)];
  if (!allowed) return path === '/crm'; // unknown role (e.g. accountant) -> Dashboard only (fail safe)
  const p = String(path || '').split('?')[0].replace(/\/$/, '') || '/crm';
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
