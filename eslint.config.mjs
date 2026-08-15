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
    // One-off Node ops scripts are CommonJS by design - `require` is correct
    // there, so the rule is relaxed rather than the files skipped entirely.
    files: ["scripts/**/*.js", "scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
