import Growth from '@/components/Growth';

// Owner/admin only — ROLE_ROUTES in src/lib/permissions.js does not list /crm/growth for any
// operational role, so canAccess() falls through to the isOwnerAdmin short-circuit. The
// /api/growth route re-checks the role server-side; the client gate is convenience, not security.
export default function GrowthRoute() {
  return <Growth />;
}
