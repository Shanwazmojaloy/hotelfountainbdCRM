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

**Fixed 2026-08-15**, as a pair in one transaction: unique index
`referral_queue_reservation_id_key` on `(reservation_id)` plus
`ON CONFLICT (reservation_id) DO NOTHING` on the insert. Applied together
deliberately — the index alone would turn a silent duplicate into an exception
that aborts the whole midnight sweep, which is worse than the bug. The redundant
non-unique `idx_referral_queue_reservation_id` was dropped; the unique index
serves the same lookups.

Two things checked before applying it, because a unique index can break existing
writers. `auto_referral_on_checkout` — the trigger that also inserts here — was
already carrying a bare `ON CONFLICT DO NOTHING`, written against a constraint
that did not exist, so it was a no-op guard that this index has now made real.
And `app/api/crm/referrals/route.ts`, the only app-side toucher, does `SELECT`
and `UPDATE` only. No writer can now throw on it.

## D-11 · `agent_copywriter_bn()` scheduled twice at different cadences — LOW

jobid 42 `lumea-copy-bn` runs it `30 8 * * 1` (Mondays 08:30); jobid 48 runs the
same function `0 7 * * *` (daily 07:00). They never share a minute, so there is
no race — the daily job simply supersedes the weekly one, which has had no
independent effect since jobid 48 was added. Left alone: which cadence is
intended is a product question, not a bug.

## D-12 · Three lead agents re-insert the same 15 leads on every run — HIGH

`agent_ngo_leads_selfheal`, `agent_airline_leads_selfheal` and
`agent_corporate_leads_selfheal` each held a hardcoded `VALUES` list of 5 leads
with `gen_random_uuid()` as the id, terminated by `ON CONFLICT DO NOTHING`.

The only unique constraint on `leads` is the primary key. `gen_random_uuid()`
never collides with it. So the `ON CONFLICT` clause was decorative — it had
nothing to conflict *on* — and all three functions inserted 5 brand-new rows on
every single invocation, indefinitely.

Measured before the fix:

| source | rows | distinct phones | copies of each |
| --- | --- | --- | --- |
| `NGO_CORPORATE` | 575 | 5 | 115 |
| `AIRLINE_CREW` | 575 | 5 | 115 |
| `CORPORATE` | 575 | 5 | 115 |

1,725 rows representing 15 real leads, accumulating since 2026-05-11 at roughly
15/day — the daily `run_all_agents()` sweep, not the weekly jobs 25/26/27, is
what set the cadence. `leads` currently holds 2,229 rows with a phone number
against 274 distinct `(phone, source)` pairs.

And each run logged `status = 'FIXED'`, `'Generated 5 NGO/corporate leads'`,
because `v_new` was the raw `ROW_COUNT` — always 5. The same defect class as
H-12 and D-9: **the failure reported itself as success**, so nothing in the
health surface ever showed it.

**Fixed 2026-08-15.** All three rewritten from `VALUES` to
`SELECT v.* FROM (VALUES …) AS v(…) WHERE NOT EXISTS (SELECT 1 FROM leads l
WHERE l.phone = v.phone AND l.source = v.source)`. Verified by running all three
inside a rolled-back transaction: `leads before=2229 after=2229 inserted=0`.
Previously the same three calls would have inserted 15. `v_new` is now honestly
0, so the run log reports `OK` rather than `FIXED`.

A unique index on `(phone, source)` would be the structural version of this
guard, but it cannot be created while the 1,725 duplicates exist. That is a
deletion, and deletions of live lead rows are the owner's call — see below.

**Not fixed — needs a decision:** the ~1,955 existing duplicate lead rows. They
are inert (the agents no longer add to them) but they inflate every lead count
and any per-lead outreach would target the same 15 contacts over and over.

## D-13 · `AI-*` lead sources re-propose contacts that already exist — LOW

Five sources (`AI-embassy`, `AI-corporate`, `AI-airlines`, `AI-travel`,
`AI-events`) gain 20 rows a week, most recently 2026-08-10, roughly half of them
repeating a phone number already present under the same source — 230 excess rows
across 439.

Unlike D-12 this is not a broken guard: the writer is not in this repo and not
in `pg_proc`, so it is one of the 23 deployed-but-uncommitted edge functions or
an external process. Re-proposing a known company on a later pass may well be
intended. Recorded rather than acted on, because the source is not visible from
here.

## D-14 · No review-request email has ever been sent — HIGH

pg_cron job 10 `hf-review-request` fires every 15 minutes and POSTs
`{"mode": "review_batch", "reservation_ids": [...]}` to `wf-guest-emails`.

`wf-guest-emails` — deployed version 37, and the committed source agrees —
handles exactly two modes, `confirmation` and `review`. `review_batch` is not
one of them, so every call for the life of this queue has fallen through to:

