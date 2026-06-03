// ─────────────────────────────────────────────────────────────────────────────
// Lumea — Audit Payload Sanitizer
//
// Strips secrets, credentials and obvious PII before any payload is written
// to audit_logs or stdout. Operates on a deep-cloned copy — never mutates the
// caller's object. Truncates large strings to keep rows under PG's TOAST line.
//
// Defense-in-depth: even if a route handler passes the raw request body, no
// password / token / API key reaches the log sink.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /bearer/i,
  /cookie/i,
  /session/i,
  /otp/i,
  /credit[_-]?card/i,
  /cvv/i,
  /cvc/i,
  /pan\b/i,
  /ssn/i,
  /private[_-]?key/i,
];

// Values that *look* like secrets even if the key is innocuous.
const SECRET_VALUE_PATTERNS = [
  /^sk-[A-Za-z0-9_-]{20,}$/,         // OpenAI / Anthropic style
  /^xox[abp]-[A-Za-z0-9-]{10,}$/,    // Slack
  /^ghp_[A-Za-z0-9]{30,}$/,          // GitHub PAT
  /^EAA[A-Za-z0-9]{50,}$/,           // Facebook long-lived
  /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, // JWT
];

const REDACTED = '[REDACTED]';
const MAX_STRING_LEN = 2_000;
const MAX_DEPTH = 6;

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some(r => r.test(key));
}

function looksLikeSecretValue(v: string): boolean {
  return SECRET_VALUE_PATTERNS.some(r => r.test(v));
}

function clip(s: string): string {
  return s.length > MAX_STRING_LEN ? `${s.slice(0, MAX_STRING_LEN)}…[+${s.length - MAX_STRING_LEN}]` : s;
}

export function sanitizePayload(input: unknown, depth = 0): Record<string, unknown> {
  if (depth > MAX_DEPTH) return { _truncated: 'max_depth' };
  if (input === null || input === undefined) return {};
  if (typeof input !== 'object') return { value: clip(String(input)) };

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isSecretKey(k)) { out[k] = REDACTED; continue; }

    if (typeof v === 'string') {
      out[k] = looksLikeSecretValue(v) ? REDACTED : clip(v);
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 50).map(item =>
        typeof item === 'object' && item !== null ? sanitizePayload(item, depth + 1) : item
      );
    } else if (typeof v === 'object') {
      out[k] = sanitizePayload(v, depth + 1);
    }
    // functions / symbols / undefined → dropped
  }
  return out;
}
