#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// import-vibe-leads.js  (CommonJS)
// Imports Vibe Prospecting CSV exports → corporate_leads (Supabase)
//
// Usage:
//   node scripts/import-vibe-leads.js                        ← reads leads/ dir
//   node scripts/import-vibe-leads.js --dir leads/
//   node scripts/import-vibe-leads.js --files leads/ngo_ingo.csv leads/rmg_garment.csv
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (write access needed)
//   NEXT_PUBLIC_TENANT_ID       (optional, has fallback)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// Load env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

// ── Config ───────────────────────────────────────────────────────────────────
// Both NEXT_PUBLIC_ — client-safe, hardcoded as fallbacks so the script
// works even without a .env.local file present on this machine.
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
             || 'https://mynwfkgksqqwlqowlscj.supabase.co';
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
             || 'sb_publishable_YVx6y5ai5WXlZZ9jhCLugQ_67DaIVsh';
const TENANT  = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8';

const supabase = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ── CSV parser ───────────────────────────────────────────────────────────────
function splitRow(row) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') { if (inQ && row[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  const headers = splitRow(lines[0]);
  return lines.slice(1).map(l => {
    const v = splitRow(l);
    return Object.fromEntries(headers.map((h, i) => [h, (v[i] ?? '').trim()]));
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function toTitle(s) {
  return (s || '').replace(/\b\w/g, c => c.toUpperCase());
}

function industryFromFile(fp) {
  const n = path.basename(fp).toLowerCase();
  if (/rmg|garment|apparel|textile/.test(n))   return 'RMG / Garment';
  if (/pharma|health/.test(n))                 return 'Pharmaceutical / Healthcare';
  if (/ngo|ingo|nonprofit|development/.test(n)) return 'NGO / INGO';
  return 'Corporate';
}

function mapRow(row, industry) {
  const email  = (row.contact_professions_email || '').toLowerCase().trim();
  const status = row.contact_professional_email_status || '';
  if (!email || status === 'invalid') return null;

  const company = (row.prospect_company_name || '').trim();
  if (!company) return null;

  return {
    tenant_id:       TENANT,
    company_name:    toTitle(company),
    contact_name:    toTitle(row.prospect_full_name || ''),
    contact_title:   toTitle(row.prospect_job_title || ''),
    contact_email:   email,
    contact_phone:   row.contact_mobile_phone || null,
    company_website: row.prospect_company_website || null,
    industry,
    icp_score:       status === 'valid' ? 'good' : 'partial',
    priority:        industry === 'NGO / INGO' ? 'high' : 'med',
    status:          'pending',
    notes:           row.prospect_linkedin ? `Source: Vibe Prospecting\nLinkedIn: ${row.prospect_linkedin}` : 'Source: Vibe Prospecting',
  };
}

function resolveFiles() {
  const args  = process.argv.slice(2);
  const files = [];

  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1) {
    const dir = path.resolve(__dirname, '..', args[dirIdx + 1]);
    fs.readdirSync(dir).filter(f => f.endsWith('.csv')).forEach(f => files.push(path.join(dir, f)));
  }

  const fIdx = args.indexOf('--files');
  if (fIdx !== -1) {
    args.slice(fIdx + 1).filter(a => !a.startsWith('--'))
      .forEach(f => files.push(path.resolve(__dirname, '..', f)));
  }

  if (!files.length) {
    const def = path.resolve(__dirname, '..', 'leads');
    if (fs.existsSync(def)) {
      fs.readdirSync(def).filter(f => f.endsWith('.csv')).forEach(f => files.push(path.join(def, f)));
    }
  }

  if (!files.length) {
    console.error('\n❌  No CSV files found.\n\nUsage:\n  node scripts/import-vibe-leads.js                 ← reads leads/*.csv\n  node scripts/import-vibe-leads.js --dir leads/\n  node scripts/import-vibe-leads.js --files leads/ngo_ingo.csv\n');
    process.exit(1);
  }
  return files;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const files = resolveFiles();
  console.log(`\n📂  Processing ${files.length} file(s):`);
  files.forEach(f => console.log(`    • ${path.basename(f)}`));
  console.log('');

  const rows      = [];
  const seenEmail = new Set();

  for (const fp of files) {
    const industry = industryFromFile(fp);
    const raw      = parseCSV(fs.readFileSync(fp, 'utf8'));
    let ok = 0, skip = 0;

    for (const r of raw) {
      const mapped = mapRow(r, industry);
      if (!mapped)                          { skip++; continue; }
      if (seenEmail.has(mapped.contact_email)) { skip++; continue; }
      seenEmail.add(mapped.contact_email);
      rows.push(mapped);
      ok++;
    }
    console.log(`  [${industry}]  ${path.basename(fp)}: ✅ ${ok} valid  ⏭  ${skip} skipped`);
  }

  if (!rows.length) {
    console.log('\n⚠️   No valid rows to import.\n');
    return;
  }

  console.log(`\n⬆️   Upserting ${rows.length} unique leads → corporate_leads…\n`);

  // Send in chunks of 50 via SECURITY DEFINER RPC (works with anon key)
  const CHUNK = 50;
  let inserted = 0, dupes = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk     = rows.slice(i, i + CHUNK);
    const chunkNum  = Math.ceil(i / CHUNK) + 1;
    const { data, error } = await supabase
      .rpc('import_corporate_leads', { p_leads: chunk });

    if (error) {
      console.error(`  ❌ chunk ${chunkNum} error:`, error.message);
    } else {
      const n = typeof data === 'number' ? data : chunk.length;
      inserted += n;
      dupes    += chunk.length - n;
      console.log(`  chunk ${chunkNum}: ${n} inserted, ${chunk.length - n} already existed`);
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅  Inserted  : ${inserted}`);
  console.log(`⏭   Skipped   : ${dupes} (already in DB)`);
  console.log(`📊  Total     : ${rows.length}`);
  console.log('\n🤖  OutreachBot picks up status=pending leads every 9AM BDT.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
