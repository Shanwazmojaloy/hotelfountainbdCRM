// Rooms the seeded specs are allowed to book. They MUST exist and be bookable on the
// TEST tenant you point E2E at. Override per environment with E2E_TEST_ROOMS (comma-separated),
// e.g. E2E_TEST_ROOMS="T01,T02,T03,T04,T05". The multi-room spec needs at least 3 free.
export const TEST_ROOMS = (process.env.E2E_TEST_ROOMS || '101,102,103,104,105,106,107,108,109,110,201,202,203,204,205')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
