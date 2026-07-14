// ─────────────────────────────────────────────────────────────────────────────
// Review-request builders (C2/C3 review engine — audit 2026-07-14).
//
// INERT UTILITY: nothing imports this yet. Wire it into the checkout flow
// (reservation status → CHECKED_OUT) once the owner signs off on automated
// guest messaging. Until then, front desk can use the WhatsApp helper manually
// from any guest row.
//
// Rules honored:
//  - Reservation-centric: callers pass the reservation's guest fields, never
//    room-only data.
//  - ASCII-only source (F:-mount multibyte corruption rule); Taka amounts are
//    not needed here.
// ─────────────────────────────────────────────────────────────────────────────
import { GOOGLE_REVIEW_URL, SITE, waLink } from "@/lib/site";

/** Prefilled WhatsApp message asking a checked-out guest for a Google review. */
export function reviewRequestWhatsApp(guestName: string): string {
  const first = (guestName || "").trim().split(/\s+/)[0] || "there";
  return waLink(
    `Hi ${first}, thank you for staying with ${SITE.name}! ` +
      `If you enjoyed your stay, a quick Google review would mean a lot to our small team: ${GOOGLE_REVIEW_URL}`,
  );
}

/** Subject + HTML body for a post-checkout review-request email. */
export function buildReviewRequestEmail(guestName: string): { subject: string; html: string } {
  const first = (guestName || "").trim().split(/\s+/)[0] || "Guest";
  const subject = `Thank you for staying at ${SITE.name} — how was it?`;
  const html =
    `<div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;border:1px solid #EAE6DD;">` +
    `<h2 style="font-family:'Libre Baskerville',Georgia,serif;font-weight:500;color:#1A1713;">Thank you, ${first}!</h2>` +
    `<p style="color:#4A443B;line-height:1.6;">We hope every moment of your stay at ${SITE.name} felt like home. ` +
    `Your feedback directly shapes how we host the next guest.</p>` +
    `<p style="color:#4A443B;line-height:1.6;">If you have 60 seconds, we would be grateful for a review:</p>` +
    `<p style="margin:28px 0;">` +
    `<a href="${GOOGLE_REVIEW_URL}" style="background:#C8A96E;color:#1A1713;text-decoration:none;padding:12px 28px;font-weight:600;letter-spacing:0.05em;">RATE US ON GOOGLE</a>` +
    `</p>` +
    `<p style="color:#8A8378;font-size:12px;line-height:1.6;">${SITE.name} — Nikunja-02, Dhaka. ` +
    `Reply to this email and our front office will pick it up 24/7.</p>` +
    `</div>`;
  return { subject, html };
}
