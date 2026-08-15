// ---------------------------------------------------------------------------
// Shared edge-function mailer  -  Resend
//
// WHY THIS EXISTS (audit 2026-08-15, H-12)
// Every wf-* report function used to POST directly to https://api.brevo.com. That
// account was never validated and has been rejecting sends with
// "SMTP account is not yet activated" (permission_denied) since at least 2026-06-28 --
// while still returning a 2xx envelope on some paths. Several callers then wrote
// workflow_runs.status = 'success' unconditionally, so the CRM Settings health dot
// stayed green while zero mail was delivered. That is the worst possible failure
// mode: it is indistinguishable from working, so nobody investigates.
//
// wf-checkout-alerts, wf-guest-emails and wf-seo-lead-morning were already moved to
// Resend. This module is that same path, factored out so the remaining report
// functions cannot drift back.
//
// Contract: NEVER throws. Returns { ok } so the caller can log the real outcome.
// A caller that ignores the return value reintroduces exactly the bug this fixes.
// ---------------------------------------------------------------------------

export interface MailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
}

/** Strip tags for a plain-text alternative when the caller has not supplied one. */
function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function sendMail(args: SendArgs): Promise<MailResult> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    // Fail loudly in the return value rather than silently no-opping.
    return { ok: false, error: 'RESEND_API_KEY is not configured' };
  }

  const fromName = args.fromName ?? 'Hotel Fountain CRM';
  const fromEmail = args.fromEmail ?? Deno.env.get('CRM_FROM_EMAIL') ?? 'reservations@fountainbd.com';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text ?? htmlToText(args.html),
      }),
    });

    let d: Record<string, unknown> = {};
    try {
      d = await r.json();
    } catch {
      d = { raw: await r.text().catch(() => 'non-JSON response') };
    }

    return r.ok
      ? { ok: true, id: typeof d.id === 'string' ? d.id : undefined }
      : { ok: false, error: String(d.message ?? JSON.stringify(d)).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
