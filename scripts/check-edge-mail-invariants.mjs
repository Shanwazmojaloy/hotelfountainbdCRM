#!/usr/bin/env node
// Hotel Fountain — edge-function mail invariants (2026-08-15, audit H-12).
//
// WHY THIS EXISTS
// Every wf-* report function used to POST to https://api.brevo.com against an
// account that had been rejecting sends since ~2026-06-28 while still returning
// 2xx on some paths. The callers then wrote workflow_runs.status = 'success'
// unconditionally, so the CRM Settings health dot stayed green while zero mail
// was delivered. Nobody investigates a green dot.
//
// The remediation moved the reports onto supabase/functions/_shared/mailer.ts
// (Resend), which NEVER throws and returns { ok } so the caller can log the real
// outcome. That contract is only worth anything if it cannot silently rot back.
// This script is the ratchet. Wired into .githooks/pre-commit and CI.
//
// It deliberately does NOT try to be a linter. Four rules, each one a bug that
// actually shipped.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN_DIR = join(root, 'supabase', 'functions');

// Functions that still POST to Resend directly instead of going through
// _shared/mailer.ts. This list may SHRINK, never grow. Each entry is a function
// whose send outcome is not uniformly observable — migrate it to the shared
// mailer and delete its line. A new direct caller fails the build.
const DIRECT_RESEND_ALLOWLIST = new Set([
  'wf-checkout-alerts',
  'wf-guest-emails',
  'wf-seo-lead-morning',
]);

if (!existsSync(FN_DIR)) {
  console.log('✓ mail invariants — no supabase/functions directory, nothing to check');
  process.exit(0);
}

const errors = [];
const warnings = [];

const fnDirs = readdirSync(FN_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== '_shared')
  .map((e) => e.name)
  .sort();

const filesOf = (dir) => {
  const out = [];
  const walk = (d, depth = 0) => {
    if (depth > 2) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
};

for (const fn of fnDirs) {
  for (const file of filesOf(join(FN_DIR, fn))) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1).replace(/\\/g, '/');
    const lines = src.split('\n');

    // ── Rule 1 — the dead Brevo send endpoint, in any form ──────────────────
    lines.forEach((l, i) => {
      if (/api\.brevo\.com/.test(l)) {
        errors.push(
          `${rel}:${i + 1}  posts to api.brevo.com — that account has been rejecting sends ` +
          `since ~2026-06-28. Use supabase/functions/_shared/mailer.ts.`
        );
      }
    });

    // ── Rule 2 — a gmail.com address in a SENDER position ───────────────────
    // Recipients (TO_EMAIL, NOTIFY_EMAIL, ownerEmail) are fine and stay untouched.
    // gmail.com is not a verified Resend domain: a live invoke on 2026-08-15
    // returned "The gmail.com domain is not verified". fountainbd.com is.
    lines.forEach((l, i) => {
      if (!/@gmail\.com/.test(l)) return;
      if (!/\b(from|sender|SENDER)\w*\s*[:=]/i.test(l)) return;
      errors.push(
        `${rel}:${i + 1}  uses a gmail.com address as the SENDER. gmail.com is not a ` +
        `verified Resend domain — the send fails and the report reaches nobody. ` +
        `Use CRM_FROM_EMAIL ?? 'reservations@fountainbd.com'.`
      );
    });

    // ── Rule 3 — calling the shared mailer and ignoring its result ──────────
    // The mailer never throws; ignoring the return value is precisely how a
    // failed send becomes a green health dot.
    if (/\bsendMail\s*\(/.test(src) && !/\.\s*ok\b/.test(src)) {
      errors.push(
        `${rel}  calls sendMail() but never reads .ok anywhere in the file. The mailer ` +
        `never throws — an ignored result means a failed send is logged as success. ` +
        `Branch workflow_runs.status on it.`
      );
    }

    // ── Rule 4 — new direct Resend callers must use the shared mailer ───────
    if (/api\.resend\.com/.test(src) && !DIRECT_RESEND_ALLOWLIST.has(fn)) {
      errors.push(
        `${rel}  POSTs to api.resend.com directly. Use supabase/functions/_shared/mailer.ts ` +
        `so the send outcome is observable the same way everywhere. If this is a ` +
        `deliberate exception, add "${fn}" to DIRECT_RESEND_ALLOWLIST with a reason.`
      );
    }
  }
}

for (const fn of DIRECT_RESEND_ALLOWLIST) {
  if (!existsSync(join(FN_DIR, fn))) {
    warnings.push(`DIRECT_RESEND_ALLOWLIST names "${fn}", which no longer exists — drop the entry.`);
  }
}

for (const w of warnings) console.warn(`! ${w}`);

if (errors.length) {
  console.error('\n✗ EDGE MAIL INVARIANTS — the H-12 failure mode is creeping back:\n');
  for (const e of errors) console.error(`   ${e}\n`);
  console.error('  A green dot in CRM Settings must mean the mail was delivered.\n');
  process.exit(1);
}

console.log(
  `✓ mail invariants hold across ${fnDirs.length} edge functions ` +
  `(${DIRECT_RESEND_ALLOWLIST.size} still bypassing the shared mailer)`
);
