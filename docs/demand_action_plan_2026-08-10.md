# Hotel Fountain — Demand Action Plan — 2026-08-10

🔌 **OTA sync not connected** — direct/walk-in only, per the owner's 2026-08-09 hold decision. Forward-book figures below cover direct business only.
*(Probe: `webhook_events = 0`, `with_external_id = 0`. The 2 rows with a non-direct `source` are manually-tagged, not synced bookings.)*

---

## Standing caveats

⚠️ **(1)** This assumes the reservations table is your complete forward book. If OTA/PMS bookings don't sync into Supabase, the urgency below is overstated — sanity-check against a date you know is booked.

⚠️ **(2)** Lever counts are the ACTIONABLE subset (emailable, not bounced, not contacted in the last 14 days) — but still verify list hygiene (dedupe, real intent) before any bulk outreach.

---

## Book integrity

| Check | Value | Reading |
|---|---|---|
| Furthest check-in on file | 2026-08-09 | Yesterday |
| Lead days | **−1** | No forward reservations at all |
| Forward window scanned | 2026-08-10 → 2026-10-08 (60 nights) | |
| Empty nights | 60 / 60 | |
| Avg forward occupancy | **0.0%** | |
| Pickup last 7d | 0 | |

**Thin-book note.** Average forward occupancy is 0%, well under the 15% threshold. **This is an expected state, not an alarm.** With OTA distribution deliberately on hold, the property books direct and walk-in, and walk-in volume by definition never appears in the forward book.

**CONFIRMED SHORT-LEAD BOOK.** `lead_days = −1` means the furthest check-in on file is already in the past. Every night in the 60-night window sits beyond `furthest_checkin`, so per the integrity gate **all 60 nights are excluded from night-level classification** — a thin far-out book here is a lead-time/coverage artifact, not demand softness. No discount or flash-sale alarm is raised for any date in this window.

---

## Summary

60-night window (2026-08-10 → 2026-10-08): 60 empty nights, 0.0% average forward occupancy, 0 pickup in the last 7 days. Night-level demand actions are suppressed by the short-lead gate; the day's work is lever execution, not rate action.

---

## Prioritised actions (executable today)

1. **Referral queue — 214 unsent.** The single largest ready-to-fire lever, and the cheapest. A wa.me sender shipped on 2026-08-08 (commit `81697b1`) after the queue sat consumer-less since May; the backlog has still grown 210 → 214, so confirm the sender is actually draining rather than waiting on a manual trigger. Past guests are the warmest near-term source for a direct-only property.
2. **Corporate outreach — 101 leads ready to contact now** (of 122 in pipeline), **40 of them high-priority.** This is the highest-value lever for the 31–60 day band and needs no spend decision. 4 pipeline rows have no email — enrich before they can be contacted.
3. **B2B partners — 4 due for follow-up.** Small list, quick to clear, and partner business is repeat business.
4. **Open leads — 2,126.** Nurture-only. Volume this large almost certainly needs a hygiene pass (dedupe, intent filter) before any bulk send; do not treat the raw count as 2,126 reachable prospects.
5. **Flash sale — hold.** 89 past runs, **0 tracked conversions** (`flash_conv_pct` is null). Flash sales are **UNPROVEN** on this data. Fix attribution tracking or A/B a small floor-protected batch before scaling — and note that the 114 never-posted `social_content_queue` rows mean attribution may never have had a chance to run, so "0 conversions" is as likely a measurement gap as a demand verdict.

**Not recommended today:** wiring the channel manager. The engineering is complete and staging-proven (`docs/CHANNEL_GOLIVE_RUNBOOK.md`); only a spend decision is outstanding, and it is Shan's to make. It stays out of the priority list until he raises it.

---

## Lever inventory (live)

| Lever | Count | Note |
|---|---|---|
| Referrals unsent | **214** | Sender shipped 08-08; confirm it drains |
| Corporate — ready to contact now | **101** (of 122 in pipeline) | Emailable, not bounced, 14d cooldown clear |
| Corporate — high-priority ready | **40** | Subset of the 101 |
| B2B partners due | **4** | |
| Open leads | 2,126 | Nurture-only; hygiene pass first |
| OTA channels active (rate plans) | 2 | Config only — no live sync |
| Flash runs / conversion | 89 / **null** | Unproven; tracking suspect |

*Footnote: 4 corporate pipeline rows have no contact email and cannot be contacted until enriched.*
