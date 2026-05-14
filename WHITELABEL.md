# Lumea CRM — White-Label Client Setup Guide

> Path A deployment: one Supabase project + one Vercel project per hotel client.  
> Estimated setup time: 2–3 hours for a new client.

---

## 1. Supabase — New Project

1. Create a new Supabase project (Singapore region recommended for BD clients).
2. Run all migrations in `supabase/migrations/` in order via Supabase SQL Editor or MCP.
3. Note the **Project URL**, **Anon Key**, and **Service Role Key**.
4. Insert a new tenant row and note the UUID:
   ```sql
   INSERT INTO tenants (name, plan) VALUES ('Client Hotel Name', 'standard')
   RETURNING id;
   ```
5. Seed initial data: rooms, staff users, hotel_settings.
6. Set Supabase secrets (for Edge Functions):
   ```powershell
   npx supabase secrets set --project-ref <ref> `
     TENANT_ID=<uuid> `
     BREVO_API_KEY=<key> `
     CRON_SECRET=<secret> `
     INTERNAL_CRON_TOKEN=<token-from-vault>
   ```
7. Deploy Edge Functions:
   ```powershell
   npx supabase functions deploy outreach-bot --project-ref <ref>
   npx supabase functions deploy weekly-retention --project-ref <ref>
   ```
8. Set up pg_cron schedules (run in Supabase SQL Editor):
   ```sql
   SELECT vault.create_secret(encode(gen_random_bytes(32),'hex'), 'internal_cron_token', 'pg_cron auth');
   SELECT cron.schedule('outreach-bot-daily', '0 3 * * *', $$
     SELECT net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/outreach-bot',
       headers := jsonb_build_object('Content-Type','application/json','Authorization',
         'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_token')),
       body := '{}'::jsonb) AS request_id;
   $$);
   SELECT cron.schedule('weekly-retention-monday', '0 3 * * 1', $$
     SELECT net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/weekly-retention',
       headers := jsonb_build_object('Content-Type','application/json','Authorization',
         'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_token')),
       body := '{}'::jsonb) AS request_id;
   $$);
   ```

---

## 2. Vercel — New Project

1. Fork or clone the repo for the new client.
2. Create a new Vercel project linked to the client repo.
3. Copy `.env.example` → fill in all `[REQUIRED]` values.
4. Set all env vars in Vercel Dashboard → Project Settings → Environment Variables.
5. Deploy.

---

## 3. Client-Specific Files to Update

### `public/crm-config.js`
Update **every field** for the new client before building:

```js
window.CRM_CONFIG = {
  tenantId:     '<new-uuid>',
  hotelName:    'Client Hotel Name',
  hotelShort:   'Client',
  tagline:      'Their tagline here',
  city:         'City, Country',
  address:      'Street, City, Postcode',
  location:     'Neighbourhood · City',
  website:      'clienthotel.com',
  phone:        '+country-number',
  whatsapp:     '+countrydigitsonly',
  email:        'ops@clienthotel.com',
  currency:     '৳',       // change for non-BD clients
  currencyCode: 'BDT',
  vatPct:       15,         // Bangladesh VAT; change per country
  svcPct:       5,
  checkInTime:  '14:00',
  checkOutTime: '12:00',
  roomCount:    24,         // actual room count
  timezone:     'Asia/Dhaka',
};
```

### Vercel Environment Variables (required per client)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_TENANT_ID` | Tenant UUID from `tenants` table | `46bbc3ff-...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Client Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | `sb_publishable_...` |
| `HOTEL_NAME` | Full hotel name | `Hotel Fountain BD` |
| `HOTEL_CONTACT_NAME` | Ops contact first name (used in email signatures) | `Shan Ahmed` |
| `HOTEL_SENDER_NAME` | Full From: name in emails | `Shan Ahmed — Hotel Fountain BD` |
| `HOTEL_SENDER_EMAIL` | Verified Brevo sender email | `ops@clienthotel.com` |
| `HOTEL_LOCATION` | Short location line | `Nikunja 2 · Dhaka · Airport Corridor` |
| `HOTEL_ADDRESS` | Full postal address | `House-05, Road-02, Nikunja-02, Dhaka-1229` |
| `HOTEL_PHONE` | Contact phone | `+880 1322-840799` |
| `ALERT_EMAIL` | Owner/manager email for internal alerts | `owner@clienthotel.com` |
| `ALERT_NAME` | Owner name for internal email salutation | `Hotel Owner` |
| `BREVO_API_KEY` | Brevo transactional email key | `xkeysib-...` |
| `CRON_SECRET` | Vercel cron auth secret | any random string |
| `GMAIL_USER` | Gmail for IMAP reply polling | `ops@clienthotel.com` |
| `GMAIL_APP_PASSWORD` | Gmail app password | 16-char Google app pw |
| `FACEBOOK_PAGE_ID` | FB Page numeric ID | `123456789` |
| `FACEBOOK_PAGE_TOKEN` | Long-lived FB Page token | `EAAx...` |
| `ANTHROPIC_API_KEY` | For CEOAuditor lead scoring | `sk-ant-...` |

> **Note:** Cron jobs run via Vercel (not pg_cron). Schedules are defined in `vercel.json`. No pg_cron setup needed.

```
```

### `public/crm.html`
No changes needed — title is set dynamically from `crm-config.js`.

---

## 4. Brevo Setup (per client)

1. Add client's sender email as a verified sender in the shared Brevo account **OR** create a new Brevo account for the client.
2. Verify the domain for better deliverability.
3. Update `HOTEL_SENDER_EMAIL` and `HOTEL_SENDER_NAME` env vars.

---

## 5. Facebook Page (per client)

1. Client grants admin access to their Facebook Page.
2. Generate a long-lived Page Access Token via [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
3. Set `FACEBOOK_PAGE_TOKEN` and `FACEBOOK_PAGE_ID` env vars in Vercel.

---

## 6. Gmail IMAP (per client)

1. Client creates a Gmail app password: Google Account → Security → 2-Step Verification → App passwords.
2. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` env vars.

---

## 7. Post-Deploy Checklist

- [ ] CRM loads at `/crm.html` with correct hotel name
- [ ] Login works (check Supabase Auth users)
- [ ] Rooms matrix shows client's rooms
- [ ] Invoice PDF shows correct hotel address + phone
- [ ] Outreach bot sends from correct email
- [ ] fb-token-check sends alert to `ALERT_EMAIL`
- [ ] pg_cron jobs active in Supabase → cron.job table

---

## 8. Pricing Guide (suggested)

| Plan | Setup | Monthly |
|---|---|---|
| Standard (≤30 rooms) | ৳50,000 | ৳12,000 |
| Pro (31–100 rooms) | ৳80,000 | ৳20,000 |
| Enterprise (100+ / multi-property) | custom | custom |

Includes: CRM, AI agents, invoice PDF, outreach bot, retention engine.  
Excludes: Supabase Pro (~$25/mo client pays directly), Brevo, Anthropic API credits.
