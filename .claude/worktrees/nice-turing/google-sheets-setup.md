# 🔗 Google Sheets Sync — Setup Guide
## Hotel Fountain CRM → Google Sheets Backup

---

## STEP 1 — Create Google Sheet (2 min)

1. Go to: https://sheets.google.com
2. Create a new spreadsheet
3. Name it: **Hotel Fountain CRM Backup**
4. Copy the Spreadsheet ID from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
   - The bold part is your **SPREADSHEET_ID** — save it

---

## STEP 2 — Create Google Service Account (5 min)

1. Go to: https://console.cloud.google.com
2. Create a new project (or use existing) — name it: **Hotel Fountain**
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" → Enable
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → Service Account**
   - Name: `hotel-fountain-sync`
   - Click Create → Done (skip optional steps)
6. Click the service account → **Keys tab → Add Key → Create new key → JSON**
7. A JSON file downloads — **keep it safe, you need it next**

---

## STEP 3 — Share Sheet with Service Account (30 sec)

1. Open the JSON file — find `"client_email"` value
   - Looks like: `hotel-fountain-sync@yourproject.iam.gserviceaccount.com`
2. In your Google Sheet → Share button
3. Paste that email → **Editor** access → Share

---

## STEP 4 — Add Secrets to Supabase (2 min)

Go to: https://supabase.com/dashboard/project/mynwfkgksqqwlqowlscj/settings/vault

Add these 2 secrets:

| Secret Name | Value |
|-------------|-------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the ENTIRE contents of the downloaded JSON file |
| `GOOGLE_SPREADSHEET_ID` | Your spreadsheet ID from Step 1 |

---

## STEP 5 — Run First Full Sync

Once secrets are added, trigger the first sync:

**Option A — From your CRM:**
→ Settings → ⚙ System → "Sync to Google Sheets" button

**Option B — Direct URL:**
```
POST https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/sync-to-sheets
```

**Option C — Browser (paste this URL):**
```
https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/sync-to-sheets
```
*(Will return JSON with sync counts)*

---

## What Gets Synced

| Sheet Tab | Data | When |
|-----------|------|------|
| 🛏 Rooms | All 28 rooms + status | Every room status change |
| 👤 Guests | All 115+ guests | Every guest add/edit |
| 📅 Reservations | All 599+ reservations | Every booking/check-in/out |
| 💰 Transactions | All 739+ payments | Every payment recorded |
| 🧾 Folios | Room charges | Every charge added |
| 🧹 Housekeeping | All tasks | Every task update |
| 📊 Sync Log | Last sync time + counts | Every full sync |

---

## Auto-Sync Behavior

After setup, every time you:
- Check in a guest → instantly synced to Reservations sheet
- Record a payment → instantly synced to Transactions sheet
- Change a room status → instantly synced to Rooms sheet
- Add a guest → instantly synced to Guests sheet

The sync is **automatic — no action needed.**

---

## Edge Function URL
`https://mynwfkgksqqwlqowlscj.supabase.co/functions/v1/sync-to-sheets`

## Project
Supabase Project: `mynwfkgksqqwlqowlscj` (Hotel Fountain Main)
