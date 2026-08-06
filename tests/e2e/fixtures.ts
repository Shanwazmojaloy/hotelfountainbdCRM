// Rooms the seeded specs are allowed to book. They MUST exist and be bookable on the
// TEST tenant you point E2E at. Override per environment with E2E_TEST_ROOMS (comma-separated),
// e.g. E2E_TEST_ROOMS="T01,T02,T03,T04,T05". The multi-room spec needs at least 3 free.
// Default = the lumeademo test tenant's rooms (provisioned 2026-08-06). NEVER default to
// prod-shaped room numbers (301–510) — a mis-set E2E_BASE_URL must not find bookable rooms.
export const TEST_ROOMS = (process.env.E2E_TEST_ROOMS || 'D101,D102,D103,D104,D105')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
