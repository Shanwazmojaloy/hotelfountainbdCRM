# `db/scheduled/` — the pg_cron layer

Snapshot taken 2026-08-15 of code that runs against production on a schedule and
had no source in this repository.

## What is here

| File | What it is |
|---|---|
| `_cron_jobs.sql` | All 51 `cron.job` rows as `cron.schedule(...)` statements |
| `_cron_jobs.md` | The same schedule as a readable table |
| `<function>.sql` | 35 `pg_get_functiondef()` dumps, one per function invoked by a job |

Every `.sql` file was verified byte-for-byte against
`md5(pg_get_functiondef(oid))` on the server at extraction time.

## Why this exists

`vercel.json` describes 13 cron jobs. It is not the schedule. `cron.job` holds 51
more, and they kept running through the window when the Vercel crons were
paused — see `docs/audit-2026-08-15/SCHEDULERS.md`.

The functions those jobs call — `run_all_agents()`, `agent_dynamic_pricing()`,
`agent_flash_sale()`, `ceo_process_inbox()` and the rest — write to `leads`,
`ceo_pipeline`, `folios`, `content_calendar` and `notifications_log` as often as
every 15 minutes. None of it could be reviewed, diffed, or restored from this
repo until now.

## This is a snapshot, not the source of truth

The database is still authoritative. Editing a file here changes nothing; these
are `CREATE OR REPLACE FUNCTION` statements dumped out of a live catalog, and
re-running one would deploy it, which is not what a reader expects from a `db/`
directory.

Treat it as a **read-only mirror for review and diffing**. To change one of these
functions, write a migration in `supabase/migrations/` and re-snapshot afterwards.
To check for drift, re-run the extraction and `git diff`.

## One redaction

`fn_invoke_lighthouse_summary.sql` had a live bearer token inlined in its
`net.http_post` headers. It is replaced with
`current_setting('app.lighthouse_token', true)`. The deployed function still has
the literal — see S-6 in `docs/audit-2026-08-15/DB_AGENT_FINDINGS.md`.

The seven jobs that inline the project **anon** key in an `apikey` header have it
replaced with `<ANON_KEY>` in `_cron_jobs.sql`. That key is public by design, so
this is hygiene rather than a leak. Four other jobs already pull their credential
from `vault.decrypted_secrets` at runtime, which is the pattern the other seven
should follow.
