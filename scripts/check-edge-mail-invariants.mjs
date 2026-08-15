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

// Functions that POST to Resend directly instead of going through
// _shared/mailer.ts. This is a DEBT REGISTER, not an approval list: it may
// shrink, never grow. Migrate one to the shared mailer and delete its line.
//
// Seeded at 3 on 2026-08-15, then re-seeded at 10 the same day when the 23
// orphan edge functions — live on the project with no source in this repo —
// were finally pulled down and committed. The jump is not new debt; it is debt
// that already existed becoming visible for the first time.
const DIRECT_RESEND_ALLOWLIST = new Set([
  'wf-checkout-alerts',
  'wf-guest-emails',
  'wf-seo-lead-morning',
  'ceo-escalation-email',
  'content-approval-email',
  'lead-reply-alert',
  'outreach-bot',
  'send-booking-email',
  'send-email',
  'wf-flash-nudge',
]);

// Known, recorded, NOT yet fixed. An entry here is REPORTED but does not fail the
// build. Anything not here does fail. An entry that stops matching also fails, so a
// fix cannot leave a stale excuse behind to quietly cover a future regression.
const KNOWN_VIOLATIONS = [
  {
    file: 'supabase/functions/outreach-bot/index.ts',
    rule: 'sender-gmail',
    why:
      'CONFIRMED LIVE BUG, blocked on a decision, not on effort. outreach-bot falls back to ' +
      'hotellfountainbd@gmail.com when HOTEL_SENDER_EMAIL is unset, and gmail.com is not a ' +
      'verified Resend domain. corporate_leads holds 15 rows with ' +
      '"[SEND-FAIL … The gmail.com domain is not verified]" across 2026-07-21, 08-07, 08-08 ' +
      'and 08-11. Committed as-is on purpose: this file is an archival copy of what is ' +
      'RUNNING, and silently correcting it here would make the repo lie about production. ' +
      'Unblocking it means either setting HOTEL_SENDER_EMAIL in Supabase secrets, or ' +
      'redeploying with the fallback changed — and that second option converts a silently ' +
      'failing outreach campaign into one actively emailing corporate leads, which is the ' +
      'owner\'s call to make, not a maintenance task.',
  },
];

if (!existsSync(FN_DIR)) {
  console.log('✓ mail invariants — no supabase/functions directory, nothing to check');
  process.exit(0);
}

const findings = [];
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
    const add = (rule, line, msg) => findings.push({ rule, file: rel, line, msg });

    // ── Rule 1 — the dead Brevo send endpoint, in any form ──────────────────
    lines.forEach((l, i) => {
      if (/api\.brevo\.com/.test(l)) {
        add('brevo-endpoint', i + 1,
          'posts to api.brevo.com — that account has been rejecting sends since ~2026-06-28. ' +
          'Use supabase/functions/_shared/mailer.ts.');
      }
    });

    // ── Rule 2 — a gmail.com address in a SENDER position ───────────────────
    // Recipients (TO_EMAIL, NOTIFY_EMAIL, ownerEmail) are fine and stay untouched.
    lines.forEach((l, i) => {
      if (!/@gmail\.com/.test(l)) return;
      if (!/\b(from|sender|SENDER)\w*\s*[:=]/i.test(l)) return;
      add('sender-gmail', i + 1,
        'uses a gmail.com address as the SENDER. gmail.com is not a verified Resend domain — ' +
        'the send fails and the mail reaches nobody. Use CRM_FROM_EMAIL ?? ' +
        "'reservations@fountainbd.com'.");
    });

    // ── Rule 3 — calling the shared mailer and ignoring its result ──────────
    if (/\bsendMail\s*\(/.test(src) && !/\.\s*ok\b/.test(src)) {
      add('ignored-mail-result', null,
        'calls sendMail() but never reads .ok anywhere in the file. The mailer never throws — ' +
        'an ignored result means a failed send is logged as success.');
    }

    // ── Rule 4 — new direct Resend callers must use the shared mailer ───────
    if (/api\.resend\.com/.test(src) && !DIRECT_RESEND_ALLOWLIST.has(fn)) {
      add('direct-resend', null,
        'POSTs to api.resend.com directly. Use supabase/functions/_shared/mailer.ts so the send ' +
        `outcome is observable the same way everywhere. If deliberate, add "${fn}" to ` +
        'DIRECT_RESEND_ALLOWLIST with a reason.');
    }
  }
}

// ── split findings into known (reported) and new (fatal) ────────────────────
const matches = (f, k) => f.file === k.file && f.rule === k.rule;
const known = [];
const fresh = [];
for (const f of findings) {
  (KNOWN_VIOLATIONS.some((k) => matches(f, k)) ? known : fresh).push(f);
}
const stale = KNOWN_VIOLATIONS.filter((k) => !findings.some((f) => matches(f, k)));

for (const fn of DIRECT_RESEND_ALLOWLIST) {
  if (!existsSync(join(FN_DIR, fn))) {
    warnings.push(`DIRECT_RESEND_ALLOWLIST names "${fn}", which no longer exists — drop the entry.`);
  }
}

if (known.length) {
  console.warn(`\n! ${known.length} KNOWN unfixed issue(s), recorded in KNOWN_VIOLATIONS:\n`);
  for (const f of known) {
    const k = KNOWN_VIOLATIONS.find((x) => matches(f, x));
    console.warn(`   ${f.file}${f.line ? ':' + f.line : ''}  [${f.rule}]`);
    console.warn(`     ${k.why}\n`);
  }
}
for (const w of warnings) console.warn(`! ${w}`);

if (stale.length) {
  console.error('\n✗ EDGE MAIL INVARIANTS — stale KNOWN_VIOLATIONS entries:\n');
  for (const k of stale) console.error(`   ${k.file}  [${k.rule}] no longer matches — delete the entry.`);
  console.error('\n  A fixed bug must not leave its excuse behind; the next regression would inherit it.\n');
}

if (fresh.length) {
  console.error('\n✗ EDGE MAIL INVARIANTS — the H-12 failure mode is creeping back:\n');
  for (const f of fresh) console.error(`   ${f.file}${f.line ? ':' + f.line : ''}  ${f.msg}\n`);
  console.error('  A green dot in CRM Settings must mean the mail was delivered.\n');
}

if (fresh.length || stale.length) process.exit(1);

console.log(
  `✓ mail invariants hold across ${fnDirs.length} edge functions ` +
  `(${DIRECT_RESEND_ALLOWLIST.size} bypassing the shared mailer, ${known.length} known issue(s))`
);
