# Hotel Fountain — Demand Action Plan — 2026-08-15

🔌 **OTA sync not connected** — direct/walk-in only, per the owner's 2026-08-09 hold decision. Forward-book figures below cover direct business only.
*(5 reservations carry a non-`direct` source tag, but 0 booking-webhook events and 0 external booking IDs — those are manually-tagged sources, not synced bookings.)*

---

⚠️ **(1)** This assumes the reservations table is your complete forward book. If OTA/PMS bookings don't sync into Supabase, the urgency below is overstated — sanity-check against a date you know is booked.

⚠️ **(2)** Lever counts are the ACTIONABLE subset (emailable, not bounced, not contacted in the last 14 days) — but still verify list hygiene (dedupe, real intent) before any bulk outreach.

---

## Summary

| Metric | Value |
|---|---|
| Window | 2026-08-15 → 2026-10-13 (60 nights) |
| Room-nights on books | 0 |
| Empty nights | 60 / 60 |
| Avg forward occupancy | 0.0% |
| Pickup (last 7 days) | 0 |
| Furthest check-in on file | 2026-08-09 |
| Lead days | **−6** |

### 🔎 CONFIRMED SHORT-LEAD BOOK

`lead_days = −6` — the furthest check-in in the database is six days in the **past**. There is no forward book at all, not a thin one. Under the OTA hold this is the expected shape of the data: the property runs direct/walk-in, bookings land at or near arrival, and nothing populates future dates in advance.

**Consequence for this plan:** every one of the 60 nights falls beyond `furthest_checkin`, so night-level classification (DEAD / SOFT / HEALTHY / PEAK) produces no actionable rows. Discount and flash-sale alarms are explicitly **not** raised — a 0% forward occupancy reading here is a lead-time and coverage artifact, not demand softness. This is not an emergency and does not need re-flagging daily.

---

## Prioritized actions (executable today)

1. **Work the corporate list — the single biggest live lever.** 105 leads are ready to contact right now (of 127 in pipeline), 40 of them high-priority. `outreach-bot-daily` ran on schedule at 03:00 UTC; this is a volume/quality question, not a plumbing one.
2. **Clear the 4 B2B partners due for follow-up.** Small number, warm relationships, highest conversion-per-effort in the set.
3. **Watch the referral queue drain.** 214 messages remain unsent. The wa.me sender shipped 2026-08-14 (commit `81697b1`) specifically to consume this backlog — confirm messages are actually leaving before queuing more.
4. **Do not scale flash sales yet.** See the tracking note below.
5. **Enrich the 6 no-email corporate rows** so they become contactable.

**Deliberately NOT recommended:** wiring the channel manager. The engineering is done and staging-proven (`docs/CHANNEL_GOLIVE_RUNBOOK.md`); only the spend decision is outstanding, and Shan declined both options on 2026-08-09.

---

## Lever inventory (live)

| Lever | Count | Note |
|---|---|---|
| Corporate leads — ready to contact now | **105** (of 127 in pipeline) | Primary lever |
| — of which high-priority | **40** | Start here |
| — no email on file | 6 | Enrich before they can be contacted |
| B2B partners due for follow-up | **4** | Warm, fastest win |
| Referral messages unsent | **214** | Sender shipped 2026-08-14 — verify delivery |
| Open leads (broad table) | 2,224 | Context only, not the outreach target |
| Active OTA rate-plan channels | 2 | Configured, not synced (hold) |
| Flash sale runs logged | 94 | ⚠️ see below |

⚠️ **Flash sales UNPROVEN — 94 past runs, 0 tracked conversions.** `flash_conv_pct` is null: either the sales genuinely convert nothing, or attribution never fires. Per the 2026-08-09 dead-queue finding, `social_content_queue` rows were never actually published, so attribution had nothing to attribute. Fix tracking or A/B a small batch before scaling.
