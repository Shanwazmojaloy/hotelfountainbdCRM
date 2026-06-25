# Meta CAPI + Advantage+ — Setup & Operations (Hotel Fountain)

Server-side Conversions API (Graph **v25.0**) + base Pixel, wired into the live booking
funnel. Reservation-centric: `reservation_id` is the dedup key and `external_id`.

## 1. What ships in the code

| Layer | File | Event |
|---|---|---|
| Core sender | `src/lib/capi.ts` | hashing, dedup, v25 POST, fail-soft |
| Booking request | `app/api/book/route.ts` (+ `ReservationModal.tsx`) | **Lead** (server + browser, deduped) |
| Settled payment | `app/api/crm/payment/route.ts` | **Purchase** (server, WEBSITE-only, once) |
| Base Pixel | `app/(site)/layout.tsx` | **PageView**, **InitiateCheckout** |
| CSP | `middleware.ts` | whitelists `connect.facebook.net`, `www.facebook.com` |
| DB | `supabase/migrations/20260625_reservations_fb_attribution.sql` | ✅ **applied to prod** |

Event model:

| Event | When | Value | action_source |
|---|---|---|---|
| PageView | every site page | — | website |
| InitiateCheckout | reservation modal opens | — | website |
| Lead | `/api/book` success | nights × room rate (predicted, BDT) | website |
| Purchase | WEBSITE reservation fully paid in CRM | actual net paid (BDT) | website |

Purchase only fires for `source='WEBSITE'` reservations that carry `fbp/fbc` click context, so
walk-in / desk revenue is never mis-attributed to ads. It fires **once** (guarded by
`fb_purchase_sent_at`).

## 2. Environment variables (add to Vercel → Production)

| Var | Scope | Value |
|---|---|---|
| `NEXT_PUBLIC_FB_PIXEL_ID` | client | Dataset/Pixel ID (the number) |
| `META_PIXEL_ID` | server | same Dataset/Pixel ID |
| `META_CAPI_TOKEN` | server | system-user Conversions API token |
| `META_CAPI_TEST_CODE` | server | `TEST#####` — **only while validating; delete after** |

Without `META_PIXEL_ID` + `META_CAPI_TOKEN`, CAPI is a no-op (booking/payment still work).
Without `NEXT_PUBLIC_FB_PIXEL_ID`, the browser Pixel simply isn't injected.

## 3. Generate the credentials (Events Manager)

1. **Dataset/Pixel** — business.facebook.com → **Events Manager** → Connect Data Sources →
   Web → create or open the dataset. Copy the **Dataset ID** → this is both `*_PIXEL_ID` vars.
2. **CAPI token** — Events Manager → the dataset → **Settings** → *Conversions API* →
   **Generate access token**. (Production-grade alt: Business Settings → **System Users** →
   add an *Admin* system user → Generate token with `ads_management` + `business_management`,
   then assign the dataset asset.) Copy → `META_CAPI_TOKEN`.
3. **Test code** — Events Manager → dataset → **Test Events** tab → copy the `TEST#####` →
   `META_CAPI_TEST_CODE` (temporary).
4. Redeploy. Then run §5 verification, and **remove `META_CAPI_TEST_CODE`** when green.

## 4. Advantage+ — tighter setup (the real performance lever)

Andromeda decides which ads compete based on **creative**, not audience knobs. You win with a
diverse, distinct creative library + clean signals (now flowing via CAPI above).

| Rule | Setting |
|---|---|
| Campaign | One **Advantage+** campaign; broad targeting (18–65+, Dhaka + feeder cities + relevant GCC NRB geos) |
| Creative volume | **10–15 DISTINCT concepts** by semantic intent — not color/headline micro-tests |
| Optimize for | `Purchase` once Purchase volume is healthy; start on `Lead` (higher volume → faster exit from learning) |
| No-touch window | **7 days** after launch/edit: no budget/creative/copy changes (learning phase) |
| North-star | **MER = total BDT revenue ÷ total ad spend** (compute from CRM, not Meta-reported) |
| Scale | If MER > 3.5 and concepts still distinct → raise budget ≤ 20% per step |

Concept buckets (build 2–3 variants each):

- **A — Professional / workation:** desk, fast Wi-Fi, quiet, near Nikunja/airport.
- **B — Romantic staycation:** evening lighting, suite, privacy, breakfast.
- **C — Family / group escape:** Twin Deluxe & Royal Suite space, capacity, convenience.
- **D — Dhaka business traveler:** location, 24/7 front office, easy bKash/desk payment.

## 5. Verify (Events Manager → Test Events)

1. Deploy. Open fountainbd.com → expect **PageView**; open the Reserve modal → **InitiateCheckout**.
2. Submit a test booking → **Lead** shows source **"Browser and Server"** and **Deduplicated**
   (one event, not two). Check **Event Match Quality** (target 6.0+).
3. In the CRM, record payment on that WEBSITE reservation until fully paid → **Purchase**
   appears (server) with the BDT value.
4. Remove `META_CAPI_TEST_CODE` from Vercel; events now flow to the live dataset.

## 6. Optional audit script

`scripts/capi_aplus_audit.mjs` — read-only Marketing API check (creative-count < 10, 7-day
no-touch violation, MER). Needs `META_MARKETING_TOKEN` + `META_AD_ACCOUNT_ID`
(`act_<id>`). Run: `node scripts/capi_aplus_audit.mjs`.
