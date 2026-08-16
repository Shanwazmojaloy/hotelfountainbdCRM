# Cold Email Sequence — BD Hotels v1

Loaded in the sales database as sequence `Cold Email — BD Hotels v1` (5 steps).
Merge fields: `{{first_name}}` `{{hotel_name}}` `{{city}}` `{{rooms}}` `{{sender_phone}}`

**Send from:** `shan@go.fountainbd.com` — never the root domain.
**Plain text only.** No HTML signature, no images, no tracking pixel on step 1.
**Any reply stops the sequence automatically** (DB trigger on inbound activity).

---

## Step 1 — Day 0
**Subject:** Quick question about {{hotel_name}}'s front desk

```
Hi {{first_name}},

I run Hotel Fountain, a 24-room property in Dhaka. Front desk work was eating our
staff alive — reservations in one register, payments in another, and no reliable
occupancy number before 11pm.

So we built our own system to run it. It now handles reservations, check-in/check-out,
housekeeping status, the guest ledger and the nightly revenue report in one place.
We have been running our own hotel on it daily.

A few hotels in {{city}} asked if they could use it, so we are opening a small pilot.

Worth a 15-minute look for {{hotel_name}}? I can show the actual system, not slides.

Shan
Hotel Fountain / Hotel Growth OS
{{sender_phone}}
```

*No-name variant of the opening line:* `Hi — I am writing to whoever handles operations at {{hotel_name}}.`

---

## Step 2 — Day 3
**Subject:** What it changed for us at Hotel Fountain

```
Hi {{first_name}},

Following up with something concrete rather than a pitch.

Since we moved Hotel Fountain onto the system:

- Check-in is a single screen instead of three registers
- Occupancy and revenue are visible at any hour, not after night audit
- Guest history, dues and folio charges sit against one reservation, so the
  balance is never guessed
- Booking confirmations and review requests go out on WhatsApp automatically

A {{rooms}}-room property has the same problems we did, just at a different scale.

I can walk you through it in 15 minutes on WhatsApp video, or in person if you are
in {{city}}. Which is easier?

Shan
```

*If `rooms` is unknown, replace that sentence with:* `A property your size has the same problems we did.`

---

## Step 3 — Day 7
**Subject:** The report most hotels cannot produce

```
Hi {{first_name}},

One question I ask every hotel manager: can you tell me last month's occupancy,
ADR and outstanding dues without opening a register?

Most cannot — not because they are careless, but because the data lives in four places.

That single report is usually what convinces people. It is generated from the same
data your front desk is already entering, so nobody does extra work to get it.

If that sounds useful for {{hotel_name}}, reply with a time this week and I will
show you ours.

Shan
```

---

## Step 4 — Day 14
**Subject:** Pilot pricing for {{city}} — closing soon

```
Hi {{first_name}},

We are taking a small number of pilot hotels at reduced pricing in exchange for
feedback and a testimonial once you are running.

Pilot terms:
- Setup and data migration: BDT 20,000 (normally 50,000)
- Monthly: from BDT 5,000
- Staff training included
- Month to month, cancel any time

After the pilot group is full this goes to standard pricing.

If {{hotel_name}} wants one of the slots, reply and I will send the details.

Shan
```

> Only send this if the pilot is genuinely limited. If you keep "closing soon" open for six months, the next 200 prospects will not believe anything you write.

---

## Step 5 — Day 25
**Subject:** Closing the file on {{hotel_name}}

```
Hi {{first_name}},

I have not heard back, so I will assume the timing is wrong and stop emailing.

If it becomes relevant later — new property, new season, staff turnover at the
front desk — just reply to this and I will pick it up.

Good luck with the season.

Shan
Hotel Fountain / Hotel Growth OS
```

**This is the highest-reply email in the sequence.** Do not drop it to save face.

---

## Editing the sequence

The bodies live in the database, not in this file. To change them:

```sql
update public.sequence_steps
   set body_template = $$...new text...$$
 where step_number = 2
   and sequence_id = (select id from public.sequences where name = 'Cold Email — BD Hotels v1');
```

To retire a version, set `sequences.is_active = false` and create `v2` rather than
editing in place — otherwise you lose the ability to compare reply rates between versions.
