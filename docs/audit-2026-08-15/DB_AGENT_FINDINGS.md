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
schedule `0 */4 * * *` and the identical command. It is the only exact duplicate
among the 51 jobs. Drop one.

---

## Scope note

35 functions were read. `run_all_agents()` calls 17 of them in one transaction
every midnight. Not every function reachable from those was extracted — the
snapshot covers what pg_cron invokes directly, not the full call graph.

Nothing here was changed in the database. These are findings, not fixes.
