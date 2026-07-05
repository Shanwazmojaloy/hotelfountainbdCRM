# Data Processing Agreement — Decisions You Must Make (NOT a DPA)

> ⚠️ This is deliberately **not** a drafted contract. A DPA is where you sign up
> to legal obligations about other people's (hotel guests') personal data — the
> terms must be *your* decisions, then drafted/reviewed by a lawyer. This file
> is the decision checklist that feeds that drafting. Do not send this to a
> client; send the lawyer-drafted DPA it produces.

**Roles:** the hotel (Client) is the **data controller** of guest data; Lumea is
the **data processor**. Your DPA is between you (processor) and each hotel
(controller). This framing drives everything below.

## Decisions to lock before drafting

1. **Legal entity & jurisdiction.** Which entity signs? Which country's data law
   governs (Bangladesh + any client's local law)? → drives the whole DPA.

2. **Scope of processing.** Confirm the exhibit: *subject matter* = running the
   CRM; *duration* = the service term; *nature* = storage, organization,
   retrieval, backup; *data types* = guest name, contact, ID/NID, nationality,
   stay + folio/financial records; *data subjects* = the hotel's guests & staff.

3. **Sub-processor list + approval model.** Current: Supabase, Vercel, Brevo,
   Google (Sheets), Meta (opt-in), Anthropic (opt-in). Decide: do hotels get
   (a) general written authorization with notice + right to object to *new*
   sub-processors [recommended], or (b) per-sub-processor consent [heavier]?

4. **Data location.** State the Supabase region and whether guest data ever
   leaves it. If a client requires in-country storage, you cannot promise it on
   current infra — know this before signing such a client.

5. **Retention & deletion.** How long after termination do you keep data before
   deletion, and in what form (live DB + the client's own Google Sheet backup)?
   Recommend: return/delete within [[30]] days of termination on request;
   document that the client's Sheets backup is *theirs* to keep.

6. **Breach notification window.** Commit to a concrete timeframe ("without undue
   delay and within [[N]] hours of becoming aware"). Pick N you can actually hit
   given the hourly health sweep is your detection mechanism.

7. **Security measures exhibit.** You can already list real ones (a strength):
   database-enforced tenant isolation (RLS + per-tenant JWT), secrets in a
   managed vault, encryption in transit, role + network-perimeter access
   control, login lockout, audit logging. Have counsel phrase these as
   commitments, not marketing.

8. **Assistance obligations.** Confirm you will help the hotel respond to guest
   data-subject requests and regulator inquiries (you technically can — data is
   tenant-scoped and exportable). State the mechanism and any fees.

9. **Audit rights.** What audit rights do hotels get — a yearly summary /
   security questionnaire [lighter, recommended for SMB hotels] vs. on-site
   audit rights [heavier]?

10. **Liability & indemnity.** Align the DPA's liability with the Terms cap;
    decide indemnity for data breaches. Counsel territory — do not self-draft.

## After decisions
Hand 1–10 (with your answers) to a lawyer to produce the signed DPA. Attach it
to the Terms of Service as the data-protection exhibit. **Do not onboard a
paying hotel without a signed DPA** — you are processing their guests' PII.
