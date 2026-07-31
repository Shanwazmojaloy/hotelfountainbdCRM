import { redirect } from 'next/navigation';

// Billing tab RETIRED (owner decision 2026-07-31): redundant — payments are recorded
// from the Dashboard/Rooms/Reservations modals and Reports covers the numbers.
// The route stays as a redirect so old bookmarks/links land on the Dashboard
// instead of a 404. src/components/Billing.jsx is intentionally left in the tree
// (untouched money logic) in case the owner ever wants the tab back.
export default function BillingRoute() {
  redirect('/crm');
}
