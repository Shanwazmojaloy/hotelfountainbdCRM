# Lumea CRM — Demo Environment Guide

## Quick Setup (15 minutes)

### Step 1 — Create a new Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Name: `lumea-demo` | Region: `ap-northeast-1` (Singapore — closest to BD)
3. Copy the **Project URL** and **anon key**

### Step 2 — Apply the schema
Run your existing migrations in order inside Supabase SQL Editor:
```
supabase/migrations/  (run each .sql file in date order)
```

### Step 3 — Seed demo data
Paste and run `scripts/demo-seed.sql` in the Supabase SQL Editor.

Output when done:
```
✅ Demo seed complete for tenant: d3m0cafe-feed-4000-a000-000000000001
   Rooms: 20 | Guests: 10 | Reservations: 14 | Leads: 6
   Login → demo@lumea.io / PIN: 1234
```

### Step 4 — Deploy to Vercel
```bash
# Fork the main project or create a new Vercel project
# Set these env vars in Vercel → Settings → Environment Variables:

NEXT_PUBLIC_SUPABASE_URL=https://<demo-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<demo-anon-key>

HOTEL_NAME=Grand Palace Hotel
HOTEL_ADDRESS=45 Gulshan Avenue, Dhaka 1212
HOTEL_CONTACT_NAME=Demo Manager
ALERT_NAME=Demo Owner
SENDER_NAME=Grand Palace Hotel — Lumea CRM
HOTEL_EMAIL=info@grandpalacedhaka.com
RESEND_API_KEY=<your key>
CRON_SECRET=demo_secret_change_this
```

Then deploy:
```bash
npx vercel --prod
```

---

## Demo Login Credentials

| Role    | Email             | PIN  |
|---------|-------------------|------|
| Owner   | demo@lumea.io     | 1234 |
| Manager | front@lumea.io    | 5678 |

---

## What the Demo Shows

### Room Matrix
- 20 rooms across 4 floors (Standard → Royal Suite)
- 9 currently **OCCUPIED** (live guest names + check-out dates)
- 2 **RESERVED** (arrivals tomorrow + in 2 days)
- 2 **MAINTENANCE**
- 5 **AVAILABLE**
- 60% occupancy — looks like a real, busy hotel

### Billing & Invoices
Today's revenue breakdown:
| Type   | Amount     |
|--------|------------|
| Cash   | ৳70,000   |
| bKash  | ৳25,500   |
| Card   | ৳161,500  |
| **Total** | **৳257,000** |

### Guest Ledger
Mix of:
- Fully paid guests (Arif, Fatema, Mohammad)
- Partial payments with **balance due** (Sadia ৳5,500, James ৳13,500, Rajib ৳15,000, Chen Wei ৳48,000)
- Upcoming with advance deposit (Tanvir — ৳5,000 paid, ৳11,500 due)
- Zero paid / full balance (James — upcoming ৳37,500)

### Corporate Lead Pipeline ← **WOW MOMENT**
| Company         | Status      | Score |
|-----------------|-------------|-------|
| Bashundhara     | ✅ Closed Won | 95   |
| BRAC Bank       | 💬 Replied  | 85    |
| Robi Axiata     | 📧 Contacted | 72   |
| Apex Footwear   | 🔥 New Lead  | 45   |
| Summit Comms    | ⏳ Pending  | —     |
| Team Group      | ⏳ Pending  | —     |

Show the prospect that OutreachBot auto-emailed the "pending" leads overnight.

---

## Reset Between Demos
Run `scripts/demo-reset.sql` then `scripts/demo-seed.sql` again.
All dates recalculate to "now" on every seed run.

---

## Pricing to Share After Demo

| Plan     | Price/month | Notes |
|----------|-------------|-------|
| Starter  | ৳8,000     | CRM + billing only |
| Growth   | ৳18,000    | + AI outreach agents |
| Full     | ৳35,000    | + LinkedIn auto-prospecting |
| Setup    | ৳15,000    | One-time, all plans |
