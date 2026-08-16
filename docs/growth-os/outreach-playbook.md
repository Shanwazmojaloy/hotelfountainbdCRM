# Hotel Growth OS — Outreach Playbook

**Channel strategy:** email-first for scale, WhatsApp for warmth, phone for closing.
**Daily quota:** 20 emails (automated), 10 WhatsApps (manual), 10 calls (manual).
**Rule:** never send WhatsApp and email on the same day to the same hotel. It reads as desperate.

Merge fields: `{{hotel_name}}` `{{first_name}}` `{{city}}` `{{rooms}}` `{{sender_phone}}`
If `{{first_name}}` is unknown, the templates below have a no-name variant — use it. Never write "Dear Sir/Madam".

---

## 1. The positioning that works

You are not a software vendor. You are a hotelier who built something and is opening it up.

| Do not say | Say instead |
|---|---|
| "I have a CRM/PMS for sale" | "We run Hotel Fountain and built our own system to run it" |
| "AI-powered hotel management" | "One screen for check-in instead of three registers" |
| "Digital transformation" | "You can see occupancy at 4pm instead of after night audit" |
| "Book a demo" | "15 minutes, I will show you the live system" |
| "Special discount" | "Pilot slots — reduced setup in exchange for honest feedback" |

**The single strongest sentence you own:** *"We use this in our own hotel every day."*
No competitor selling into Bangladesh can say it. Lead with it in every channel.

---

## 2. Cold email sequence (loaded in the DB as `Cold Email — BD Hotels v1`)

Five steps over 25 days. Any reply stops the sequence automatically.

| Step | Day | Subject | Job of the email |
|---|---|---|---|
| 1 | 0 | Quick question about {{hotel_name}}'s front desk | Establish you are a hotelier, not a vendor |
| 2 | 3 | What it changed for us at Hotel Fountain | Concrete before/after, no adjectives |
| 3 | 7 | The report most hotels cannot produce | One sharp pain, one question |
| 4 | 14 | Pilot pricing for {{city}} — closing soon | Scarcity that is actually true |
| 5 | 25 | Closing the file on {{hotel_name}} | Permission to stop — pulls the most replies |

Full bodies live in `sequence_steps` in the database and are reproduced in `email-sequence.md`.

**Deliverability rules — non-negotiable**

1. Send from `go.fountainbd.com`, never the root domain. A burnt root domain kills your hotel's own booking confirmations.
2. Warm up: 10/day week 1, 20/day week 2, 40/day from week 3. Do not jump.
3. Plain text only. No tracking pixel on step 1. No images, no HTML signature block.
4. One link maximum, and not before step 3.
5. Bounce rate above 5% → stop and clean the list before sending again.

---

## 3. WhatsApp templates (manual send)

WhatsApp is where Bangladeshi hotel owners actually reply. Send between **11am–1pm** or **5pm–8pm**. Never Friday.

### WA-1 · First touch (English)

> Assalamu alaikum. I am Shan from Hotel Fountain in Dhaka — we run a 24-room property.
>
> We built our own system to handle reservations, check-in, housekeeping and the guest ledger, because nothing available here fit how we actually work.
>
> A few hotels asked if they could use it, so we are opening a small pilot. Would you be open to a 15-minute look? I can show you the live system, not slides.

### WA-1 · First touch (বাংলা)

> আসসালামু আলাইকুম। আমি শান, ঢাকার Hotel Fountain থেকে — আমাদের ২৪ রুমের একটি হোটেল আছে।
>
> রিজার্ভেশন, চেক-ইন, হাউসকিপিং আর গেস্ট লেজার — সব একসাথে চালানোর জন্য আমরা নিজেরাই একটা সিস্টেম তৈরি করেছি, কারণ বাজারে যা আছে তা আমাদের কাজের সাথে মেলেনি।
>
> কয়েকটি হোটেল জিজ্ঞেস করেছিল তারাও ব্যবহার করতে পারবে কিনা, তাই আমরা ছোট পরিসরে একটি পাইলট শুরু করছি। ১৫ মিনিট সময় দিতে পারবেন? স্লাইড না — সরাসরি লাইভ সিস্টেম দেখাব।

