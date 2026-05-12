// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Email Worker — Hotel Fountain BD
// Replaces Brevo Inbound Parsing webhook.
//
// Flow:
//   Corporate lead replies to outreach email
//   → Cloudflare Email Routing catches it at replies@fountainbd.com
//   → This worker parses raw MIME using postal-mime
//   → POSTs to https://fountainbd.com/api/agents/reply-intake
//      (same Brevo-compatible payload shape — no backend changes needed)
//
// Deploy:
//   1. wrangler init (in this folder)
//   2. npm install postal-mime
//   3. wrangler deploy
//   4. Cloudflare Dashboard → Email → Email Routing → Routing Rules
//      → Catch-all → Send to Worker: email-reply-intake
//
// Env vars (set in Cloudflare Dashboard → Workers → Settings → Variables):
//   REPLY_INTAKE_URL  = https://fountainbd.com/api/agents/reply-intake
//   CRON_SECRET       = (same value as Vercel CRON_SECRET)
// ─────────────────────────────────────────────────────────────────────────────

import PostalMime from 'postal-mime';

export default {
  /**
   * Cloudflare Email Workers entry point.
   * @param {ForwardableEmailMessage} message
   * @param {object} env
   */
  async email(message, env) {
    // ── 1. Parse raw MIME ──────────────────────────────────────────────────
    const rawArrayBuffer = await new Response(message.raw).arrayBuffer();
    const parser = new PostalMime();
    const parsed = await parser.parse(rawArrayBuffer);

    const senderAddress = message.from ?? parsed.from?.address ?? '';
    const subject       = parsed.subject ?? '(no subject)';
    const textBody      = parsed.text   ?? stripHtml(parsed.html ?? '');

    if (!senderAddress || !textBody.trim()) {
      console.log('[email-worker] Skipped — empty sender or body');
      return;
    }

    // ── 2. Build Brevo-compatible payload ──────────────────────────────────
    // reply-intake/route.ts expects: Array<{ From, Subject, TextContent, Date? }>
    const payload = [
      {
        From:        { Address: senderAddress, Name: parsed.from?.name ?? '' },
        To:          [{ Address: message.to }],
        Subject:     subject,
        TextContent: textBody.substring(0, 4000), // guard against huge HTML threads
        HtmlContent: parsed.html ?? '',
        Date:        new Date().toISOString(),
      },
    ];

    // ── 3. Forward to reply-intake agent ──────────────────────────────────
    const intakeUrl = env.REPLY_INTAKE_URL ?? 'https://fountainbd.com/api/agents/reply-intake';

    const res = await fetch(intakeUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[email-worker] reply-intake returned ${res.status}: ${errText}`);
      // Don't throw — we still want to consume the email so CF doesn't retry
    } else {
      const result = await res.json().catch(() => ({}));
      console.log('[email-worker] reply-intake ok:', JSON.stringify(result));
    }
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
