# There are two schedulers — 2026-08-15

Found by asking why `overdue-alert` appeared in `workflow_runs` at 06:30 UTC when
no such job exists in `vercel.json`.

## The finding

`vercel.json` holds 13 cron jobs. The audit treated that file as the schedule.
It is roughly a fifth of it.

`cron.job` in Postgres holds **56 active pg_cron jobs**. Ten of them POST directly
to Supabase edge functions, bypassing Vercel entirely:

| pg_cron job | Schedule (UTC) | Invokes |
|---|---|---|
| `hf-booking-confirm` | `*/5 * * * *` | `wf-guest-emails` |
| `hf-review-request` | `*/15 * * * *` | `wf-guest-emails` |
| `hf-checkout-reminder` | `30 4 * * *` | `wf-checkout-alerts` |
| `hf-overdue-alert` | `30 6 * * *` | `wf-checkout-alerts` |
| `outreach-bot-daily` | `0 3 * * *` | `outreach-bot` |
| `hf-evening-report` | `0 15 * * *` | `wf-evening-report` |
| `hf-competitor-monitor` | `0 0 * * *` | `wf-competitor-monitor` |
| `hf-backup-verify` | `0 17 * * 0` | `wf-backup-verify` |
| `weekly-retention-monday` | `0 3 * * 1` | `weekly-retention` |
| `lumea-flash-nudge` | `15 11 * * *` | `wf-flash-nudge` |

The other 46 call SQL functions directly — `agent_*_selfheal()`,
`run_all_agents()`, `ceo_process_inbox()`, `agent_dynamic_pricing()` and so on.

## Why it matters: "the crons are paused" was never true

Vercel Cron Jobs were disabled from 2026-08-14 until 05:54 UTC on 2026-08-15.
Several decisions during the audit rested on that — including holding the H-12
fix behind "leave the crons disabled until this is fixed."

pg_cron does not know about that switch. From `cron.job_run_details`, over the
same window:

| Job | Runs | Last |
|---|---|---|
| `hf-booking-confirm` | 375 | 2026-08-15 07:10 |
| `hf-review-request` | 125 | 2026-08-15 07:00 |
| `hf-competitor-monitor` | 2 | 2026-08-15 00:00 |
| `hf-overdue-alert` | 2 | 2026-08-15 06:30 |
| `outreach-bot-daily` | 2 | 2026-08-15 03:00 |
| `hf-checkout-reminder` | 2 | 2026-08-15 04:30 |
| `hf-evening-report` | 1 | 2026-08-14 15:00 |
| `lumea-flash-nudge` | 1 | 2026-08-14 11:15 |

Roughly 510 scheduled invocations fired during the window everyone believed was
quiet. `hf-evening-report` ran on 2026-08-14 at 15:00 against the *old* Brevo
transport — one of the very runs the pause was meant to prevent. Zero pg_cron
runs failed at the scheduler level, which is precisely why nobody noticed: a
`net.http_post` that returns 200 is recorded as succeeded whether or not the
function it called did anything useful.

## Consequences

**1 · `outreach-bot` is scheduled, not dormant.** `outreach-bot-daily` fired at
03:00 UTC on 2026-08-14 and again on 2026-08-15. It will fire again tomorrow and
fail on the same unverified gmail sender (see S-5 in SECURITY_FINDINGS.md). This
was not a latent bug waiting for someone to turn it on; it has been running daily
the whole time.

**2 · Two workflows are scheduled twice, from two different codebases.**

| Workflow | Vercel cron | pg_cron | Result |
|---|---|---|---|
| competitor-monitor | `0 7 * * 1` → `/api/agents/competitor-monitor` | `0 0 * * *` → `wf-competitor-monitor` | two different implementations, owner gets both |
| backup-verification | `0 23 * * 0` → `/api/agents/backup-verification` | `0 17 * * 0` → `wf-backup-verify` | same, six hours apart on Sundays |

The Next.js route and the edge function are separate code with separate senders
and separate `workflow_runs` rows under the same names. Any reasoning that treats
a `workflow_name` as identifying one implementation is wrong for these two.

**3 · `wf-morning-briefing` and `wf-period-reports` are scheduled by nothing.**
Deployed, fixed, verified sending — and invoked by no cron in either scheduler.
The morning-briefing Vercel cron was removed in `349763a` as retired.

## What to do

1. Decide which scheduler owns which workflow, and delete the loser. Two
   schedulers with overlapping responsibilities is not redundancy; it is two
   places to forget to look.
2. Whatever the audit says about "crons", check `cron.job` as well as
   `vercel.json`. Pausing one does not pause the other.
3. Consider a CI check that diffs `vercel.json` crons against `cron.job` and
   fails on overlap. The tooling to do this does not exist yet.

> Not investigated here: the 46 SQL-only pg_cron jobs. They call functions with
> names like `run_all_agents()` and `agent_flash_sale()` on schedules as tight as
> every 15 minutes, against production data, and none of them appear in this
> repository. That is the same class of gap the 23 orphan edge functions were,
> and it is larger.
