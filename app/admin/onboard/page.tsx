'use client';
// ─────────────────────────────────────────────────────────────────────────────
// Lumea — /admin/onboard
// Password-gated hotel onboarding form.
// Calls POST /api/admin/onboard-tenant with Bearer ADMIN_SECRET.
// Deploy new hotel in ~2 minutes from this page.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, FormEvent } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface OnboardResult {
  ok: boolean;
  tenant_id: string;
  slug: string;
  cron_secret: string;
  subdomain: string;
  next_steps: string[];
}

// ── Field definitions ─────────────────────────────────────────────────────────
const IDENTITY_FIELDS = [
  { name: 'slug',              label: 'Subdomain Slug',     placeholder: 'grandpalace',                      required: true,  hint: 'Lowercase, no spaces. Becomes grandpalace.lumea.app' },
  { name: 'plan_tier',         label: 'Plan',               placeholder: '',                                 required: true,  hint: 'starter | growth | full', select: true },
  { name: 'hotel_name',        label: 'Hotel Name',         placeholder: 'Grand Palace Hotel',               required: true,  hint: '' },
  { name: 'hotel_location',    label: 'Location (short)',   placeholder: 'Gulshan · Dhaka · Airport Area',   required: true,  hint: 'Shown in email headers and outreach' },
  { name: 'hotel_address',     label: 'Full Address',       placeholder: '45 Gulshan Ave, Dhaka-1212',       required: true,  hint: '' },
  { name: 'hotel_phone',       label: 'Phone',              placeholder: '+880 1700-000000',                 required: true,  hint: '' },
  { name: 'hotel_whatsapp',    label: 'WhatsApp (digits)',  placeholder: '8801700000000',                    required: false, hint: 'No + prefix' },
  { name: 'hotel_city',        label: 'City',               placeholder: 'Dhaka',                           required: false, hint: 'For hashtags and social posts' },
  { name: 'hotel_room_count',  label: 'Room Count',         placeholder: '24',                              required: false, hint: '' },
  { name: 'hotel_description', label: 'Hotel Description',  placeholder: 'Grand Palace Hotel, a boutique hotel in Gulshan', required: false, hint: 'Used by CEO Auditor AI prompt' },
  { name: 'hotel_email',       label: 'Sender Email',       placeholder: 'ops@grandpalace.com',             required: true,  hint: 'Must be verified in Brevo' },
  { name: 'sender_name',       label: 'Sender Name',        placeholder: 'Karim — Grand Palace Hotel',      required: true,  hint: 'Format: FirstName — Hotel Name' },
  { name: 'alert_email',       label: 'Alert Email',        placeholder: 'owner@grandpalace.com',           required: true,  hint: 'Receives system alerts and deal notifications' },
  { name: 'alert_name',        label: 'Alert Name',         placeholder: 'Karim',                           required: true,  hint: '' },
];

