import { defineConfig, configDefaults } from 'vitest/config';

// Scope the test run to first-party CRM code. The repo vendors an archived
// third-party skill under archive/onedrive-workspace/.../impeccable-main whose
// own test suite (missing live-*.mjs modules) was polluting `npm test` with 55
// failing files and masking the real signal. Exclude it so the suite reflects
// only the CRM (e.g. crm.logic.test.ts).
//
// `.claude/**` added 2026-08-15: git worktrees under .claude/worktrees/ each carry
// their own copy of crm.logic.test.ts, so vitest was collecting the same 51 tests
// five times and reporting 255. A count that inflates with the number of stale
// worktrees is worse than no count — it reads as broad coverage while the real
// module is still tested exactly once.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/archive/**', 'tests/e2e/**', '**/.claude/**'],
  },
});