### WA-2 · After no reply (day 4)

> Hi {{first_name}}, following up on my message. If front desk paperwork is not a problem at {{hotel_name}} right now, just tell me and I will not chase. If it is, 15 minutes this week?

### WA-3 · After a demo, no decision (day 3)

> Thanks for the time on {{demo_day}}. One thing I did not mention: setup includes migrating your existing guest list and open reservations, and you keep your registers running in parallel for two weeks. Nobody has to jump without a net.
>
> Want me to send the pilot terms in writing?

### WA-4 · Re-activation (day 45, cold)

> Hi {{first_name}} — checking in once. Season is changing and front desk load usually changes with it. Still happy to show you the system whenever it is useful. No pressure either way.

---

## 4. Cold call script

**Goal of the call is NOT to sell. It is to book 15 minutes.** Talk for 30 seconds, then ask.

**Opening (get past the desk)**
> Assalamu alaikum. Ami Shan, Hotel Fountain theke. Manager sir ba owner sir er sathe kotha bolte parbo?
> *(If asked why)* Hotel operations niye ekta bishoy — ami nije hotel chalai, sales call na.

**To the decision-maker — 30 seconds**
> I run Hotel Fountain in Dhaka, 24 rooms. We built our own system for reservations, check-in, housekeeping and billing because nothing off the shelf fit us. A few hotels have asked to use it, so we are running a small pilot. I am not going to explain it on the phone — can I show you the live system for 15 minutes this week?

**Handling the four objections you will actually hear**

| They say | You say |
|---|---|
| "We already have software" | "Good — then you will know in 5 minutes whether ours is better. What are you using?" *(Log the answer. Competitor intel is worth the call even if they say no.)* |
| "We do everything by register, it works" | "It works until a guest disputes a balance or the owner asks for last month's dues. How long does that take you today?" |
| "Send me details on WhatsApp" | "I will — but the file will not show you much. Fifteen minutes on Tuesday or Wednesday?" *(Send anyway, then follow up.)* |
| "What is the price?" | "Starts at ৳5,000 a month. But I would not quote you before seeing your operation — the honest answer depends on your room count." |

**Always end with a specific slot.** "Sometime next week" is a no. "Tuesday 11am or Wednesday 4pm?" is a booking.

---

## 5. Discipline rules

- **Log every touch the same day.** An untracked call did not happen. Use the follow-up queue in `/crm/growth`.
- **Do not skip step 5.** The break-up email pulls more replies than steps 2–4 combined.
- **Do not discount before the demo.** Price objections before a demo are not price objections.
- **Track why you lose.** Every `lost` prospect gets a `lost_reason`. After 20 losses the pattern tells you what to build next — that is worth more than the 20 deals.
- **First 3 customers matter more than the next 30.** Over-serve them. They are your case studies.

---

## 6. Weekly KPI targets

| KPI | Target | Where to read it |
|---|---|---|
| New prospects added | 100/week | `vw_weekly_kpis.new_leads` |
| Calls made | 50/week | `vw_weekly_kpis.calls` |
| WhatsApps sent | 50/week | `vw_weekly_kpis.whatsapps` |
| Emails sent | 100/week | `vw_weekly_kpis.emails` |
| Demos delivered | 10/week | `vw_weekly_kpis.demos` |
| Proposals sent | 5/week | `vw_weekly_kpis.proposals` |
| New customers | 1–2/month | `vw_weekly_kpis.new_customers` |
| Live MRR | rising | `vw_weekly_kpis.live_mrr_bdt` |

If demos are below target, the problem is outreach volume.
If demos hit target but proposals do not, the problem is the demo.
If proposals hit target but customers do not, the problem is price or trust.
Diagnose in that order.