const SECRET_FIELDS = [
  { name: 'brevo_api_key',        label: 'Brevo API Key',       placeholder: 'xkeysib-...',       hint: 'From Brevo → SMTP & API → API Keys' },
  { name: 'gmail_user',           label: 'Gmail User',          placeholder: 'ops@grandpalace.com', hint: 'For reply-intake IMAP polling' },
  { name: 'gmail_app_password',   label: 'Gmail App Password',  placeholder: '16-char app pass',  hint: 'Google account → Security → App passwords' },
  { name: 'facebook_page_token',  label: 'Facebook Page Token', placeholder: 'EAA...',            hint: 'Long-lived Page Access Token' },
  { name: 'facebook_page_id',     label: 'Facebook Page ID',    placeholder: '1234567890',        hint: '' },
  { name: 'anthropic_api_key',    label: 'Anthropic API Key',   placeholder: 'sk-ant-...',        hint: 'For CEO Auditor scoring' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function OnboardPage() {
  const [adminSecret, setAdminSecret]   = useState('');
  const [authed, setAuthed]             = useState(false);
  const [authError, setAuthError]       = useState('');
  const [form, setForm]                 = useState<Record<string, string>>({ plan_tier: 'starter' });
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [result, setResult]             = useState<OnboardResult | null>(null);
  const [copied, setCopied]             = useState<string | null>(null);

  // ── Auth gate ───────────────────────────────────────────────────────────
  function handleAuth(e: FormEvent) {
    e.preventDefault();
    if (!adminSecret.trim()) { setAuthError('Enter admin secret'); return; }
    // We don't validate the secret here — the API call will 401 if wrong.
    setAuthed(true);
    setAuthError('');
  }

  // ── Form submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/admin/onboard-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSecret}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setResult(data as OnboardResult);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // ── Auth screen ─────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>Lumea<span style={styles.dot}>.</span></div>
          <div style={styles.subtitle}>Admin — Tenant Onboarding</div>
          <form onSubmit={handleAuth} style={{ marginTop: 28 }}>
            <label style={styles.label}>Admin Secret</label>
            <input
              type="password"
              value={adminSecret}
              onChange={e => setAdminSecret(e.target.value)}
              placeholder="ADMIN_SECRET from Vercel env"
              style={styles.input}
              autoFocus
            />
            {authError && <div style={styles.errorBox}>{authError}</div>}
            <button type="submit" style={styles.btnLime}>Enter →</button>
          </form>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (result) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 680 }}>
          <div style={styles.successBadge}>✓ Tenant Created</div>
          <div style={styles.logo}>Lumea<span style={styles.dot}>.</span></div>
          <div style={{ color: '#C8FF00', fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
            {result.subdomain}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 28 }}>
            Subdomain is live once DNS + Vercel wildcard domain are configured
          </div>

          {/* Key values */}
          {[
            { label: 'Tenant ID',    value: result.tenant_id },
            { label: 'Slug',         value: result.slug },
            { label: 'Cron Secret',  value: result.cron_secret },
          ].map(({ label, value }) => (
            <div key={label} style={styles.kv}>
              <div style={styles.kvLabel}>{label}</div>
              <div style={styles.kvRow}>
                <code style={styles.kvValue}>{value}</code>
                <button
                  onClick={() => copyToClipboard(value, label)}
                  style={styles.copyBtn}
                >
                  {copied === label ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          ))}

          <div style={styles.divider} />

          {/* Next steps */}
          <div style={styles.stepsTitle}>Next Steps</div>
          {result.next_steps.map((step, i) => (
            <div key={i} style={styles.step}>
              <div style={styles.stepNum}>{i + 1}</div>
              <div style={styles.stepText}>{step.replace(/^\d+\. /, '')}</div>
            </div>
          ))}

          <button
            onClick={() => { setResult(null); setForm({ plan_tier: 'starter' }); }}
            style={{ ...styles.btnGhost, marginTop: 28 }}
          >
            + Onboard another hotel
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 720 }}>
        <div style={styles.logo}>Lumea<span style={styles.dot}>.</span></div>
        <div style={styles.subtitle}>New Hotel Onboarding</div>

        <form onSubmit={handleSubmit}>
          {/* ── Identity fields ── */}
          <div style={styles.sectionLabel}>Hotel Identity</div>
          <div style={styles.grid}>
            {IDENTITY_FIELDS.map(f => (
              <div key={f.name} style={f.name === 'hotel_description' ? { gridColumn: '1/-1' } : {}}>
                <label style={styles.label}>
                  {f.label}
                  {f.required && <span style={{ color: '#C8FF00' }}> *</span>}
                </label>
                {f.select ? (
                  <select
                    value={form[f.name] ?? 'starter'}
                    onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                    style={styles.input}
                  >
                    <option value="starter">Starter — Room matrix + billing</option>
                    <option value="growth">Growth — + AI outreach agents</option>
                    <option value="full">Full — + LinkedIn prospecting</option>
                  </select>
                ) : (
                  <input
                    type={f.name.includes('email') ? 'email' : 'text'}
                    value={form[f.name] ?? ''}
                    onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                    placeholder={f.placeholder}
                    required={f.required}
                    style={styles.input}
                  />
                )}
                {f.hint && <div style={styles.hint}>{f.hint}</div>}
              </div>
            ))}
          </div>

          {/* ── Secrets ── */}
          <div style={{ ...styles.sectionLabel, marginTop: 32 }}>
            Secrets <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, fontSize: 11 }}>Optional — can be added later via Supabase</span>
          </div>
          <div style={styles.grid}>
            {SECRET_FIELDS.map(f => (
              <div key={f.name}>
                <label style={styles.label}>{f.label}</label>
                <input
                  type="password"
                  value={form[f.name] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={styles.input}
                  autoComplete="new-password"
                />
                {f.hint && <div style={styles.hint}>{f.hint}</div>}
              </div>
            ))}
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          <button type="submit" disabled={loading} style={{ ...styles.btnLime, marginTop: 32, width: '100%' }}>
            {loading ? 'Creating tenant…' : 'Create Tenant + Go Live →'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Inline styles (no Tailwind dependency) ────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0D0D0D',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '60px 24px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  card: {
    background: '#141414',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '40px 44px',
    width: '100%',
    maxWidth: 560,
  },
  logo: {
    fontSize: 28,
    fontWeight: 900,
    color: '#fff',
    letterSpacing: '-0.03em',
    marginBottom: 4,
  },
  dot: { color: '#C8FF00' },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    paddingBottom: 10,
    marginBottom: 20,
    marginTop: 8,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px 20px',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  hint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 4,
    lineHeight: 1.5,
  },
  btnLime: {
    background: '#C8FF00',
    color: '#0D0D0D',
    border: 'none',
    borderRadius: 8,
    padding: '13px 24px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'block',
    fontFamily: 'inherit',
  },
  btnGhost: {
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '11px 24px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  errorBox: {
    background: 'rgba(255,59,59,0.1)',
    border: '1px solid rgba(255,59,59,0.3)',
    borderRadius: 8,
    color: '#ff7070',
    fontSize: 13,
    padding: '10px 14px',
    marginTop: 16,
  },
  successBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(200,255,0,0.1)',
    border: '1px solid rgba(200,255,0,0.25)',
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 12px',
    borderRadius: 100,
    marginBottom: 16,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  kv: { marginBottom: 14 },
  kvLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  kvRow: { display: 'flex', alignItems: 'center', gap: 10 },
  kvValue: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: '#fff',
    background: 'rgba(255,255,255,0.05)',
    padding: '6px 10px',
    borderRadius: 6,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  copyBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.5)',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '24px 0',
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 14,
  },
  step: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 8,
    background: '#0D0D0D',
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  stepText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.65,
    paddingTop: 4,
  },
};
