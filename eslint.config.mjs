import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Archived prototype artifacts at repo root.
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
  ]),
]);

export default eslintConfig;
