# Facebook Page Token Renewal — Hotel Fountain BD

**When to run:** When `fb-token-check` cron sends an alert email, or when the token is suspected leaked / compromised.

**Current token (as of 2026-05-20):**
- **Type:** PERMANENT page token (`expires_at: 0`)
- **Verified via:** `GET https://graph.facebook.com/debug_token?input_token=<token>&access_token=<token>` (self-introspect)
- **Page:** Hotel Fountain (id `111521248040168`)
- **App:** Hotel Fountain (id `964308212964963`)
- **Scopes:** `pages_show_list`, `business_management`, `pages_read_engagement`, `pages_manage_posts`, `public_profile`
- **Soft deadline (data_access_expires_at):** 2026-08-02 14:47 UTC — Facebook's separate user-data-access window (auto-extends when owner logs into FB)

**Renewal cadence:** Not on a schedule. Renew ONLY when (a) `data_access_expires_at` passes without owner FB login and Graph calls start returning OAuthException, or (b) token is exposed in a chat / commit / log and must be rotated for security.

**fb-token-check fallback mode warning:** `FACEBOOK_APP_SECRET` is NOT in Vercel env vars. Without it, the cron runs in `/me`-validity mode (binary valid/invalid) and cannot read expiry. The check still works for catching revoked tokens. To enable full expiry detection, add `FACEBOOK_APP_SECRET` from developers.facebook.com → App Settings → Basic → App Secret → Show.

---

## Step-by-Step Renewal

### 1. Get a short-lived User Access Token
1. Go to https://developers.facebook.com/tools/explorer/
2. Meta App → **Hotel Fountain** (App ID: `964308212964963`)
3. User or Page → **User Token**
4. Permissions already configured: `pages_show_list, business_management, pages_read_engagement, pages_manage_posts`
5. Click **Generate Access Token** → authorize in popup
6. Copy the User Access Token from the field (starts with `EAA...`)

### 2. Exchange for a long-lived User Token (60 days)
Run this in your terminal, substituting values from Vercel env vars:

```bash
APP_ID="964308212964963"
APP_SECRET="<FACEBOOK_APP_SECRET from Vercel>"
USER_TOKEN="<short-lived token from step 1>"

curl "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${USER_TOKEN}"
```

Response: `{"access_token":"EAA...long...","token_type":"bearer","expires_in":5183944}`

### 3. Get the permanent Page Access Token
Using the long-lived user token from step 2:

```bash
LONG_USER_TOKEN="<token from step 2 response>"
PAGE_ID="111521248040168"

curl "https://graph.facebook.com/v25.0/me/accounts?access_token=${LONG_USER_TOKEN}"
```

Find the entry with `"id": "111521248040168"` (Hotel Fountain page) and copy its `access_token` field.

### 4. Verify the new Page token
```bash
NEW_PAGE_TOKEN="<page token from step 3>"

curl "https://graph.facebook.com/v25.0/debug_token?input_token=${NEW_PAGE_TOKEN}&access_token=${NEW_PAGE_TOKEN}" | python3 -c "
import sys, json, datetime
d = json.load(sys.stdin)
exp = d.get('data', {}).get('expires_at', 0)
if exp:
    print(f'Expires: {datetime.datetime.fromtimestamp(exp).strftime(\"%Y-%m-%d\")} ({(datetime.datetime.fromtimestamp(exp)-datetime.datetime.now()).days} days)')
else:
    print('Token does not expire (permanent)')
print('Valid:', d.get('data', {}).get('is_valid'))
"
```

### 5. Update Vercel + .env.local
**Vercel:**
1. Go to https://vercel.com → hotelfountainbd-vercel → Settings → Environment Variables
2. Find `FACEBOOK_PAGE_TOKEN` → Edit → paste new token → Save
3. Redeploy: `npx vercel --prod` (or trigger via GitHub push)

**.env.local:**
```bash
# Update line in Hotel Fountain BD CRM/.env.local
FACEBOOK_PAGE_TOKEN=<new_token>
```

### 6. Confirm via fb-token-check cron
```bash
# Manual trigger (requires CRON_SECRET from Vercel env vars)
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://fountainbd.com/api/agents/fb-token-check
```

Expected: `"days_remaining": 60+, "token_valid": true, "alert_sent": false`

---

## Where to find FACEBOOK_APP_SECRET
Vercel Dashboard → hotelfountainbd-vercel → Settings → Environment Variables → `FACEBOOK_APP_SECRET`

OR: developers.facebook.com → Hotel Fountain app (ID: `964308212964963`) → Settings → Basic → App Secret → Show
