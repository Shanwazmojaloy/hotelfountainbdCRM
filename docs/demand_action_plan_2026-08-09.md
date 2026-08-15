# Hotel Fountain — Demand Action Plan — 2026-08-09

> Save-path note: the configured target `F:\AI & Agents Trading\lumea_pricing\sample_output\` is outside this session's connected folder, so this copy lives in the CRM repo's `docs/` instead.

🔌 **OTA SYNC NOT YET CONNECTED** — the forward book below reflects only walk-in/direct data and understates reality. Connect a channel manager to the booking-webhook endpoint (see `hotel_fountain_ops/CHANNEL_MANAGER_SETUP.md`).

> Deviation note: the strict rule ("all three signals = 0") technically fell to the LIVE branch because **1** reservation carries a non-direct `source`. But `booking-webhook` events = **0** and reservations with `external_booking_id` = **0**, so nothing is actually arriving over the wire — that single row is a manually-tagged source, not a synced booking. NOT CONNECTED is the honest read.

⚠️ (1) This assumes the reservations table is your complete forward book. If OTA/PMS bookings don't sync into Supabase, the urgency below is overstated — sanity-check against a date you know is booked.

⚠️ (2) Lever counts are the ACTIONABLE subset (emailable, not bounced, not contacted in the last 14 days) — but still verify list hygiene (dedupe, real intent) before any bulk outreach.

## Thin-book / short-lead notes

**THIN BOOK:** average forward occupancy over the next 60 nights is **0.06%** (1 room-night on the books across 1,680 available room-nights). A number this low is a data-coverage signal, not a demand signal.

**CONFIRMED SHORT-LEAD BOOK:** the furthest check-in anywhere in the system is **2026-08-08** — `lead_days = -1`, i.e. *yesterday*. Nothing at all is on the books beyond today. This is a lead-time / sync artifact, not demand softness. **No discount or flash-sale alarm is raised past 2026-08-08**, which excludes the entire 60-night window from urgency scoring.

## Summary

| | |
|---|---|
| Window | 2026-08-09 → 2026-10-07 (60 nights) |
| Empty nights (0 on books) | 59 of 60 |
| Avg forward occupancy | 0.06% |
| Actionable nights after integrity gate | **0** |
| Furthest check-in on file | 2026-08-08 (lead_days −1) |

Today (2026-08-09) carries 1 room-night, picked up within the last 7 days — skipped as fresh pickup regardless.

## Prioritized actions

1. **Fix the forward book before acting on it.** Zero future-dated reservations + zero webhook events + zero external booking IDs means the demand layer is flying blind. Channel-manager → `booking-webhook` wiring is the highest-value item here; every lever below is guesswork until it lands.
2. **Work the referral backlog — 210 unsent.** The only lever with real inventory today, zero-cost, and independent of forward-book accuracy. Caveat: `sent` in `referral_queue` is a queue flag, not delivery confirmation — verify the wa.me sender actually dispatches before counting them reached.
3. **Corporate + B2B outreach (long band, safe to run).** 101 corporate leads ready to contact now, 40 high-priority, plus 4 B2B partners due for follow-up. Not gated on the forward book — the one demand action safe to execute today.
4. **Do NOT run a flash sale.** 88 flash runs logged, **0** tracked conversions — flash sales are UNPROVEN here. Attribution is gated on posted content that never publishes (dead queue publisher), so conversion tracking has never run. Fix tracking or A/B a small batch before scaling; don't discount into a book you can't see.
5. **OTA distribution is thin — 2 active channels.** Worth expanding once sync is live; expanding distribution before the inbound path works only moves the blindness upstream.

## Lever inventory (live)

| Lever | Count |
|---|---|
| Referrals unsent | 210 |
| Corporate — ready to contact now | **101** (of 122 in pipeline) |
| Corporate — high-priority ready now | 40 |
| B2B partners due for follow-up | 4 |
| Open leads (general) | 2,099 |
| Active OTA channels | 2 |
| Flash runs logged / tracked conversions | 88 / 0 (conv% unavailable) |

† 4 rows in the corporate pipeline have no email address and cannot be contacted until enriched.