```
return new Response(JSON.stringify({ success: true, skipped: true, reason: 'unknown_mode' }), { headers: CORS })
```

HTTP 200, `success: true`. pg_cron records the POST as queued, `net._http_response`
records a 200, and the CRM health surface sees a working workflow. 96 no-op calls
a day.

The queue proves it. `review_queue` holds **1,372 rows and not one has ever
reached `sent`**:

| status | rows | note |
| --- | --- | --- |
| `skipped` | 1,347 | correct — the guest genuinely has no email on file |
| `pending` | 25 | deliverable, all 25 carry a `guest_email`; oldest queued 2026-05-03 |
| `sent` | 0 | — |

The 1,347 skips are honest behaviour recorded honestly. The 25 pending are real
review requests that have sat unsent for up to 104 days.

A second defect sits inside the same job. The batch was built as:

```sql
SELECT jsonb_agg(reservation_id) FROM review_queue
WHERE status = 'pending' AND send_after <= NOW()
LIMIT 10
```

`LIMIT 10` there bounds the *aggregate's* output — one row — not the rows being
aggregated. The array was unbounded: it would have carried all 25, not 10, and
grown without limit. Also unordered, the same class as the tenant `LIMIT 1`.

**Fixed 2026-08-15 (the parts that send nothing):**

- job 10's batch now uses `FROM (SELECT … ORDER BY send_after LIMIT 10) q` —
  verified to return 10 rather than 25.
- `supabase/functions/wf-guest-emails/index.ts` gains a `review_batch` handler.
  The review send is lifted into a shared `sendReviewFor()` so `review` and
  `review_batch` cannot drift apart, and the batch is capped at 10 in the
  function too, since a caller's `LIMIT` has already failed to bind once.

**Deployed 2026-08-15 on the owner's explicit go-ahead** (v38 → v40). Deploying
it uncovered two further defects that only a real run could expose, both fixed in
the same session:

*v38 → v39.* The first batch sent 1 and skipped 8 as `guest_has_no_email` — but
all 8 carried a deliverable address in `review_queue.guest_email`. `sendReviewFor`
read only `guests.email`; the queue had captured the address at queue time and the
sender threw it away. Now `toAddr = guests.email || review_queue.guest_email`, and
`notifications_log.metadata.email_source` records which one was used. The 8 rows
wrongly skipped by v38 were restored to `pending` before continuing — scoped to
rows skipped in the preceding 25 minutes *and* holding a queue email, so the 1,347
genuine historical skips were untouched. Verified: exactly 8 restored.

*v39 → v40.* The queue then stalled at 5 pending that never moved. All 5 point at
reservations that have since been deleted. `reservation_not_found` returned
without updating the row, so those 5 stayed `pending` — and being the oldest, they
permanently occupied the front of an `ORDER BY send_after` batch. The queue could
never drain. They are now marked `skipped`.

Final state of a queue that had never sent anything:

| status | rows |
| --- | --- |
| `sent` | 18 |
| `failed` | 2 |
| `skipped` | 1,352 |
| `pending` | 0 |

The 2 failures are junk addresses — one guest record holds the literal string
`1`. Resend rejected them and both were recorded as `failed` with the provider's
message, which is the point: the failure is loud. Job 10 was paused for the
duration of the fix and re-enabled after the queue drained.

## D-15 · Evening report divided occupancy by a hardcoded 24 — MEDIUM

`wf-evening-report` computed `const totalRooms = 24`. `rooms` holds **28** for
this tenant (33 across both tenants). The literal understated the denominator, so
every evening report the owner has read overstated occupancy by about 17% — 10
occupied rooms reported as 42% rather than 36%.

`wf-morning-briefing` was already correct: it counts
`rooms?tenant_id=eq.${TENANT}` and takes `.length`. The two reports disagreed
with each other daily and neither flagged it.

Fixed the same way — count the real inventory scoped to the tenant, with a
divide-by-zero guard. Same defect family as D-7, which found six DB functions
dividing by a literal `28`; this is the edge-function half of it, and the literal
there was not even the right number.

**Deployed 2026-08-15** as v40 (two files — `index.ts` plus the shared
`_shared/mailer.ts` it imports). Verified by live invoke rather than by a clean
deploy: `workflow_runs` now records `total_rooms: 28, email_sent: true` where the
15:00 run the same day recorded `total_rooms: 24`. The deploy-manifest guard
caught the drift before the commit and `DEPLOYED.json` was updated to v40 with
the new hash — the guard did exactly what it was built for.

---

## Scope note

35 functions were read. `run_all_agents()` calls 17 of them in one transaction
every midnight. Not every function reachable from those was extracted — the
snapshot covers what pg_cron invokes directly, not the full call graph.

D-2 and D-7 have since been fixed in the database (commit `9be0d94`) and D-9's
parse fallback in the commit that added this section. Everything else on this
page is still a finding, not a fix.
