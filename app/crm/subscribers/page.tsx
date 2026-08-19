import Subscribers from '@/components/Subscribers';

// PLATFORM route — Hotel Fountain (home tenant) + owner/admin only.
// /crm/subscribers is listed in PLATFORM_ROUTES in src/lib/permissions.js, so canAccess()
// hides the pill and Layout's RouteGuard bounces anyone else to their Dashboard. The real
// boundary is /api/crm/subscribers, which re-checks the signed cookie's tenant_id and
// answers 404 — a customer must not learn this screen exists.
export default function SubscribersRoute() {
  return <Subscribers />;
}
