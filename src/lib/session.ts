// session.ts — server-only signed session for Phase 3 write enforcement.
// A staff login (/api/crm/login) mints an HMAC-signed token stored in an HttpOnly
// cookie (lumea_sess). Protected write routes call requireSession(req) to verify it
// before performing a service-role write. HMAC secret = SESSION_SECRET (fallback to the
// service-role key, which is always present server-side). Never import this client-side.
import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAX_AGE_S = 60 * 60 * 12; // 12h
export const SESSION_COOKIE = 'lumea_sess';

export type Session = { id: number; role: string; session_v: number };

const b64u = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signSession(p: Session): string {
  const body = b64u(JSON.stringify({ id: p.id, role: p.role, session_v: p.session_v, iat: Date.now() }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token?: string | null): Session | null {
  if (!token || !SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof p.iat === 'number' && Date.now() - p.iat > MAX_AGE_S * 1000) return null;
    return { id: p.id, role: p.role, session_v: p.session_v };
  } catch { return null; }
}

export function requireSession(req: Request): Session | null {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + SESSION_COOKIE + '=([^;]+)'));
  return verifySession(m ? decodeURIComponent(m[1]) : null);
}

export function sessionCookieHeader(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${MAX_AGE_S}`,
  ];
  return parts.join('; ');
}
