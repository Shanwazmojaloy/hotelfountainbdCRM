// Lumea RBAC — single source of truth for what each department role may see and do.
// Owner-defined 2026-06-10. Only EXPLICITLY-listed modules are visible/accessible per role.
//
// Roles in staff.role (lowercased): 'owner' | 'manager' | 'admin' | 'receptionist' | 'housekeeping'.
// Enforcement layers that consume this: Sidebar/BottomNav (hide), Layout route guard
// (redirect), capability gates (`can()`), and the server route (independent re-check).

const norm = (r) => String(r || '').trim().toLowerCase();
const ADMIN_ROLES = ['owner', 'manager', 'admin'];

export const isAdmin = (role) => ADMIN_ROLES.includes(norm(role));

// Route prefixes each NON-admin role may open. Admin = full access (handled separately).
// Match is prefix-based but '/crm' (Dashboard) is matched EXACTLY so it doesn't open everything.
const ROLE_ROUTES = {
  housekeeping: ['/crm', '/crm/rooms', '/crm/housekeeping'],
  receptionist: ['/crm', '/crm/rooms', '/crm/reservations', '/crm/guests', '/crm/housekeeping', '/crm/billing', '/crm/reports'],
};

export function canAccess(role, path) {
  if (isAdmin(role)) return true;
  const allowed = ROLE_ROUTES[norm(role)];
  if (!allowed) return path === '/crm'; // unknown role → Dashboard only (fail safe)
  const p = String(path || '').split('?')[0].replace(/\/$/, '') || '/crm';
  return allowed.some((a) => (a === '/crm' ? p === '/crm' : p === a || p.startsWith(a + '/')));
}

// Capability flags — fine-grained powers within an accessible page.
//   delete            — remove reservations / hard deletes (ADMIN ONLY; receptionist cannot delete)
//   viewGuestDetails  — see guest names/contact on the Dashboard (hidden from housekeeping)
//   recordPayment     — take payments in Billing
//   closeDay          — run the Reports closing report
//   adminTools        — Settings
export function can(role, capability) {
  const r = norm(role);
  if (isAdmin(r)) return true;
  switch (capability) {
    case 'delete':
    case 'adminTools':
      return false; // admin-only — already returned true above
    case 'viewGuestDetails':
      return r !== 'housekeeping';
    case 'recordPayment':
    case 'closeDay':
      return r === 'receptionist';
    default:
      return false;
  }
}

// Default landing route for a role (first accessible page).
export const homeRoute = () => '/crm';
