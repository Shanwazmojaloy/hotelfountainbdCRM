import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "App.jsx",
      "hotel-fountain-app.jsx",
      "hotel-fountain-v2.jsx",
      "hotel-fountain-v3.jsx",
      "hotel-fountain-v4.jsx",
      "hotel-fountain.jsx",
      "hotelos-platform.jsx",
      "lumea-platform.jsx",
      "index.html",
      "hotel-fountain-crm.html",
      "hotel-fountain-crm-fixed.html",
      "hotel-fountain-landing.html",
      "hotel-fountain-techstack.html",
      "*.zip",
      "src/hooks/billing/usePostPayment.ts",
      "src/hooks/billing/useRoomStatusSync.ts",
      "src/app/components/NotificationBell.tsx",
      // Third-party bundles we ship verbatim - minified vendor code trips
      // no-this-alias / no-require-imports 60+ times and we own none of it.
      "public/vendor/**",
      // Claude Code tooling helpers (CommonJS, never bundled into the app).
      ".claude/**",
    ],
  },
  {
    // ── no-undef for JS/JSX ───────────────────────────────────────────────
    // tsconfig has allowJs WITHOUT checkJs, so every .js/.jsx file in this repo
    // is invisible to `tsc --noEmit`. ESLint could not see them either: ESLint 9
    // flat config lints only .js/.mjs/.cjs by default, so `.jsx` matched no
    // config object and was reported as "File ignored because no matching
    // configuration was supplied". Between the two, .jsx had NO static checking
    // at all - which is how `onSaved={fetchData}` reached production on 8349bad
    // and white-screened /crm/reports with "fetchData is not defined". tsc
    // skipped it, ESLint skipped it, and `next build` compiled it happily.
    //
    // This block is the fix: name .jsx explicitly so it is linted, and turn on
    // no-undef, the rule that catches that entire class of bug. Verified
    // 2026-08-17 by reintroducing the exact bug - it reports
    // "500:133  error  'fetchData' is not defined  no-undef".
    //
    // TS files are deliberately excluded: tsc already does this properly there,
    // and no-undef false-positives on type-only identifiers.
    files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
    // Browser + Node globals already come from next/core-web-vitals
    // (FlatCompat translates its env:{browser,node} into languageOptions.
    // globals). Verified: dropping them changes nothing - 0 errors either
    // way - and importing the `globals` package would BREAK lint here,
    // because this repo installs with pnpm and `globals` sits unhoisted in
    // node_modules/.pnpm, so `import globals from "globals"` cannot resolve.
    // CI (npm install) hoists it and would have passed - a silent local/CI split.
    rules: { "no-undef": "error" },
  },
  {
    // One-off Node ops scripts are CommonJS by design - `require` is correct
    // there, so the rule is relaxed rather than the files skipped entirely.
    files: ["scripts/**/*.js", "scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
