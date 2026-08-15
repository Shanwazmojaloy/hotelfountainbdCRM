import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// OutreachBot Agent — Supabase Edge Function (v6: Brevo -> Resend)
// Auth: Bearer <CRON_SECRET> OR Bearer <INTERNAL_CRON_TOKEN>
// v5 (2026-06-24): outreach_log row is now written ONLY on a confirmed send
// success. On failure the lead stays 'pending' (clean retry) and the send
// error is recorded in notes — no more phantom 'sent' rows / duplicate-tail.
// v6 (2026-07-20): migrated from Brevo to Resend. Brevo intermittently
// rejected sends from hotellfountainbd@gmail.com (confirmed bounce
// 2026-07-11: "sender ... is not valid"), and wf-evening-report /
// wf-period-reports were found to be silently failing on the same dead
// account. Sender display name/address kept as hotellfountainbd@gmail.com
// per owner confirmation; underlying transport is now Resend, matching the
// pattern already used by wf-guest-emails / wf-checkout-alerts / send-email.

const TENANT       = Deno.env.get("TENANT_ID")    || "46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8";
const SENDER_NAME  = Deno.env.get("HOTEL_SENDER_NAME")  || "Shan Ahmed — Hotel Fountain BD";
const SENDER_EMAIL = Deno.env.get("HOTEL_SENDER_EMAIL") || "hotellfountainbd@gmail.com";
const HOTEL_NAME   = Deno.env.get("HOTEL_NAME")   || "Hotel Fountain BD";
const HOTEL_LOC    = Deno.env.get("HOTEL_LOCATION") || "Nikunja 2 · Dhaka · Airport Corridor";
const HOTEL_ADDR   = Deno.env.get("HOTEL_ADDRESS") || "House-05, Road-02, Nikunja-02, Dhaka-1229";
const HOTEL_PHONE  = Deno.env.get("HOTEL_PHONE")  || "+880 1322-840799";
const MAX_PER_RUN  = 10;

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return (
    auth === `Bearer ${Deno.env.get("CRON_SECRET")}` ||
    auth === `Bearer ${Deno.env.get("INTERNAL_CRON_TOKEN")}`
  );
}

// RESEND_API_KEY — env var first, then Supabase Vault (mirrors wf-flash-nudge / wf-guest-emails).
async function getResendKey(sb: ReturnType<typeof createClient>): Promise<string> {
  const envKey = Deno.env.get("RESEND_API_KEY");
  if (envKey) return envKey;
  const { data } = await sb.rpc("vault_secret", { secret_name: "RESEND_API_KEY" });
  if (data) return data;
  throw new Error("RESEND_API_KEY not found");
}

// Dead-domain guard: via DNS-over-HTTPS, confirm the email domain has an MX (or
// A) record before sending. Catches fabricated domains (2026-06-18 bounce sweep:
// saudiabd.com / umrahexpress.bd had no records). FAIL-OPEN on any DoH error so a
// transient DNS hiccup never wrongly quarantines a real lead — only a definitive
// 'no records' answer returns false.
async function domainCanReceiveMail(domain: string): Promise<boolean> {
  if (!domain) return false;
  try {
    const mx = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`).then((r) => r.json());
    if (Array.isArray(mx.Answer) && mx.Answer.some((a: any) => a.type === 15)) return true;
    const a = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`).then((r) => r.json());
    if (Array.isArray(a.Answer) && a.Answer.some((x: any) => x.type === 1)) return true;
    // Both queries succeeded and returned no usable records -> domain is dead.
    if (mx.Status === 0 && a.Status === 0) return false;
    return true; // ambiguous DoH response -> fail open
  } catch {
    return true; // network/DoH error -> fail open
  }
}

