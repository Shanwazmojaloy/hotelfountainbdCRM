# Findings in the pg_cron agent layer — 2026-08-15

From reading the 35 SQL functions that pg_cron runs against production. Every
claim below was verified against the function source and, where possible, against
the data it produced.

---

## S-6 · Live bearer token inlined in a database function — HIGH

`fn_invoke_lighthouse_summary()` — `SECURITY DEFINER`, called nightly by
`lighthouse-summary-nightly`.

```
'Authorization', 'Bearer <live token>'
```

The token sits in `pg_proc`, readable by anything with catalog read access, and
is passed to `net.http_post`. It is the fourth live credential found today, after
the three in the edge functions.

Four jobs already do this correctly — `outreach-bot-daily`,
`weekly-retention-monday`, `lumea-flash-nudge` and `channel-drain-15min` pull
their credential from `vault.decrypted_secrets` at call time. So the right
pattern is already in the codebase; this function just does not use it.

**Committed redacted**, as `current_setting('app.lighthouse_token', true)`. The
deployed function still contains the literal until you rotate it.

---

## D-1 · Eight agents pick their tenant with an unordered `LIMIT 1` — HIGH

```sql
SELECT tenant_id INTO v_tid FROM reservations LIMIT 1;
```

In `agent_airline_leads_selfheal`, `agent_corporate_leads_selfheal`,
`agent_dynamic_pricing`, `agent_flash_sale`, `agent_ngo_leads_selfheal`,
`agent_seo_review_request`, `agent_send`, `agent_social_weekend_campaign`.

`reservations` holds two tenants: Hotel Fountain (1,731 rows) and
`156da579-073b-4a6e-bd64-e5a26c402d98` (1 row). A `LIMIT 1` with no `ORDER BY`
has no defined result — it returns whatever the plan yields first, which can
change with a different plan, a vacuum, or row movement.

Right now it happens to return Hotel Fountain. I checked. That is luck, not
correctness, and it is the same defect `agent_flash_sale` already carries a dated
`-- FIX 2026-08-09` comment for: that function was patched after a multi-tenant
leak, and the identical pattern was left in seven others.

This sits directly against the `crm_tenant` RLS work the rest of the audit
covered. Row-level security does not help when the code picks the tenant itself.

**Fix:** pass `tenant_id` as a parameter, or resolve it from a slug, as
`agent_flash_sale` now does.

## D-2 · `deal_value_bdt` stores a boolean — CONFIRMED IN DATA

`agent_corporate_spend_detect()`:

```sql
(l.notes::text ~ '৳([0-9,]+)')::integer,
```

`~` is the regex **match** operator. It returns true/false, so the cast yields
1 or 0 — never the taka amount the pattern captures. `ceo_pipeline` currently
holds 6 rows with `deal_value_bdt = 1` and 4 with `0`, against normal values like
360,000 and 2,628,000 from other paths.

Any pipeline total, forecast or sort by deal value is wrong by those rows.

**Fix:** `NULLIF(regexp_replace(substring(l.notes from '৳([0-9,]+)'), ',', '', 'g'), '')::integer`.

## D-3 · CEO inbox auto-approves anything it does not understand — MEDIUM

`ceo_process_inbox()` ends its decision `CASE` with:

```sql
ELSE 'APPROVE'
```

A `DECISION` message whose `data->>'deal_value'` is NULL fails both numeric
comparisons — NULL comparisons are NULL, not false — and falls through to the
`ELSE`. The default for an unrecognised request is approval, and the row is
written back as `'CEO: Auto-approved.'`.

**Fix:** make the fallback `ESCALATE`, or require a non-NULL `deal_value`.

## D-4 · The CEO pipeline cannot reach handover — MEDIUM

`agent_ceo_followup()` raises interest with `LEAST(60, interest_level+15)`, but
the handover gate two statements later is:

```sql
WHERE interest_level>=80 AND handover_ready=false;
```

60 < 80, so a lead advanced only by follow-ups can never become handover-ready.
`ceo_pipeline` today: 212 rows at interest 15 with zero handover-ready, and 16 at
90 — all 16 set by other paths that write the number directly.

**Fix:** raise the cap to 80+ or lower the gate.

## D-5 · Biman rows are attributed to a different partner — LOW

`agent_biman_site_visit_prep()` inserts a follow-up labelled
`'Biman Bangladesh Airlines'` with a ৳6,380,000 deal value, but sources
`partner_id` from:

```sql
FROM b2b_partners p WHERE p.agency_name='goFLY Travel' LIMIT 1
```

The row displays as Biman and joins as goFLY.

## D-6 · The Bengali copywriter writes English — LOW

`agent_copywriter_bn()` populates `body_bn`, then logs
`action='copy_en'` with `'English content written for all platforms'` under
`agent_id='lumea-copywriter-bn'`. The body text is English.

## D-7 · Occupancy hardcodes 28 rooms — LOW

`agent_ceo_followup`, `agent_content_strategist`, `agent_dynamic_pricing`,
`agent_generate_variations`, `agent_rooms_selfheal` and
`agent_social_weekend_campaign` all compute occupancy against a literal `28`.
`rooms` currently holds 28 for this tenant, so the number is right today and
silently wrong the moment a room is added, removed, or a second tenant's rooms
land in the count. `agent_flash_sale` was already fixed to count inventory
properly; the others were not.

## D-8 · `agent_ota_monitor()` runs twice per cycle — LOW

`lumea-ota-monitor` (jobid 31) and `lumea-ota-run` (jobid 40) have the same
schedule `0 */4 * * *` and the identical command. It is the only *textually*
identical pair among the 51 jobs — see D-9 for a functional duplicate that does
not look like one. Drop one.

**Fixed 2026-08-15.** jobid 40 set `active = false`.

