#!/usr/bin/env node
// Hotel Fountain — edge deploy-manifest guard (2026-08-15, audit follow-up).
//
// WHY THIS EXISTS
// Supabase edge functions do not deploy from git. `git push` does nothing to them.
// So the committed source and the running source drift apart silently, and every
// review done from the repo is then wrong in an unknowable direction. The
// 2026-08-15 audit hit this twice: it overstated four criticals that had already
// been fixed in prod, and then the remediation itself deployed a corrected mail
// sender ~20 minutes before committing it.
//
// supabase/functions/DEPLOYED.json records the source bytes that were actually
// deployed. This script fails when a listed function's source no longer matches,
// which means exactly one thing: you edited it and did not redeploy.
//
// It cannot detect the opposite direction (deployed without committing) — nothing
// local can. That is what the manifest's deployed_without_source list is for.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(root, 'supabase', 'functions', 'DEPLOYED.json');

if (!existsSync(MANIFEST)) {
  console.error('✗ supabase/functions/DEPLOYED.json is missing — the edge deploy manifest is the only record of what is running.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// CR bytes stripped so a Windows checkout and a Linux CI runner agree.
const hashOf = (p) => createHash('sha256').update(readFileSync(p, 'utf8').replace(/\r/g, '')).digest('hex');

const stale = [];
const missing = [];

const sections = { ...(manifest.verified ?? {}), ...(manifest.tracked ?? {}) };
for (const [name, entry] of Object.entries(sections)) {
  const abs = join(root, entry.path);
  if (!existsSync(abs)) {
    missing.push({ name, path: entry.path });
    continue;
  }
  const actual = hashOf(abs);
  if (actual !== entry.sha256) {
    stale.push({ name, entry, actual });
  }
}

if (missing.length) {
  console.error('\n✗ EDGE DEPLOY MANIFEST — these are listed as deployed but the source is gone:\n');
  for (const m of missing) console.error(`   ${m.name}  →  ${m.path}`);
  console.error('\n  Either restore the file or remove its entry from DEPLOYED.json.\n');
}

if (stale.length) {
  console.error('\n✗ EDGE DEPLOY MANIFEST — source changed but the function was not redeployed:\n');
  for (const s of stale) {
    console.error(`   ${s.name}`);
    console.error(`     ${s.entry.path}`);
    console.error(`     deployed v${s.entry.version ?? '?'} on ${s.entry.deployed_at}: ${s.entry.sha256.slice(0, 16)}…`);
    console.error(`     working tree now:                    ${s.actual.slice(0, 16)}…`);
    if (s.entry.note) console.error(`     note: ${s.entry.note}`);
    console.error('');
  }
  console.error('  `git push` does NOT deploy edge functions. Deploy, confirm it actually runs,');
  console.error('  then update the sha256/version/deployed_at in supabase/functions/DEPLOYED.json.');
  console.error('  A clean deploy is not proof — invoke it once and check the result.\n');
}

if (stale.length || missing.length) process.exit(1);

const orphans = manifest.deployed_without_source?.slugs?.length ?? 0;
console.log(
  `✓ edge deploy manifest matches for ${Object.keys(sections).length} tracked files` +
  (orphans ? ` (${orphans} deployed functions still have no source in this repo)` : '')
);
