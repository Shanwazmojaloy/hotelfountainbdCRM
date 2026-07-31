#!/usr/bin/env node
// Hotel Fountain — edge-allowlist guard (2026-07-31).
//
// middleware.ts answers any UNKNOWN path with a tiny edge 404 (bot-probe defense,
// commit 6641b63). The cost of that design: every NEW top-level route or public
// file must be added to EDGE_EXACT/EDGE_PREFIXES or it 404s in production.
// This script makes that impossible to forget: it derives the expected route
// surface from app/ and public/ and FAILS the commit if the allowlist misses
// anything. Wired into .githooks/pre-commit.
//
// Skipped automatically: app/ dirs with no page.*/route.* (shared code), image
// files the middleware matcher never sees (svg png jpg jpeg gif webp + favicon).

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mw = readFileSync(join(root, 'middleware.ts'), 'utf8');

// ── parse the allowlist out of middleware.ts ─────────────────────────────────
function block(name) {
  const i = mw.indexOf(name);
  if (i < 0) throw new Error(name + ' not found in middleware.ts');
  const open = mw.indexOf(name === 'EDGE_EXACT' ? '[' : '[', i);
  const close = mw.indexOf(']', open);
  return [...mw.slice(open, close).matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
}
const EXACT = new Set(block('EDGE_EXACT'));
const PREFIXES = block('EDGE_PREFIXES');
const covered = (p) => EXACT.has(p) || PREFIXES.some((pre) => p === pre || p.startsWith(pre + '/'));

// ── derive the expected surface ──────────────────────────────────────────────
const IMG_RE = /\.(svg|png|jpe?g|gif|webp|ico)$/i; // middleware matcher never sees these
const hasRouteFile = (dir, depth = 0) => {
  if (depth > 4) return false;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  for (const e of entries) {
    if (e.isFile() && /^(page|route)\.(tsx?|jsx?|js|mjs)$/.test(e.name)) return true;
    if (e.isDirectory() && hasRouteFile(join(dir, e.name), depth + 1)) return true;
  }
  return false;
};

const expected = []; // [path, origin]
// app/: top-level segments (route groups "(x)" expand their children to root level)
for (const e of readdirSync(join(root, 'app'), { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const full = join(root, 'app', e.name);
  if (e.name.startsWith('(')) {
    for (const c of readdirSync(full, { withFileTypes: true })) {
      if (c.isDirectory() && hasRouteFile(join(full, c.name))) expected.push(['/' + c.name, `app/${e.name}/${c.name}`]);
    }
  } else if (hasRouteFile(full)) {
    expected.push(['/' + e.name, 'app/' + e.name]);
  }
}
// app-level file conventions that become routes (sitemap.ts, robots.ts …)
for (const [f, p] of [['sitemap', '/sitemap.xml'], ['robots', '/robots.txt'], ['manifest', '/manifest.webmanifest']]) {
  for (const g of [`app/${f}.ts`, `app/(site)/${f}.ts`, `app/${f}.js`]) {
    if (existsSync(join(root, g))) expected.push([p, g]);
  }
}
// public/: top-level entries (dirs → prefixes, files → exacts; images skipped)
for (const e of readdirSync(join(root, 'public'), { withFileTypes: true })) {
  if (e.name.startsWith('.')) continue;
  if (e.isDirectory()) expected.push(['/' + e.name, 'public/' + e.name + '/']);
  else if (!IMG_RE.test(e.name)) expected.push(['/' + e.name, 'public/' + e.name]);
}

// ── verify ───────────────────────────────────────────────────────────────────
const misses = expected.filter(([p]) => !covered(p));
if (misses.length) {
  console.error('\n✗ EDGE ALLOWLIST GUARD — these routes/files exist but middleware.ts would 404 them:\n');
  for (const [p, origin] of misses) console.error(`   ${p}   (from ${origin})`);
  console.error('\n  Add them to EDGE_EXACT or EDGE_PREFIXES in middleware.ts (see the EDGE 404 block).\n');
  process.exit(1);
}
console.log(`✓ edge allowlist covers all ${expected.length} derived routes/files`);
