# Cold email infrastructure — `go.fountainbd.com`

Checked live on 2026-08-16. **Everything below is based on what your DNS actually returns today, not on assumptions.**

## What is already there

| Record | Current value | Consequence |
|---|---|---|
| `fountainbd.com` NS | `isaac.ns.cloudflare.com`, `june.ns.cloudflare.com` | DNS is managed in **Cloudflare**. All records below go in the Cloudflare dashboard. |
| `fountainbd.com` MX | `1 smtp.google.com` | Google Workspace carries your real mail. **Do not touch this.** |
| `fountainbd.com` SPF | `v=spf1 include:_spf.google.com include:spf.brevo.com a mx include:_spf.mlsend.com ~all` | Already 3 includes + `a` + `mx`. Adding Resend here would push you toward the 10-lookup SPF limit — a hard fail, not a warning. |
| `_dmarc.fountainbd.com` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | **No enforcement.** Anyone can spoof your domain today and receivers are told to do nothing about it. Reports go to a Brevo address. |
| `go.fountainbd.com` A | `104.21.15.33`, `172.67.161.74` | **Already resolves** — Cloudflare proxy IPs, almost certainly a wildcard `*` record catching it. Harmless for email (A records are not used for mail) but it means the name is not "free"; check the Cloudflare DNS list before assuming you are creating something new. |

### Two things worth fixing regardless of this project

1. **`p=none` gives you no spoofing protection.** Once you are confident nothing legitimate is failing, move the root to `p=quarantine`. Read the reports first — do not jump straight to `p=reject`.
2. **The Brevo SPF include and the Brevo DMARC `rua` address.** Per your own memory notes the Brevo account is dead. A dead include is a wasted DNS lookup out of your budget of ten, and reports sent to a dead address are reports nobody reads. Verify before removing — some Deno functions still reference Brevo.

---

## Records to add for cold email

All added in Cloudflare, all **DNS-only (grey cloud)** — proxying breaks mail records.

### 1. Verify the subdomain in Resend first

Resend → Domains → Add Domain → `go.fountainbd.com`. It will generate a DKIM record with a **selector unique to your account**. Paste what Resend shows you; do not copy a selector from any guide, including this one.

The shape will be:

| Type | Name | Value |
|---|---|---|
| TXT | `resend._domainkey.go` | `p=MIGfMA0GCSq...` *(from Resend)* |

### 2. SPF for the subdomain only

| Type | Name | Value |
|---|---|---|
| TXT | `go` | `v=spf1 include:_spf.resend.com -all` |

`-all` (hard fail), not `~all`. This subdomain sends through exactly one provider, so there is no reason to be permissive — and a strict record here is one of the strongest signals you can give a receiver. The root domain's own SPF is untouched.

### 3. Return-Path / bounce domain

Resend will ask for a subdomain MX + TXT so bounces come back to it:

| Type | Name | Value |
|---|---|---|
| MX | `send.go` | `feedback-smtp.<region>.amazonses.com` *(priority 10, exact host from Resend)* |
| TXT | `send.go` | `v=spf1 include:amazonses.com -all` |

### 4. DMARC scoped to the subdomain

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc.go` | `v=DMARC1; p=quarantine; rua=mailto:shanwazahmed@fountainbd.com; adkim=s; aspf=s; pct=100` |

A subdomain DMARC record **overrides** the root policy for `go.` only. So cold email runs under strict alignment and enforcement while the hotel's booking mail stays on the root's `p=none` until you are ready to tighten it.

### 5. Verify before the first send

```bash
dig +short TXT go.fountainbd.com
dig +short TXT resend._domainkey.go.fountainbd.com
dig +short TXT _dmarc.go.fountainbd.com
```

Then send one email to a Gmail address you own, open **Show original**, and confirm three lines read `PASS`: SPF, DKIM, DMARC. **Do not start the sequence until all three pass.** Every email sent before that point is teaching Gmail that your new domain is suspicious.

---

## Warm-up schedule

A brand-new sending domain has no reputation. Volume without reputation is the definition of spam to a filter. This is the throttle — it is set by the `dailyCap` value on the n8n enrollment workflow.

| Period | Daily cap | What you are doing |
|---|---|---|
| Days 1–3 | **5** | Send to addresses you control (your own Gmail, a friend's). Open them. Reply to them. |
| Week 1 | **10** | Real prospects, highest ICP score first. Watch the bounce rate. |
| Week 2 | **20** | Only if week 1 bounced under 3%. |
| Week 3 | **40** | Only if week 2 stayed under 3% and nothing landed in spam. |
| Week 4+ | **40–60** | This is a comfortable ceiling for a one-person operation. Higher volume is not the constraint on your business; reply quality is. |

### Stop rules — these are not suggestions

- **Bounce rate above 5% in a run → stop and clean the list.** Two consecutive bad runs and a provider will suspend you before Gmail does.
- **Any spam complaint → that prospect is `do_not_contact` immediately.** Workflow 03 does this automatically; do not override it manually.
- **Never re-enrol a bounced address.** The database blocks it via `do_not_contact`; do not "fix" the flag to retry.
- **Never send Friday or Saturday.** The schedules are already Sun–Thu.

### What the numbers should look like when it is working

| Metric | Healthy | Investigate |
|---|---|---|
| Bounce rate | under 3% | over 5% |
| Open rate | 30–50% | under 20% — subject lines or reputation |
| Reply rate | 3–8% | under 2% — the offer, not the deliverability |
| Spam complaints | 0 | anything above 0 |

Your list came from public web research, so expect a **higher bounce rate than a purchased list would show on paper** — the difference is that yours bounces honestly instead of silently landing in spam traps. Clean as you go.

---

## The one mistake that would actually hurt you

Sending cold email from `fountainbd.com` — or adding `include:_spf.resend.com` to the root SPF and sending from `shan@fountainbd.com`. If that domain's reputation drops, **your hotel's booking confirmations stop reaching guests.** That is a revenue-affecting outage caused by a marketing experiment. The subdomain exists precisely so that the worst case is "we burned `go.` and start over with `mail.`" instead.
