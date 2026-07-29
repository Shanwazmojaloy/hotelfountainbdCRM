import { defineConfig, configDefaults } from 'vitest/config';

// Scope the test run to first-party CRM code. The repo vendors an archived
// third-party skill under archive/onedrive-workspace/.../impeccable-main whose
// own test suite (missing live-*.mjs modules) was polluting `npm test` with 55
// failing files and masking the real signal. Exclude it so the suite reflects
// only the CRM (e.g. crm.logic.test.ts).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/archive/**', 'tests/e2e/**'],
  },
});
