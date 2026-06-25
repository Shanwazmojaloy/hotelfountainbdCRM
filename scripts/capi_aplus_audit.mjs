// scripts/capi_aplus_audit.mjs
// Read-only Advantage+ health audit (Meta Marketing API v25). No writes.
// Flags: insufficient creative volume (<10), 7-day no-touch violations, and MER.
//
// Env:
//   META_MARKETING_TOKEN  system-user token with ads_read
//   META_AD_ACCOUNT_ID    e.g. act_1234567890
//   MER_REVENUE_BDT       (optional) total settled BDT revenue for the window, from the CRM
//   WINDOW_DAYS           (optional) spend window, default 7
//
// Run: node scripts/capi_aplus_audit.mjs

const V = 'v25.0';
const TOKEN = (process.env.META_MARKETING_TOKEN || '').trim();
const ACCT = (process.env.META_AD_ACCOUNT_ID || '').trim();
const WINDOW_DAYS = parseInt(process.env.WINDOW_DAYS || '7', 10);
const REVENUE = parseFloat(process.env.MER_REVENUE_BDT || '0');

if (!TOKEN || !ACCT) {
  console.error('Set META_MARKETING_TOKEN and META_AD_ACCOUNT_ID (act_...).');
  process.exit(1);
}

const api = async (path, params = {}) => {
  const qs = new URLSearchParams({ access_token: TOKEN, ...params }).toString();
  const r = await fetch(`https://graph.facebook.com/${V}/${path}?${qs}`);
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.message} (${path})`);
  return j;
};

const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
const until = new Date().toISOString().slice(0, 10);

(async () => {
  const flags = [];

  // 1. Distinct creative count across active ads.
  const ads = await api(`${ACCT}/ads`, {
    fields: 'id,name,creative{id},effective_status',
    limit: '500',
  });
  const active = (ads.data || []).filter((a) => a.effective_status === 'ACTIVE');
  const creatives = new Set(active.map((a) => a.creative?.id).filter(Boolean));
  console.log(`Active ads: ${active.length} | distinct creatives: ${creatives.size}`);
  if (creatives.size < 10) flags.push(`INSUFFICIENT CREATIVE VOLUME: ${creatives.size} (<10)`);

  // 2. No-touch: any active ad updated in the last 7 days = learning-phase risk.
  const recent = await api(`${ACCT}/ads`, {
    fields: 'id,name,updated_time,effective_status',
    limit: '500',
  });
  const cutoff = Date.now() - 7 * 86400000;
  const touched = (recent.data || []).filter(
    (a) => a.effective_status === 'ACTIVE' && new Date(a.updated_time).getTime() > cutoff,
  );
  if (touched.length) flags.push(`NO-TOUCH VIOLATION: ${touched.length} active ad(s) edited in <7d`);

  // 3. Spend + MER.
  const ins = await api(`${ACCT}/insights`, {
    fields: 'spend',
    time_range: JSON.stringify({ since, until }),
  });
  const spend = parseFloat(ins.data?.[0]?.spend || '0');
  console.log(`Spend (${since}..${until}): ${spend.toFixed(2)}`);
  if (REVENUE > 0 && spend > 0) {
    const mer = REVENUE / spend;
    console.log(`MER: ${mer.toFixed(2)} (revenue ${REVENUE} / spend ${spend.toFixed(2)})`);
    if (mer > 3.5 && creatives.size >= 10 && touched.length === 0) {
      console.log('SUGGESTION: MER > 3.5 with distinct creative + stable account → scale budget ≤20%.');
    }
  } else {
    console.log('MER: set MER_REVENUE_BDT (from CRM) to compute.');
  }

  console.log(flags.length ? `\nFLAGS:\n- ${flags.join('\n- ')}` : '\nNo flags. Account healthy.');
  process.exit(flags.length ? 2 : 0);
})().catch((e) => {
  console.error('Audit failed:', e.message);
  process.exit(1);
});
