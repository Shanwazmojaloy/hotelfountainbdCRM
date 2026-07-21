# Hotel Fountain — Advantage+ Launch Pack

Ready-to-build creative-led Advantage+ campaign feeding the CAPI funnel (Lead → Purchase).
Brand voice: refined, understated, authentic. Currency BDT. Avoid banned phrases
("groundbreaking", "next-level", "delight your senses", "unparalleled luxury").

## 1. Campaign structure (one campaign, one ad set)

| Setting | Value |
|---|---|
| Objective | **Sales** (website conversions) — lets us optimize on the Lead event now, switch to Purchase later |
| Campaign type | **Advantage+** (Advantage+ Sales) |
| Conversion location | Website |
| Dataset | Hotel Fountain Web (`847313361480402`) |
| Optimization event | **Lead** (start here — higher volume → exits learning faster) → switch to **Purchase** once ~50 Purchases/wk |
| Attribution | 7-day click / 1-day view (default) |
| Audience | Advantage+ (broad). Optional "audience suggestion" hint only — do not hard-segment |
| Geo | Bangladesh: Dhaka + Chattogram + Sylhet. (Add UAE/KSA/Qatar only if courting NRB/inbound) |
| Age / gender | 25–65, all |
| Languages | Bengali + English |
| Placements | Advantage+ (automatic — let Andromeda place) |
| Ads per ad set | **10–15 distinct concepts** (below) |

### Budget sizing (your decision — financial)
Pick a daily budget that can realistically produce **~50 optimization events/week** to exit
learning. At an early cost-per-Lead guess of ৳150–৳400, that's roughly **৳1,200–৳2,800/day**
to start. Begin conservative, hold the 7-day no-touch, then scale ≤20%/step while MER > 3.5.
Set the actual number yourself.

### Guardrails
- **7-day no-touch** after launch / any edit: no budget, copy, or creative changes.
- Don't run micro-variants (button color, headline swaps) — distinct **semantic intent** only.
- North-star: **MER = total BDT revenue ÷ total ad spend** (from the CRM, not Meta-reported).
- Re-run `scripts/capi_aplus_audit.mjs` weekly.

## 2. The 12 ads (4 concepts × 3 variants)

Char targets: Primary ~125, Headline ~40, Description ~30. CTA: **Book Now**. Each uses a real
asset from `/public/images`.

### Concept A — The Quiet Workation (near the airport)
Audience signal: business/remote stays. Asset focus: desk, Wi-Fi, calm rooms.

| # | Format | Asset | Primary text | Headline |
|---|---|---|---|---|
| A1 | Single image | `room-superior-deluxe.webp` | Minutes from Hazrat Shahjalal, a quiet room to actually get work done. High-speed Wi-Fi, 24/7 front office, from ৳5,000/night. | A calm base in Nikunja |
| A2 | Single image | `room-premium-deluxe-v2.webp` | Strong Wi-Fi, a real desk, and breakfast handled — so your day starts on time. Premium Deluxe from ৳4,500. | Built for the working stay |
| A3 | Reel 9:16 | short room pan + desk/Wi-Fi b-roll | Land, settle in, and stay productive. Refined rooms near the airport with round-the-clock service. | Work-ready in Dhaka |

### Concept B — The Considered Staycation
Audience signal: couples, anniversaries, weekend escapes. Asset focus: suite, evening light, breakfast.

| # | Format | Asset | Primary text | Headline |
|---|---|---|---|---|
| B1 | Single image | `room-royal-suite.webp` | An expansive suite, quiet evenings, and breakfast brought to you. The Royal Suite, from ৳9,000/night. | Slow down, in the city |
| B2 | Single image | `room-twin-deluxe.webp` | A considered escape a few minutes from home. Complimentary breakfast, attentive service, easy booking. | A weekend worth keeping |
| B3 | Reel 9:16 | suite + evening lighting + breakfast b-roll | Trade the routine for one well-kept evening. Refined comfort in the heart of Dhaka. | Your weekend, reserved |

### Concept C — Room for the Whole Group
Audience signal: families, colleagues travelling together. Asset focus: space, capacity.

| # | Format | Asset | Primary text | Headline |
|---|---|---|---|---|
| C1 | Single image | `room-twin-deluxe.webp` | Space for four, twin beds, and breakfast for everyone. Twin Deluxe from ৳6,000/night. | Room for the whole group |
| C2 | Single image | `room-royal-suite.webp` | Up to six in one suite — convenient for families and teams alike. Panoramic views, full service. | Six guests, one suite |
| C3 | Carousel | both family rooms + amenities | From twin rooms to the Royal Suite — comfortable stays for groups, with 24/7 room service. | Stays that fit everyone |

### Concept D — The Dhaka Arrival (transit / business traveller)
Audience signal: inbound/transit, last-minute, location-led. Asset focus: exterior, location, front office.

| # | Format | Asset | Primary text | Headline |
|---|---|---|---|---|
| D1 | Single image | `hero-exterior.webp` | Minutes from the airport in Nikunja-2. 24/7 front office, easy bKash or desk payment, from ৳4,000. | Close to the airport |
| D2 | Single image | `room-fountain-deluxe.webp` | Arriving late or leaving early? A dependable room and round-the-clock service whenever you land. | A reliable Dhaka stay |
| D3 | Reel 9:16 | exterior → lobby → room walk-through | A refined address in Nikunja, ready when you arrive. Front office open every hour. | Dhaka, on your schedule |

## 3. Build steps (Ads Manager)

1. **adsmanager.facebook.com** → **Create** → objective **Sales** → Continue.
2. Campaign type → **Advantage+ sales campaign**. Name: `HF — Advantage+ — 2026Q3`.
3. Conversion location **Website**; dataset **Hotel Fountain Web**; performance goal → **Maximize conversions**, conversion event **Lead**.
4. Set the daily budget (your number). Geo/age/languages per §1. Leave placements on Advantage+.
5. Ad level → add each of the 12 ads: upload the asset, paste Primary/Headline, CTA **Book Now**, destination URL `https://fountainbd.com` (modal opens for the Lead). Confirm the dataset/Pixel is attached at ad level.
6. Review → **Publish**. Then **do not touch for 7 days.**

## 4. After launch
- Day ~1: confirm numeric **EMQ ≥ 6** in dataset Overview/Diagnostics.
- Weekly: compute **MER** from CRM revenue; run the audit script; scale ≤20% if MER > 3.5 and creatives still distinct.
- Once Purchase volume is healthy (~50/wk): switch the optimization event from **Lead → Purchase** (this resets learning — accept one more 7-day window).
