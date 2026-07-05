# Lumea CRM — Privacy Policy (DRAFT TEMPLATE)

> ⚠️ **DRAFT — NOT LEGAL ADVICE.** Template for legal review. Fill every
> `[[PLACEHOLDER]]`. This policy covers TWO audiences that must be kept distinct:
> (a) our **Clients** (hotel staff who use Lumea) and (b) our Clients' **guests**
> whose data the hotels enter. For guest data we are a *processor*, not the
> controller — the hotel is the controller. Get this distinction reviewed.

**Controller of this website/account data:** [[LEGAL ENTITY]], [[ADDRESS]],
[[CONTACT EMAIL]]. **Effective:** [[DATE]].

## 1. Scope
This policy explains how we handle personal data of hotel staff who hold Lumea
accounts, and our role regarding hotel **guest** data. Guest data is governed by
the hotel's own privacy notice and our Data Processing Agreement with that hotel.

## 2. Data we process
**Staff / account holders (we are controller):** name, email, role, hashed
password, login/session metadata, IP for the network perimeter, audit logs.
**Guest data (we are processor for the hotel):** whatever the hotel enters —
typically guest name, contact details, ID/NID number, nationality, stay dates,
folio/financial records. We process it only to run the Service for that hotel.

## 3. Why & legal basis
Staff data: to provide and secure the Service (contract performance, legitimate
interest in security). Guest data: solely on the hotel's documented instructions
(the DPA). We do **not** use guest data for our own purposes and do **not** sell
any personal data.

## 4. Sub-processors
We use: Supabase (database hosting, [[region]]), Vercel (application hosting),
Brevo (transactional email), Google (Sheets backup, on the hotel's own sheet),
Meta (only if the hotel enables Facebook/Instagram marketing), Anthropic (AI
features, if enabled). [[Confirm the current list; keep it updated; the DPA must
let hotels object to new sub-processors.]]

## 5. Storage & isolation
Each hotel's data is isolated at the database level (Postgres row-level security
under per-tenant credentials). Data is hosted in [[Supabase region]]. Retention:
[[define — e.g. active for the term + N days after termination, then deleted]].

## 6. Security
Encryption in transit (HTTPS), secrets in a managed vault, role- and
network-scoped access, audit logging, login lockout, and database-enforced
tenant isolation. No system is perfectly secure; we notify affected Clients of a
material breach without undue delay per the DPA.

## 7. Rights
Staff account holders may request access, correction, or deletion of their
account data at [[CONTACT EMAIL]]. **Guest** rights requests are handled by the
hotel (the controller); we assist the hotel as required by the DPA.

## 8. Cookies
The CRM uses a first-party session cookie (`lumea_sess`) strictly to keep staff
logged in. [[List any analytics/marketing cookies if added.]]

## 9. Children
The Service is a business tool not directed at children.

## 10. Changes & contact
We may update this policy on notice. Questions: [[CONTACT EMAIL]], [[ADDRESS]].
