'use client';
// =============================================================================
// Billing transport — all billing traffic goes through /api/crm/billing.
//
// Added 2026-08-15 (audit S-1). These hooks used to hit PostgREST directly with
// the publishable key, with the tenant taken from an `x-tenant-host` header the
// caller controls and RLS policies that never checked whether anyone was signed
// in. The route this file talks to re-checks the staff session cookie and
// session_v on every call and runs tenant-scoped server-side.
//
// `credentials: 'same-origin'` is what carries the session cookie. Without it
// every call 401s.
// =============================================================================

const BASE = '/api/crm/billing';

async function unwrap(res: Response, label: string) {
  let payload: Record<string, unknown> = {};
  try { payload = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    throw new Error(`[${label}] ${String(payload.error ?? `HTTP ${res.status}`)}`);
  }
  return payload;
}

export async function billingGet(
  view: 'ledger' | 'invoice' | 'invoice_detail' | 'payments',
  params: Record<string, string>,
  label: string,
) {
  const qs = new URLSearchParams({ view, ...params }).toString();
  const res = await fetch(`${BASE}?${qs}`, { credentials: 'same-origin' });
  return unwrap(res, label);
}

export async function billingPost(
  action: 'ensure_invoice' | 'charge' | 'payment' | 'void' | 'expand' | 'issue_invoice' | 'checkout',
  body: Record<string, unknown>,
  label: string,
) {
  const res = await fetch(BASE, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return unwrap(res, label);
}
