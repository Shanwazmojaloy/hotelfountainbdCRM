# Hotel Fountain — Demand Action Plan — 2026-08-11

🔌 **OTA sync not connected** — direct/walk-in only, per the owner's 2026-08-09 hold decision. Forward-book figures below cover direct business only. (5 reservations carry a manually-tagged non-direct `source`; 0 webhook events, 0 external booking IDs — no synced bookings.)

⚠️ (1) This assumes the reservations table is your complete forward book. If OTA/PMS bookings don't sync into Supabase, the urgency below is overstated — sanity-check against a date you know is booked.

⚠️ (2) Lever counts are the ACTIONABLE subset (emailable, not bounced, not contacted in the last 14 days) — but still verify list hygiene (dedupe, real intent) before any bulk outreach.

---

## 🔴 Do this first — 3 website bookings checking in TOMORROW are still PENDING with no rooms assigned

| Guest | Check-in | Check-out | Room type | Total | Created |
|---|---|---|---|---|---|
| Mahenaz Sultana | 2026-08-12 | 2026-08-13 | Fountain Deluxe | ৳0 | Aug 10, 06:33 UTC |
| Ruchit Panchal | 2026-08-12 | 2026-08-16 | Fountain Deluxe | ৳0 | Aug 10, 15:00 UTC |
| Romit Shah | 2026-08-12 | 2026-08-16 | Fountain Deluxe | ৳0 | Aug 10, 15:01 UTC |

All three came in from the WEBSITE yesterday, all `status = PENDING`, all with **empty `room_ids`** and **`total_amount = 0`**. They are therefore invisible to every occupancy and revenue figure in this report. Actions: confirm each booking, assign rooms, and price them. Also check whether Ruchit Panchal and Romit Shah (created 64 seconds apart, identical dates and room type) are one party or a duplicate submission.

---

## Summary

- **Window:** 2026-08-11 → 2026-10-09 (60 nights)
- **Empty nights:** 60 of 60
- **Average forward occupancy:** 0.0% (0 of 28 rooms/night on the books)
- **Furthest confirmed check-in:** 2026-08-12 (lead time **1 day**)

**CONFIRMED SHORT-LEAD BOOK.** With a 1-day booking horizon, a thin far-out book is a lead-time and coverage artifact, not demand softness. No discount or flash-sale alarm is raised beyond 2026-08-12. This is the expected shape of the business under the owner's OTA hold — not a defect.

**Thin-book note:** average forward occupancy is under 15%, but with `lead_days = 1` that number carries almost no forecasting signal. Judge demand on same-day and next-day pickup, not on the 60-night curve.

---

## Prioritized actions (executable today)

1. **Clear the 3 pending arrivals above.** Highest-value action available — real guests, real revenue, arriving in ~24 hours.
2. **Drain the referral queue — 214 unsent.** Largest untouched near-term lever by a wide margin. The `wa.me` sender shipped 2026-08-10 (commit 81697b1); this is the first day it can actually move volume. Send a controlled first batch and confirm delivery before scaling.
3. **Corporate outreach — 101 ready to contact now, 40 of them high-priority.** Feeds the 10–60 day window where lead time is currently blind. `outreach-bot-daily` ran at 03:00 UTC today.
4. **B2B partner follow-ups — 4 due today.** Small, warm, and quick.
5. **Do NOT scale flash sales.** 90 recorded runs, 0 tracked conversions (conversion rate is null, not zero-with-data). Flash sales are UNPROVEN — fix attribution tracking or A/B a small batch before spending on this lever. Related: the social content queue has no publisher, so "sent" counts have never meant delivery.
6. **Channel manager / OTA: no action.** Owner declined Channex and a Beds24 adapter on 2026-08-09. Engineering is done and staging-proven (`docs/CHANNEL_GOLIVE_RUNBOOK.md`); only a spend decision remains, and it is Shan's to make.

---

## Lever inventory (live)

| Lever | Count | Notes |
|---|---|---|
| Referrals unsent | **214** | Near-band lever #1; sender live since 2026-08-10 |
| Corporate — ready to contact now | **101** (of 127 in pipeline) | Emailable, not bounced, not contacted in 14d |
| Corporate — high priority, ready now | **40** | Target these first |
| B2B partners due | **4** | Follow-up date reached |
| Open leads (`leads`) | 2,154 | Context only — separate table from `corporate_leads`, which is the only one `outreach-bot` reads |
| Active OTA channels configured | 2 | Configured, not connected — hold in effect |
| Flash sale runs | 90 | Conversion rate: **no data** — attribution never ran |

† 6 corporate pipeline rows have no email address — enrich before they can be contacted.

---

## Band classification

With a 1-day booking horizon, every night after 2026-08-12 is excluded from lever targeting per the integrity gate. No NEAR / MID / LONG discount actions are raised against the empty 60-night curve — the curve reflects lead time, not demand.

| Band | Days out | Lever | Status today |
|---|---|---|---|
| NEAR | 0–9 | Referrals first, then flash sale | Referrals: 214 queued. Flash: UNPROVEN, hold. |
| MID | 10–30 | Lead nurture only (OTA expansion on hold) | Nudge open leads; no deep discounts |
| LONG | 31–60 | Corporate + B2B outreach | 40 high-priority ready + 4 partners due |