## D-9 · Two cron jobs detect the same corporate prospect — MEDIUM

`lumea-corporate-detect` (jobid 30) and `lumea-corp-detect` (jobid 32) both run
`0 */6 * * *`. They are not textually identical — jobid 30 is an inline
`INSERT INTO leads`, jobid 32 calls `agent_corporate_spend_detect()` — but they
select the same guests with the same predicate (`total_amount >= 15000`,
`status = 'CHECKED_OUT'`, valid BD phone) and each inserts its own lead row.

Each has a dedupe guard (`LEFT JOIN leads ... WHERE l.id IS NULL`), but the guard
only sees rows committed before its own tick. Firing in the same minute, neither
sees the other, so every newly-qualifying guest gets **two** `CORPORATE_DETECT`
leads milliseconds apart. Only the phrasing differs:

| writer | note written |
| --- | --- |
| jobid 32 → `agent_corporate_spend_detect()` | `High spend guest — ৳52000 on 2026-05-22 …` |
| jobid 30 → inline SQL | `High spend: spent 52000 in one stay on 2026-05-22 …` |

Observed: all 10 `CORPORATE_DETECT` leads are 4 duplicate pairs plus 2
singletons from 2026-05-12 (before jobid 30 was scheduled). Confirmed same
guest by identical `name` + `phone`, created 2–18 ms apart:

- ARULNAYAGAN YASOTHAR · ৳52,000 · 2026-05-22
- V. DINESH KUMAR SIR · ৳18,000 · 2026-06-21
- TOMAS GUSTAVO VEGA PACHECO · ৳130,500 · 2026-07-18
- MD HAFIZUR RAHMAN · ৳27,000 · 2026-08-05

This also explains D-2's `0` vs `1` split exactly. `agent_corporate_spend_detect`
is the **only** writer of `ceo_pipeline`, so it promotes both writers' leads and
parses `notes` for the amount. The old boolean cast
`(notes ~ '৳([0-9,]+)')::integer` returned `1` for jobid 32's own notes and `0`
for jobid 30's ৳-less notes — the two populations, not two bugs.

**Fixed (parse only):** `agent_corporate_spend_detect` now falls back to
`substring(notes from 'spent ([0-9,]+)')`, so jobid 30's leads no longer promote
with a NULL deal value.

**Fixed 2026-08-15.** jobid 30 set `active = false` — it was the inline copy,
and jobid 32 does strictly more (writes `analyst_brief`, pushes to
`ceo_pipeline`, alerts the CEO agent, logs a run). `active = false` rather than
`cron.unschedule` so the definition survives and re-enabling is one call.

The existing 4 duplicate pairs were **not** deleted — removing live lead rows is
a separate decision.

## D-10 · `run_all_agents()` re-runs six agents that have their own job — MEDIUM

Disabling jobids 30 and 40 removed the two same-schedule duplicates, but not the
whole class. `run_all_agents()` (jobid 21, `0 0 * * *`) invokes 17 agents, and
six of them *also* hold their own pg_cron job whose schedule fires at 00:00:

| jobid | job | function | own schedule |
| --- | --- | --- | --- |
| 13 | `lumea-billing-heal` | `agent_billing_selfheal` | `0 */6 * * *` |
| 14 | `lumea-rooms-heal` | `agent_rooms_selfheal` | `*/30 * * * *` |
| 15 | `lumea-reservations-heal` | `agent_reservations_selfheal` | `0 * * * *` |
| 17 | `lumea-housekeeping-heal` | `agent_housekeeping_selfheal` | `*/15 * * * *` |
| 29 | `lumea-ceo-inbox` | `ceo_process_inbox` | `0 * * * *` |
| 34 | `lumea-referral-queue` | `agent_referral_queue_builder` | `*/30 * * * *` |

pg_cron runs jobs concurrently, so at 00:00 each of these executes twice at once.
Five are self-heal `UPDATE`s and re-running them is close to harmless. One is
not: **`agent_referral_queue_builder` inserts** into `referral_queue`, guarded
only by `LEFT JOIN referral_queue rq ON rq.reservation_id = r.id … AND rq.id IS
NULL` — the same read-then-write guard that let D-9 through, and it cannot see
an uncommitted concurrent insert.

**Latent, not realised.** `referral_queue` currently holds 214 rows across 214
distinct `reservation_id`s — zero duplicates. The race needs a guest to check out
in the window immediately before a midnight tick, which has not yet coincided.

Not fixed. The clean fix is a pair, applied together: a unique index on
`referral_queue(reservation_id)` plus `ON CONFLICT (reservation_id) DO NOTHING`
on the insert. The index alone would turn a silent duplicate into an exception
that aborts the whole midnight sweep, which is worse. jobids 31 and 32 were
instead moved off the 00:00 slot (`0 4,8,12,16,20` and `0 6,12,18`) — the same
treatment would work here but changes when the queue is built.

## D-11 · `agent_copywriter_bn()` scheduled twice at different cadences — LOW

jobid 42 `lumea-copy-bn` runs it `30 8 * * 1` (Mondays 08:30); jobid 48 runs the
same function `0 7 * * *` (daily 07:00). They never share a minute, so there is
no race — the daily job simply supersedes the weekly one, which has had no
independent effect since jobid 48 was added. Left alone: which cadence is
intended is a product question, not a bug.

---

## Scope note

35 functions were read. `run_all_agents()` calls 17 of them in one transaction
every midnight. Not every function reachable from those was extracted — the
snapshot covers what pg_cron invokes directly, not the full call graph.

D-2 and D-7 have since been fixed in the database (commit `9be0d94`) and D-9's
parse fallback in the commit that added this section. Everything else on this
page is still a finding, not a fix.
