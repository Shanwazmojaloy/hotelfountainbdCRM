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

// The Deno edge functions were only half the mail surface. Three Next.js routes
// under app/api/agents/ were still POSTing to the dead Brevo account on
// 2026-08-15, six weeks into the outage, and this guard could not see them
// because it only ever looked at supabase/functions. A ratchet with a blind spot
// over half the senders is not a ratchet.
const APP_DIRS = [join(root, 'app', 'api'), join(root, 'src', 'lib')];

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
  // Verified on the Vercel dashboard 2026-08-15: HOTEL_SENDER_EMAIL IS set for
  // Production, Preview and Development. The `|| 'hotellfountainbd@gmail.com'`
  // fallback in these files is therefore dead code on Vercel, NOT a live failure —
  // unlike the Supabase edge side, where the same variable is absent and the
  // fallback is what outreach-bot actually sends from.
  //
  // Recorded rather than fixed because the value behind that variable is masked; it
  // is set, but nobody outside the dashboard can see what to. Left as a warning so
  // the fallback is deleted rather than trusted.
  ...[
    'app/api/agents/deal-alert/route.ts',
    'app/api/agents/fb-token-check/route.ts',
    'app/api/agents/follow-up-bot/route.ts',
    'app/api/agents/payment-confirm/route.ts',
    'app/api/agents/reply-digest/route.ts',
    'src/lib/changeNotify.ts',
  ].map((f) => ({
    file: f,
    rule: 'sender-gmail',
    why:
      'Dead fallback, not a live bug. HOTEL_SENDER_EMAIL is set in Vercel for all three ' +
      'environments, so the gmail default never applies here. It is still a trap: the same ' +
      'pattern on the Supabase side, where the variable is NOT set, is what has been failing ' +
      'outreach sends since July. Delete the fallback rather than relying on an env var staying set.',
  })),
  // deal-alert migrated to Google Workspace SMTP on 2026-08-15 and removed from this list.
  ...['follow-up-bot', 'outreach-bot'].map((r) => ({
    file: `app/api/agents/${r}/route.ts`,
    rule: 'brevo-endpoint',
    why:
      'STILL ON THE DEAD BREVO ACCOUNT. The 2026-08-15 H-12 remediation moved the five Deno ' +
      'report functions, reply-digest, fb-token-check and changeNotify off Brevo, and stopped ' +
      'there. Three Next.js routes were missed, and the guard written to prevent exactly this ' +
      'only scanned supabase/functions, so it did not catch them either. deal-alert was ' +
      'migrated to Google Workspace SMTP on 2026-08-15 because it emails only the owner. ' +
      'These two email real corporate leads, so moving them to a working transport turns a ' +
      'silently failing campaign into a sending one - the same decision that gates the ' +
      'outreach-bot edge function. Both run on daily Vercel crons (04:00 and 03:00 UTC) that ' +
      'were re-enabled on 2026-08-15.',
  })),
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

const filesOf = (dir, maxDepth = 2) => {
  const out = [];
  const walk = (d, depth = 0) => {
    if (depth > maxDepth) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
};

const targets = [];
for (const fn of fnDirs) for (const f of filesOf(join(FN_DIR, fn))) targets.push({ file: f, fn, isEdge: true });
for (const d of APP_DIRS) if (existsSync(d)) for (const f of filesOf(d, 6)) targets.push({ file: f, fn: null, isEdge: false });

{
  for (const { file, fn, isEdge } of targets) {
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
        'has a gmail.com address in a SENDER position. gmail.com is not a verified Resend ' +
        'domain, so if this value is ever the one used, the send fails and the mail reaches ' +
        'nobody. NOTE: where this is an `env || gmail` fallback, whether it bites depends on ' +
        'the env var being set in that environment — which this script cannot see. Verify ' +
        'before calling it live. Prefer removing the fallback outright.');
    });

    // ── Rule 3 — calling the shared mailer and ignoring its result ──────────
    if (isEdge && /\bsendMail\s*\(/.test(src) && !/\.\s*ok\b/.test(src)) {
      add('ignored-mail-result', null,
        'calls sendMail() but never reads .ok anywhere in the file. The mailer never throws — ' +
        'an ignored result means a failed send is logged as success.');
    }

    // ── Rule 4 — new direct Resend callers must use the shared mailer ───────
    if (isEdge && /api\.resend\.com/.test(src) && !DIRECT_RESEND_ALLOWLIST.has(fn)) {
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
  `✓ mail invariants hold across ${fnDirs.length} edge functions and ${targets.filter((t) => !t.isEdge).length} app files ` +
  `(${DIRECT_RESEND_ALLOWLIST.size} bypassing the shared mailer, ${known.length} known issue(s))`
);