function buildOutreachHtml(company: string, contactName: string | null, title: string | null): string {
  const greeting  = contactName ? `Dear ${contactName},` : "Dear Sir/Madam,";
  const titleLine = title ? ` — ${title}` : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#07090E;border:1px solid rgba(200,169,110,.2)">
  <tr><td style="padding:36px 44px 24px;border-bottom:1px solid rgba(200,169,110,.12);text-align:center">
    <div style="font-size:24px;color:#EEE9E2;letter-spacing:.1em;font-weight:300">${HOTEL_NAME}</div>
    <div style="font-size:10px;color:#9A907C;letter-spacing:.2em;text-transform:uppercase;margin-top:5px">${HOTEL_LOC}</div>
  </td></tr>
  <tr><td style="padding:36px 44px">
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">${greeting}</p>
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">
      I'm Shan, Operations Manager at <strong style="color:#EEE9E2">${HOTEL_NAME}</strong> — a boutique property in ${HOTEL_LOC}, 5 minutes from Hazrat Shahjalal International Airport.
    </p>
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">
      A number of companies similar to <strong style="color:#EEE9E2">${company}</strong>${titleLine} quietly use us for visiting engineers, overseas trainers, and inspection teams — mostly because we're close, billing is easy, and the experience is a step above the usual corporate hotel.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(200,169,110,.05);border:1px solid rgba(200,169,110,.15);margin:24px 0">
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2">Airport pickup at any hour — 3 AM flights included</td></tr>
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">Monthly corporate billing — no per-visit admin hassle</td></tr>
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">Dedicated point of contact for your HR / admin team</td></tr>
      <tr><td style="padding:14px 22px;font-size:13px;color:#EEE9E2;border-top:1px solid rgba(200,169,110,.08)">Quiet, well-appointed rooms designed for work trips</td></tr>
    </table>
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 20px">
      I'd love to invite you for a <strong style="color:#C8A96E">quick coffee and a look around the property</strong> — no formal presentation, just a conversation about whether we could be useful to ${company} whenever you have the need.
    </p>
    <p style="color:#C8BFB0;font-size:14px;line-height:1.85;margin:0 0 28px">
      Any day this week or next works well. Just reply and I'll confirm a time.
    </p>
    <div style="border-top:1px solid rgba(200,169,110,.12);padding-top:24px">
      <div style="font-size:16px;color:#C8A96E;font-style:italic;margin-bottom:4px">Shan Ahmed</div>
      <div style="font-size:12px;color:#9A907C;line-height:1.7">Operations Manager · ${HOTEL_NAME}<br/>
      ${HOTEL_ADDR}<br/>
      ${HOTEL_PHONE} · <a href="mailto:${SENDER_EMAIL}" style="color:#C8A96E;text-decoration:none">${SENDER_EMAIL}</a></div>
    </div>
  </td></tr>
  <tr><td style="padding:18px 44px;border-top:1px solid rgba(200,169,110,.1);text-align:center">
    <p style="font-size:10px;color:#5a5a4a;margin:0">${HOTEL_NAME} · ${HOTEL_ADDR} · ${SENDER_EMAIL}</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

function buildOutreachText(company: string, contactName: string | null): string {
  const greeting = contactName ? `Dear ${contactName},` : "Dear Sir/Madam,";
  return [
    greeting, "",
    `I'm Shan, Operations Manager at ${HOTEL_NAME} — a boutique property in ${HOTEL_LOC}, 5 minutes from Hazrat Shahjalal International Airport.`,
    "", `A number of companies similar to ${company} quietly use us for visiting engineers, overseas trainers, and inspection teams.`,
    "", `What we offer corporate clients:`,
    `- Airport pickup at any hour`, `- Monthly corporate billing`,
    `- Dedicated HR/admin point of contact`, `- Quiet rooms designed for work trips`,
    "", `I'd love to invite you for a quick coffee and a look around the property — no formal presentation, just a conversation.`,
    "", `Any day this week or next works. Just reply and I'll confirm a time.`,
    "", `Shan Ahmed`, `Operations Manager · ${HOTEL_NAME}`,
    HOTEL_ADDR, `${HOTEL_PHONE} · ${SENDER_EMAIL}`,
  ].join("\n");
}

async function runOutreachBot() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: leads, error } = await supabase
    .from("corporate_leads")
    .select("*")
    .eq("tenant_id", TENANT)
    .eq("status", "pending")
    .not("contact_email", "is", null)
    .limit(MAX_PER_RUN * 3);

  if (error) return { ok: false, error: error.message };

  const PRIORITY_RANK: Record<string, number> = { high: 1, med: 2, low: 3 };
  const sorted = (leads ?? [])
    .sort((a: Record<string,unknown>, b: Record<string,unknown>) =>
      (PRIORITY_RANK[a.priority as string] ?? 9) - (PRIORITY_RANK[b.priority as string] ?? 9))
    .slice(0, MAX_PER_RUN);

  const results: Array<Record<string, unknown>> = [];

  let resendKey: string | null = null;
  try {
    resendKey = await getResendKey(supabase);
  } catch (e) {
    return { ok: false, error: `RESEND_API_KEY unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }

  for (const lead of sorted) {
    try {
      // Dead-domain guard — skip + quarantine leads whose email domain can't receive mail.
      const domain = String(lead.contact_email || "").split("@")[1]?.toLowerCase() ?? "";
      if (!(await domainCanReceiveMail(domain))) {
        await supabase.from("corporate_leads").update({
          status: "bounced_invalid",
          notes: `[AUTO-SKIPPED ${new Date().toISOString().slice(0,10)}: email domain ${domain} has no MX/A records]`,
          updated_at: new Date().toISOString(),
        }).eq("id", lead.id);
        results.push({ lead: lead.company_name, email: lead.contact_email, skipped: "dead_domain" });
        continue;
      }

      const subject = `A 20-minute coffee + property tour — we're 5 min from ${lead.company_name}`;
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
          to: [lead.contact_email],
          reply_to: SENDER_EMAIL,
          subject,
          html: buildOutreachHtml(lead.company_name, lead.contact_name, lead.contact_title),
          text: buildOutreachText(lead.company_name, lead.contact_name),
        }),
      });
      const ok = resendRes.ok;
      const resendData = await resendRes.json().catch(() => ({}));

      if (ok) {
        // Log ONLY on a confirmed send — prevents phantom 'sent' rows.
        await supabase.from("outreach_log").insert({
          tenant_id: TENANT, lead_id: lead.id, direction: "outbound", channel: "email",
          subject, body: buildOutreachText(lead.company_name, lead.contact_name),
          sent_at: new Date().toISOString(),
        });
        await supabase.from("corporate_leads").update({
          status: "contacted",
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", lead.id);
        results.push({ lead: lead.company_name, email: lead.contact_email, sent: true, messageId: resendData.id });
      } else {
        // Failure: keep 'pending' for a clean retry, record the error, write NO log row.
        const errMsg = (resendData && (resendData.message || resendData.name)) ? `${resendData.name ?? ""} ${resendData.message ?? ""}`.trim() : `HTTP ${resendRes.status}`;
        await supabase.from("corporate_leads").update({
          notes: `[SEND-FAIL ${new Date().toISOString().slice(0,16)}: ${String(errMsg).slice(0,140)}]`,
          updated_at: new Date().toISOString(),
        }).eq("id", lead.id);
        results.push({ lead: lead.company_name, email: lead.contact_email, sent: false, error: errMsg });
      }
    } catch (e) {
      results.push({ lead: lead.company_name, error: String(e) });
    }
  }
  return { ok: true, agent: "outreach-bot", processed: results.length, timestamp: new Date().toISOString(), results };
}

Deno.serve(async (req: Request) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const result = await runOutreachBot();
    if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
