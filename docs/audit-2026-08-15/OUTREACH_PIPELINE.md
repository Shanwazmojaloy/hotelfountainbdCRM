# The outreach reply pipeline — 2026-08-15

Investigated because the deal→payment chain has been dormant since May. The
answer turned out to be simpler than the two bugs I went looking for.

## What the data says

| Measure | Value |
|---|---|
| `corporate_leads` contacted | 122 |
| `corporate_leads` bounced_invalid | 5 |
| `corporate_leads` pending | 5 |
| `corporate_leads` **replied** | **0** |
| `outreach_log` outbound | 292, latest 2026-08-14 |
| `outreach_log` inbound | 5, latest 2026-05-21 |
| `outreach_log` rows with `audited_at` | 1, on 2026-05-20 |
| `notifications_log` rows for `deal-alert` | 0, ever |

The five inbound rows are not customer replies. They are development tests from
16–21 May, retro-tagged when the attribution guard shipped:

```
2026-05-21  [ATTRIBUTION_UNCERTAIN: retro-tagged] Re: Lumea CRM Demo
2026-05-20  [ATTRIBUTION_UNCERTAIN: retro-tagged] Test key fix
2026-05-18  [ATTRIBUTION_UNCERTAIN: retro-tagged] Test
2026-05-17  [ATTRIBUTION_UNCERTAIN: retro-tagged] Re: Hotel Management S…
2026-05-16  Test subject
```

**No corporate lead has ever replied.** The inbound path has therefore never
processed a real reply. It is untested, not proven broken — and the dormant
deal→payment chain is downstream of that, not a fault of its own.

## Two hypotheses, both checked, both wrong

**"Replies go to a mailbox nobody polls."** They don't. `tenants.hotel_email` is
`hotellfountainbd@gmail.com`, which is exactly the mailbox `reply-intake-poll`
reads over IMAP. The Next-side outreach sets both sender and `replyTo` from that
same field. Routing is consistent.

**"The IMAP poller has no credentials."** It has them. `GMAIL_USER` and
`GMAIL_APP_PASSWORD` are both configured in Vercel.

That second one is worth a note on method. The environment-variables page renders
28 rows; the project actually has 72 rows across 53 unique keys. Scrolling the
page and reading what is on screen gives a confident, wrong answer, because the
list virtualises rows out of the DOM. The correct enumeration came from the
dashboard's own API. **A UI that paginates silently is a source of false
negatives** — the same failure mode as reviewing this repo without the 23 edge
functions that were not in it.

## What is actually worth acting on

A 0% reply rate across 122 contacted companies is the finding. Before concluding
the outreach copy is at fault, fix deliverability — the sender is unverified, and
15 sends failed outright with *"The gmail.com domain is not verified"* (S-5 in
SECURITY_FINDINGS.md). Mail from an unverified domain that is not rejected
outright still tends to land in spam. A campaign nobody sees produces exactly
this data, and no amount of copy rewriting would change it.

Order of work: verify the sending domain, confirm delivery to a real external
inbox, then judge the copy against replies that had a chance of arriving.

## Not investigated

`REPLY_EMAIL` and `REPLY_INTAKE_URL` exist as environment variables and suggest a
second inbound path — perhaps a webhook — separate from the IMAP poll. Nothing
here establishes whether it is wired up or dead.

`ceo-auditor` runs on no cron of its own. It is triggered only by `reply-intake`
and `reply-intake-poll`, so it cannot run until a reply arrives. That is by
design, but it does mean the entire scoring, alerting and payment chain is gated
behind an event that has never occurred in production.
