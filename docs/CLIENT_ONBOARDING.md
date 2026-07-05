# Lumea CRM — Client Onboarding Runbook

How to take a new hotel from "signed" to "live on their own subdomain." Every
technical control is already built (multi-tenant RLS, per-tenant secrets in
Vault, per-tenant perimeter, per-tenant backups, AI cost caps); this is the
operator checklist that wires one client through them.

Prereqs (platform-side, one-time): wildcard DNS `*.lumea.fountainbd.com` → Vercel
(done), `NEXT_PUBLIC_APEX_DOMAIN=lumea.fountainbd.com` (done), `ADMIN_SECRET`,
`GOOGLE_SA_KEY`, and the standby HS256 signing key for tenant JWTs (done).

---

## 1. Collect from the client

- Hotel name, address, phone, WhatsApp (digits only), city
- Room count + the room list (numbers, category, nightly rate)
- Owner's name + email (becomes their first CRM login)
- Their office public IP(s) — for the network perimeter (optional; without it,
  only owner/admin can reach the CRM off-site)
- Their sending email + a Brevo account (or use the platform's) — see step 4
- A Google Sheet they own, for the nightly closing backup — see step 5

## 2. Create the tenant (one API call)

`POST https://<any-lumea-host>/api/admin/onboard-tenant`
`Authorization: Bearer <ADMIN_SECRET>`

```json
{
  "slug": "grandpalace",
  "hotel_name": "Grand Palace Hotel",
  "hotel_email": "reservations@grandpalace.com",
  "sender_name": "Grand Palace Reservations",
  "alert_email": "owner@grandpalace.com",
  "alert_name": "GM",
  "hotel_location": "…", "hotel_address": "…", "hotel_phone": "…",
  "hotel_whatsapp": "8801…", "hotel_city": "Dhaka",
  "hotel_room_count": 40, "hotel_description": "…",
  "plan_tier": "growth",
  "office_ips": ["203.0.113.7"],
  "remote_roles": ["owner", "admin"],
  "sheets_backup_id": "<google-spreadsheet-id>",
  "rooms": [
    { "room_number": "101", "category": "Deluxe", "price": 6500 },
    { "room_number": "102", "category": "Standard", "price": 4500 }
  ],
  "owner": { "name": "Owner Name", "email": "owner@grandpalace.com" },
  "brevo_api_key": "xkeysib-…",
  "facebook_page_token": "…", "facebook_page_id": "…"
}
```

The response confirms `tenant_id`, `rooms_seeded`, `owner_staff_id`, which
secrets went to Vault, and a `next_steps` list. Secrets are stored in Supabase
Vault, never in plaintext columns.

## 3. DNS / domain

- `<slug>.lumea.fountainbd.com` already resolves via the wildcard — no per-client
  DNS. If the client wants their **own** domain (`crm.grandpalace.com`), add it
  as a domain alias on the Vercel project and CNAME it to Vercel; then add the
  host→slug mapping (currently subdomain-based in `middleware.ts` `extractSlug`).

## 4. Email deliverability — CRITICAL, do not skip

Brevo returns HTTP success but **silently drops** mail from an unverified
sender. If you skip this, every guest confirmation, OTP, and alert for this
client vanishes with no error.

- In the Brevo account whose API key this tenant uses, verify the tenant's
  `hotel_email` as a sender (Brevo → Senders → Add → confirm the email).
- Send one real test (e.g. trigger the owner's activation OTP) and confirm it
  lands in a real inbox — not just a 200 from the API.

## 5. Nightly backup spreadsheet

- Get the client's Google Spreadsheet ID (from its URL) into
  `tenants.sheets_backup_id` (set at onboarding, or later:
  `UPDATE public.tenants SET sheets_backup_id='<id>' WHERE slug='<slug>'`).
- The client must **share that sheet with the platform's Google service-account
  email** (the `client_email` inside `GOOGLE_SA_KEY`) as **Editor**.
- Without both, nightly closing backups are **skipped** for this tenant (soft —
  day-close still succeeds; a client's data never lands in another tenant's
  sheet).

## 6. Owner activates

Send the owner to `https://<slug>.lumea.fountainbd.com/crm` → Activate tab →
enter their email → they receive an OTP (this is the step-4 deliverability test)
→ set password. They're in, scoped to their tenant by RLS.

## 7. Optional per-client tuning

- AI spend cap: `UPDATE public.tenants SET ai_daily_token_cap=<n> WHERE slug='<slug>'`
  (default: none = unlimited; Hotel Fountain uses 500000/day).
- Perimeter later: `UPDATE public.tenants SET office_ips='{…}', remote_roles='{…}'`.

## 8. Verify isolation before handing over

- Log into the new tenant's CRM; confirm you see ONLY their rooms/reservations.
- Confirm a made-up subdomain (`https://nonesuch.lumea.fountainbd.com/crm`
  login) returns **404 Unknown property**.
- The `lumeademo` tenant is the permanent sanity fixture — never delete it.

---

## Still needed before charging money (platform-level, not per-client)

1. **Billing** — `plan_tier` is a label only. Manual invoicing (bKash/bank) is
   fine for the first handful of clients; automate later.
2. **Terms / Privacy / DPA** — one document covering guest-data handling +
   stated support expectation. Don't sign a hotel without it.
3. **Support channel** — where clients report issues; who responds, how fast.
